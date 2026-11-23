/**
 * The Sovereign's Trial: round lifecycle (ADR-0004). Pure reducer + allow-list; side effects are descriptors.
 *
 *  IDLE ─START→ CONFIGURING ─OPENED→ SPINNING ─SPIN_RESULT→ RESOLVING_SECTOR ─WHEEL_SETTLED→
 *      LADDER_DECISION (─RISK→ SPINNING · ─CLAIM→ COLLECTING) | ROUND_OVER_BUST | COLLECTING (crown reached)
 *  COLLECTING ─COLLECTED→ ROUND_OVER_COLLECTED          any request failure → ERROR_RECOVERABLE
 */
import type { MachineSpec, Reduction } from '../core/machine';
import { ProviderErrorCode, type ProviderError, type ProviderResult } from '../core/result';
import { RUNGS, rungMultiplier, wheelFor, type LadderRules } from './ladder';
import type { CollectRequest, CollectResult, OpenTrialRequest, SpinRequest, SpinResult, TrialOpened, TrialParams } from './ports';

export const TrialState = {
  IDLE: 'IDLE',
  CONFIGURING: 'CONFIGURING',
  SPINNING: 'SPINNING',
  RESOLVING_SECTOR: 'RESOLVING_SECTOR',
  LADDER_DECISION: 'LADDER_DECISION',
  COLLECTING: 'COLLECTING',
  ROUND_OVER_BUST: 'ROUND_OVER_BUST',
  ROUND_OVER_COLLECTED: 'ROUND_OVER_COLLECTED',
  ERROR_RECOVERABLE: 'ERROR_RECOVERABLE',
} as const;
export type TrialState = (typeof TrialState)[keyof typeof TrialState];
export const TRIAL_STATE_ORDER: readonly TrialState[] = Object.values(TrialState);

