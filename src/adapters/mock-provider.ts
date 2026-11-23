/**
 * In-browser stand-in for the royal court's game server (ADR-0005). It owns the treasury,
 * the secret seeds and the trial state. The client only sees outcomes and, at the end, the seed.
 */
import { ProviderErrorCode, type ProviderError, type ProviderResult } from '../core/result';
import { RUNGS, rungMultiplier, wheelFor, type LadderRules } from '../engine/ladder';
import { validateParams } from '../engine/machine';
import type { CollectRequest, CollectResult, OpenTrialRequest, SpinRequest, SpinResult, TrialOpened, TrialParams, TrialProvider } from '../engine/ports';
import { deriveSpin, randomSeedHex, sha256Hex } from './fairness';

export const ForcedOutcome = {
  NONE: 'none',
  ADVANCE: 'advance',
  CURSE: 'curse',
  NETWORK_ERROR: 'networkError',
  LOST_RESPONSE: 'lostResponse',
  TIMEOUT: 'timeout',
} as const;
export type ForcedOutcome = (typeof ForcedOutcome)[keyof typeof ForcedOutcome];

export const FORCED_LABELS: Readonly<Record<ForcedOutcome, string>> = {
  none: 'None (fair wheel)',
  advance: 'Next spin: advance (breaks fairness)',
  curse: 'Next spin: curse (breaks fairness)',
  networkError: 'Next request: network error',
  lostResponse: 'Next request: applied, answer lost',
  timeout: 'Next request: no answer (timeout)',
};

export type MockSettings = { readonly latencyMs: readonly [number, number]; readonly errorRate: number; readonly forced: ForcedOutcome };
export const DEFAULT_MOCK_SETTINGS: MockSettings = { latencyMs: [140, 360], errorRate: 0, forced: ForcedOutcome.NONE };

type ServerTrial = {
  readonly id: string;
  readonly params: TrialParams;
  readonly serverSeed: string;
  readonly nonce: number;
  rung: number;
  spins: number;
  status: 'active' | 'bust' | 'collected';
  tampered: boolean;
};

type Work<T> = { ok: true; value: T } | { ok: false; error: ProviderError };

export type MockProviderOptions = {
  readonly rules: LadderRules;
  readonly balance: number;
  readonly settings?: Partial<MockSettings>;
  readonly delay?: (ms: number) => Promise<void>;
  readonly seedSource?: () => string;
};

const defaultDelay = (ms: number) => new Promise<void>((r) => globalThis.setTimeout(r, ms));

export class MockProvider implements TrialProvider {
  readonly id = 'mock';
  private settings: MockSettings;
  private wallet: number;
  private nonce = 0;
  private version = 0;
  private readonly trials = new Map<string, ServerTrial>();
  private readonly responses = new Map<string, ProviderResult<unknown>>();
  private readonly listeners = new Set<() => void>();
  private readonly rules: LadderRules;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly seedSource: () => string;

  constructor(o: MockProviderOptions) {
    this.rules = o.rules;
    this.wallet = o.balance;
    this.settings = { ...DEFAULT_MOCK_SETTINGS, ...o.settings };
    this.delay = o.delay ?? defaultDelay;
    this.seedSource = o.seedSource ?? (() => randomSeedHex(16));
  }

  // ------------------------------------------------------------ inspector surface
  getSettings(): MockSettings {
    return this.settings;
  }
  updateSettings(patch: Partial<MockSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.notify();
  }
  getWallet(): number {
    return this.wallet;
  }
  setWallet(v: number): void {
    this.wallet = Math.max(0, Math.round(v));
    this.notify();
  }
  wasTampered(trialId: string): boolean {
    return this.trials.get(trialId)?.tampered ?? false;
  }
  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  getVersion(): number {
    return this.version;
  }

  // ------------------------------------------------------------ TrialProvider
  getBalance(): Promise<number> {
    return Promise.resolve(this.wallet);
  }

  openTrial(req: OpenTrialRequest): Promise<ProviderResult<TrialOpened>> {
    return this.handle<TrialOpened>(`open:${req.requestId}`, req.requestId, async () => {
      const errors = validateParams(this.rules, req);
      if (errors.length) return this.fail(ProviderErrorCode.VALIDATION, errors.join('; '));
      if (this.wallet < req.bet) return this.fail(ProviderErrorCode.INSUFFICIENT_FUNDS, 'Insufficient funds in the royal treasury.');
      const serverSeed = this.seedSource();
      const nonce = ++this.nonce;
      const id = `T${String(nonce).padStart(5, '0')}`;
      const { requestId: _r, ...params } = req;
      this.trials.set(id, { id, params, serverSeed, nonce, rung: 0, spins: 0, status: 'active', tampered: false });
      this.wallet -= req.bet;
      this.notify();
      return { ok: true, value: { trialId: id, serverSeedHash: await sha256Hex(serverSeed), nonce, balanceAfter: this.wallet } };
    });
  }