export const EventType = {
  SET_PARAMS: 'SET_PARAMS',
  SET_TURBO: 'SET_TURBO',
  START: 'START',
  OPENED: 'OPENED',
  SPIN_RESULT: 'SPIN_RESULT',
  WHEEL_SETTLED: 'WHEEL_SETTLED',
  RISK: 'RISK',
  CLAIM: 'CLAIM',
  COLLECTED: 'COLLECTED',
  RETRY: 'RETRY',
  DISMISS_ERROR: 'DISMISS_ERROR',
  BALANCE_SYNCED: 'BALANCE_SYNCED',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export type TrialEvent =
  | { readonly type: typeof EventType.SET_PARAMS; readonly patch: Partial<TrialParams> }
  | { readonly type: typeof EventType.SET_TURBO; readonly enabled: boolean }
  | { readonly type: typeof EventType.START }
  | { readonly type: typeof EventType.OPENED; readonly result: ProviderResult<TrialOpened> }
  | { readonly type: typeof EventType.SPIN_RESULT; readonly result: ProviderResult<SpinResult> }
  | { readonly type: typeof EventType.WHEEL_SETTLED; readonly requestId: number }
  | { readonly type: typeof EventType.RISK }
  | { readonly type: typeof EventType.CLAIM }
  | { readonly type: typeof EventType.COLLECTED; readonly result: ProviderResult<CollectResult> }
  | { readonly type: typeof EventType.RETRY }
  | { readonly type: typeof EventType.DISMISS_ERROR }
  | { readonly type: typeof EventType.BALANCE_SYNCED; readonly balance: number };

const E = EventType;
const ALWAYS = [E.SET_TURBO] as const;
const BETWEEN = [E.SET_PARAMS, E.START, E.BALANCE_SYNCED, ...ALWAYS] as const;

export const ALLOWED_EVENTS: Readonly<Record<TrialState, readonly EventType[]>> = {
  IDLE: BETWEEN,
  CONFIGURING: [E.OPENED, ...ALWAYS],
  SPINNING: [E.SPIN_RESULT, ...ALWAYS],
  RESOLVING_SECTOR: [E.WHEEL_SETTLED, ...ALWAYS],
  LADDER_DECISION: [E.RISK, E.CLAIM, ...ALWAYS],
  COLLECTING: [E.COLLECTED, ...ALWAYS],
  ROUND_OVER_BUST: BETWEEN,
  ROUND_OVER_COLLECTED: BETWEEN,
  ERROR_RECOVERABLE: [E.RETRY, E.DISMISS_ERROR, E.BALANCE_SYNCED, ...ALWAYS],
};

export type SpinRecord = { readonly spin: number; readonly sectorIndex: number; readonly offset: number; readonly kind: 'advance' | 'curse'; readonly rung: number };

export type Trial = {
  readonly trialId: string;
  readonly params: TrialParams;
  readonly serverSeedHash: string;
  readonly nonce: number;
  /** 0 = staked, no rung yet · RUNGS = Sovereign Crown. */
  readonly rung: number;
  readonly multiplier: number;
  readonly spins: readonly SpinRecord[];
  /** Server answer held until the wheel settles. */
  readonly pending: SpinResult | null;
  readonly serverSeed: string | null;
  readonly payout: number;
};

export type InFlight =
  | { readonly kind: 'open'; readonly request: OpenTrialRequest }
  | { readonly kind: 'spin'; readonly request: SpinRequest }
  | { readonly kind: 'collect'; readonly request: CollectRequest };

export type TrialContext = {
  readonly state: TrialState;
  readonly balance: number;
  readonly params: TrialParams;
  readonly turbo: boolean;
  readonly trial: Trial | null;
  readonly requestSeq: number;
  readonly inFlight: InFlight | null;
  readonly error: (ProviderError & { readonly phase: InFlight['kind'] | 'precheck' }) | null;
  readonly roundsPlayed: number;
  readonly lastOutcome: { readonly kind: 'collected' | 'bust'; readonly amount: number; readonly rung: number } | null;
};

export function createInitialContext(params: TrialParams, balance: number): TrialContext {
  return { state: TrialState.IDLE, balance, params, turbo: false, trial: null, requestSeq: 0, inFlight: null, error: null, roundsPlayed: 0, lastOutcome: null };
}

export type TrialEffect =
  | { readonly type: 'OPEN_TRIAL'; readonly request: OpenTrialRequest }
  | { readonly type: 'LAUNCH_WHEEL'; readonly turbo: boolean; readonly rung: number }
  | { readonly type: 'REQUEST_SPIN'; readonly request: SpinRequest }
  | { readonly type: 'LAND_WHEEL'; readonly requestId: number; readonly sectorIndex: number; readonly offset: number; readonly kind: 'advance' | 'curse'; readonly turbo: boolean }
  | { readonly type: 'ABORT_WHEEL' }
  | { readonly type: 'REQUEST_COLLECT'; readonly request: CollectRequest }
  | { readonly type: 'SYNC_BALANCE' };

export const Reject = {
  INVALID_PARAMS: 'INVALID_PARAMS',
  STALE_REQUEST: 'STALE_REQUEST',
  DUPLICATE_RESPONSE: 'DUPLICATE_RESPONSE',
  NOTHING_TO_CLAIM: 'NOTHING_TO_CLAIM',
  NOTHING_TO_RETRY: 'NOTHING_TO_RETRY',
  MID_TRIAL_ERROR_REQUIRES_RETRY: 'MID_TRIAL_ERROR_REQUIRES_RETRY',
} as const;

type R = Reduction<TrialContext, TrialEffect>;
const ok = (ctx: TrialContext, effects: TrialEffect[] = [], note?: string): R => (note ? { accepted: true, ctx, effects, note } : { accepted: true, ctx, effects });
const no = (reason: string): R => ({ accepted: false, reason });

export function validateParams(rules: LadderRules, p: TrialParams): string[] {
  const errors: string[] = [];
  if (!rules.presets(p.presetId)) errors.push(`unknown preset ${p.presetId}`);
  if (!rules.betPresets.includes(p.bet)) errors.push('bet must be one of the table stakes');
  if (p.clientSeed.length === 0 || p.clientSeed.length > 64) errors.push('clientSeed must be 1–64 characters');
  return errors;
}

export function createTrialSpec(rules: LadderRules): MachineSpec<TrialState, TrialEvent, TrialContext, TrialEffect> {
  const toError = (ctx: TrialContext, error: ProviderError, phase: InFlight['kind'] | 'precheck', refund: number, extra: TrialEffect[] = []): R =>
    ok({ ...ctx, state: TrialState.ERROR_RECOVERABLE, error: { ...error, phase }, balance: ctx.balance + refund }, extra, `${error.code} during ${phase}`);

  const spinNow = (ctx: TrialContext, trial: Trial): R => {
    const requestId = ctx.requestSeq + 1;
    const request: SpinRequest = { requestId, trialId: trial.trialId, spin: trial.spins.length + 1 };
    return ok({ ...ctx, state: TrialState.SPINNING, requestSeq: requestId, inFlight: { kind: 'spin', request }, trial: { ...trial, pending: null } }, [
      { type: 'LAUNCH_WHEEL', turbo: ctx.turbo, rung: trial.rung },
      { type: 'REQUEST_SPIN', request },
    ]);
  };

  const collectNow = (ctx: TrialContext, trial: Trial, note?: string): R => {
    const requestId = ctx.requestSeq + 1;
    const request: CollectRequest = { requestId, trialId: trial.trialId };
    return ok({ ...ctx, state: TrialState.COLLECTING, requestSeq: requestId, inFlight: { kind: 'collect', request }, trial }, [{ type: 'REQUEST_COLLECT', request }], note);
  };

  const reduce = (ctx: TrialContext, ev: TrialEvent): R => {
    switch (ev.type) {
      case E.SET_TURBO:
        return ok({ ...ctx, turbo: ev.enabled });

      case E.SET_PARAMS: {
        const params = { ...ctx.params, ...ev.patch };
        const errors = validateParams(rules, params);
        if (errors.length) return no(`${Reject.INVALID_PARAMS}: ${errors.join('; ')}`);
        return ok({ ...ctx, params, state: TrialState.IDLE, trial: null });
      }

      case E.BALANCE_SYNCED:
        return ok({ ...ctx, balance: ev.balance });

      case E.START: {
        const errors = validateParams(rules, ctx.params);
        if (errors.length) return no(`${Reject.INVALID_PARAMS}: ${errors.join('; ')}`);
        if (ctx.balance < ctx.params.bet) {
          return toError(ctx, { code: ProviderErrorCode.INSUFFICIENT_FUNDS, message: 'The treasury is too thin for this stake.', recoverable: true }, 'precheck', 0);
        }
        const requestId = ctx.requestSeq + 1;
        const request: OpenTrialRequest = { ...ctx.params, requestId };
        return ok(
          { ...ctx, state: TrialState.CONFIGURING, requestSeq: requestId, inFlight: { kind: 'open', request }, balance: ctx.balance - ctx.params.bet, trial: null, error: null, lastOutcome: null },
          [{ type: 'OPEN_TRIAL', request }],
        );
      }

      case E.OPENED: {
        const f = ctx.inFlight;
        if (!f || f.kind !== 'open' || ev.result.requestId !== f.request.requestId) return no(Reject.STALE_REQUEST);
        if (!ev.result.ok) return toError({ ...ctx, inFlight: null }, ev.result.error, 'open', f.request.bet);
        const r = ev.result.value;
        const trial: Trial = { trialId: r.trialId, params: f.request, serverSeedHash: r.serverSeedHash, nonce: r.nonce, rung: 0, multiplier: 0, spins: [], pending: null, serverSeed: null, payout: 0 };
        // The first spin follows the stake automatically.
        return spinNow({ ...ctx, balance: r.balanceAfter, inFlight: null }, trial);
      }

      case E.SPIN_RESULT: {
        const f = ctx.inFlight;
        const trial = ctx.trial;
        if (!f || f.kind !== 'spin' || !trial || ev.result.requestId !== f.request.requestId) return no(Reject.STALE_REQUEST);
        if (trial.pending) return no(Reject.DUPLICATE_RESPONSE);
        if (!ev.result.ok) return toError(ctx, ev.result.error, 'spin', 0, [{ type: 'ABORT_WHEEL' }]);
        const r = ev.result.value;
        // Client cross-check against the shared wheel layout and ladder maths (ADR-0005).
        const preset = rules.presets(trial.params.presetId);
        const sector = preset ? wheelFor(preset, trial.rung)[r.sectorIndex] : undefined;
        const expectRung = r.kind === 'advance' ? trial.rung + 1 : trial.rung;
        const expectMult = preset ? rungMultiplier(preset, expectRung, rules.houseEdge) : -1;
        const mismatch =
          !sector || sector.kind !== r.kind
            ? `Sector ${r.sectorIndex} is not a ${r.kind} on rung ${trial.rung}.`
            : r.rung !== expectRung || Math.abs(r.multiplier - expectMult) > 1e-9
              ? `Server rung/multiplier ${r.rung}/×${r.multiplier} ≠ client ${expectRung}/×${expectMult}.`
              : r.spin !== f.request.spin
                ? `Server answered spin ${r.spin}, expected ${f.request.spin}.`
                : null;
        if (mismatch) return toError(ctx, { code: ProviderErrorCode.VALIDATION, message: mismatch, recoverable: true }, 'spin', 0, [{ type: 'ABORT_WHEEL' }]);
        return ok({ ...ctx, state: TrialState.RESOLVING_SECTOR, trial: { ...trial, pending: r } }, [
          { type: 'LAND_WHEEL', requestId: f.request.requestId, sectorIndex: r.sectorIndex, offset: r.offset, kind: r.kind, turbo: ctx.turbo },
        ]);
      }

      case E.WHEEL_SETTLED: {
        const f = ctx.inFlight;
        const trial = ctx.trial;
        if (!f || f.kind !== 'spin' || !trial || ev.requestId !== f.request.requestId || !trial.pending) return no(Reject.STALE_REQUEST);
        const r = trial.pending;
        const spins = [...trial.spins, { spin: r.spin, sectorIndex: r.sectorIndex, offset: r.offset, kind: r.kind, rung: r.rung }];
        if (r.kind === 'curse') {
          return ok(
            {
              ...ctx,
              state: TrialState.ROUND_OVER_BUST,
              inFlight: null,
              roundsPlayed: ctx.roundsPlayed + 1,
              lastOutcome: { kind: 'bust', amount: 0, rung: trial.rung },
              trial: { ...trial, spins, pending: null, serverSeed: r.serverSeed },
            },
            [],
            `cursed on spin ${r.spin}`,
          );
        }
        const next: Trial = { ...trial, spins, pending: null, rung: r.rung, multiplier: r.multiplier };
        if (r.rung >= RUNGS) return collectNow({ ...ctx, inFlight: null }, next, 'Sovereign Crown reached: auto-claim');
        return ok({ ...ctx, state: TrialState.LADDER_DECISION, inFlight: null, trial: next });
      }

      case E.RISK: {
        const trial = ctx.trial;
        if (!trial) return no(Reject.STALE_REQUEST);
        return spinNow(ctx, trial);
      }

      case E.CLAIM: {
        const trial = ctx.trial;
        if (!trial || trial.rung < 1) return no(Reject.NOTHING_TO_CLAIM);
        return collectNow(ctx, trial);
      }

      case E.COLLECTED: {
        const f = ctx.inFlight;
        const trial = ctx.trial;
        if (!f || f.kind !== 'collect' || !trial || ev.result.requestId !== f.request.requestId) return no(Reject.STALE_REQUEST);
        if (!ev.result.ok) return toError(ctx, ev.result.error, 'collect', 0);
        const r = ev.result.value;
        const expected = Math.floor(trial.params.bet * trial.multiplier);
        if (r.payout !== expected) {
          return toError(ctx, { code: ProviderErrorCode.VALIDATION, message: `Server payout ${r.payout} ≠ client ${expected}.`, recoverable: true }, 'collect', 0);
        }
        return ok({
          ...ctx,
          state: TrialState.ROUND_OVER_COLLECTED,
          inFlight: null,
          balance: r.balanceAfter,
          roundsPlayed: ctx.roundsPlayed + 1,
          lastOutcome: { kind: 'collected', amount: r.payout, rung: trial.rung },
          trial: { ...trial, payout: r.payout, serverSeed: r.serverSeed },
        });
      }

      case E.RETRY: {
        const f = ctx.inFlight;
        const err = ctx.error;
        if (!f || !err || (err.phase !== 'spin' && err.phase !== 'collect')) return no(Reject.NOTHING_TO_RETRY);
        // Same requestId: the provider is idempotent, so a lost response is recovered, never re-applied.
        if (f.kind === 'spin') {
          return ok({ ...ctx, state: TrialState.SPINNING, error: null }, [
            { type: 'LAUNCH_WHEEL', turbo: ctx.turbo, rung: ctx.trial?.rung ?? 0 },
            { type: 'REQUEST_SPIN', request: f.request },
          ], `retry #${f.request.requestId}`);
        }
        if (f.kind === 'collect') return ok({ ...ctx, state: TrialState.COLLECTING, error: null }, [{ type: 'REQUEST_COLLECT', request: f.request }], `retry #${f.request.requestId}`);
        return no(Reject.NOTHING_TO_RETRY);
      }

      case E.DISMISS_ERROR: {
        const err = ctx.error;
        if (err && (err.phase === 'spin' || err.phase === 'collect')) return no(Reject.MID_TRIAL_ERROR_REQUIRES_RETRY);
        return ok({ ...ctx, state: TrialState.IDLE, error: null, inFlight: null, trial: null }, [{ type: 'SYNC_BALANCE' }]);
      }
    }
  };

  return { allowed: ALLOWED_EVENTS, reduce };
}