  spin(req: SpinRequest): Promise<ProviderResult<SpinResult>> {
    return this.handle<SpinResult>(`spin:${req.requestId}`, req.requestId, async (forced): Promise<Work<SpinResult>> => {
      const t = this.trials.get(req.trialId);
      if (!t) return this.fail(ProviderErrorCode.ROUND_NOT_FOUND, `Trial ${req.trialId} not found.`, false);
      if (t.status !== 'active') return this.fail(ProviderErrorCode.VALIDATION, 'Trial already settled.');
      if (req.spin !== t.spins + 1) return this.fail(ProviderErrorCode.VALIDATION, `Expected spin ${t.spins + 1}.`);
      const preset = this.rules.presets(t.params.presetId);
      if (!preset) return this.fail(ProviderErrorCode.VALIDATION, 'Unknown preset.');
      const wheel = wheelFor(preset, t.rung);
      let { sectorIndex, offset } = await deriveSpin(t.serverSeed, t.params.clientSeed, t.nonce, req.spin, preset.sectors);
      if (forced === ForcedOutcome.ADVANCE || forced === ForcedOutcome.CURSE) {
        const want = forced === ForcedOutcome.ADVANCE ? 'advance' : 'curse';
        const pick = wheel.find((s, i) => s.kind === want && i >= sectorIndex) ?? wheel.find((s) => s.kind === want);
        if (pick && pick.index !== sectorIndex) {
          sectorIndex = pick.index;
          offset = 0.5;
          t.tampered = true;
        }
      }
      const sector = wheel[sectorIndex];
      const kind = sector?.kind ?? 'curse';
      t.spins = req.spin;
      if (kind === 'advance') t.rung += 1;
      else t.status = 'bust';
      this.notify();
      return {
        ok: true,
        value: {
          spin: req.spin,
          sectorIndex,
          offset,
          kind,
          rung: t.rung,
          multiplier: rungMultiplier(preset, t.rung, this.rules.houseEdge),
          serverSeed: kind === 'curse' ? t.serverSeed : null,
        },
      };
    }, true);
  }

  collect(req: CollectRequest): Promise<ProviderResult<CollectResult>> {
    return this.handle<CollectResult>(`collect:${req.requestId}`, req.requestId, async () => {
      const t = this.trials.get(req.trialId);
      if (!t) return this.fail(ProviderErrorCode.ROUND_NOT_FOUND, `Trial ${req.trialId} not found.`, false);
      if (t.status !== 'active') return this.fail(ProviderErrorCode.VALIDATION, 'Trial already settled.');
      if (t.rung < 1) return this.fail(ProviderErrorCode.VALIDATION, 'Nothing to claim yet.');
      const preset = this.rules.presets(t.params.presetId);
      if (!preset) return this.fail(ProviderErrorCode.VALIDATION, 'Unknown preset.');
      const multiplier = rungMultiplier(preset, Math.min(t.rung, RUNGS), this.rules.houseEdge);
      const payout = Math.floor(t.params.bet * multiplier);
      t.status = 'collected';
      this.wallet += payout;
      this.notify();
      return { ok: true, value: { payout, multiplier, rung: t.rung, balanceAfter: this.wallet, serverSeed: t.serverSeed } };
    });
  }

  /** Latency, fault injection and idempotency shared by every request. */
  private async handle<T>(key: string, requestId: number, work: (forced: ForcedOutcome) => Promise<Work<T>>, isSpin = false): Promise<ProviderResult<T>> {
    // Outcome forcing (advance/curse) waits for the next *spin*; transport faults hit the next request of any kind.
    const pending = this.settings.forced;
    const applies = pending !== ForcedOutcome.NONE && (isSpin || (pending !== ForcedOutcome.ADVANCE && pending !== ForcedOutcome.CURSE));
    const forced = applies ? pending : ForcedOutcome.NONE;
    if (applies) this.updateSettings({ forced: ForcedOutcome.NONE });
    const [min, max] = this.settings.latencyMs;
    await this.delay(min + Math.random() * Math.max(0, max - min));

    const cached = this.responses.get(key);
    if (cached) return cached as ProviderResult<T>;

    if (forced === ForcedOutcome.TIMEOUT) {
      await this.delay(30_000);
      return { ok: false, requestId, error: { code: ProviderErrorCode.TIMEOUT, message: 'Late answer after the client gave up.', recoverable: true } };
    }
    if (forced === ForcedOutcome.NETWORK_ERROR || (forced === ForcedOutcome.NONE && Math.random() < this.settings.errorRate)) {
      return { ok: false, requestId, error: { code: ProviderErrorCode.NETWORK, message: 'The courier never reached the court.', recoverable: true } };
    }
    const r = await work(forced);
    const result: ProviderResult<T> = r.ok ? { ok: true, requestId, value: r.value } : { ok: false, requestId, error: r.error };
    if (result.ok) this.responses.set(key, result);
    if (forced === ForcedOutcome.LOST_RESPONSE) {
      return { ok: false, requestId, error: { code: ProviderErrorCode.NETWORK, message: 'Answer lost on the road (the court did apply it).', recoverable: true } };
    }
    return result;
  }

  private fail(code: ProviderErrorCode, message: string, recoverable = true): { ok: false; error: ProviderError } {
    return { ok: false, error: { code, message, recoverable } };
  }

  private notify(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
}
