/**
 * TrialController: runs the trial machine and interprets effects against the TrialProvider and WheelPort.
 * Framework-free (ADR-0001). subscribe/getSnapshot for useSyncExternalStore.
 */
import type { Clock, TimerHandle } from '../core/clock';
import { Machine, type TransitionRecord } from '../core/machine';
import { ProviderErrorCode, type ProviderResult } from '../core/result';
import type { LadderRules } from './ladder';
import { createInitialContext, createTrialSpec, EventType, TrialState, type TrialContext, type TrialEffect, type TrialEvent } from './machine';
import { createImmediateWheel, type TrialParams, type TrialProvider, type WheelPort } from './ports';

export type ControllerCue =
  | { readonly type: 'response'; readonly kind: 'open' | 'spin' | 'collect'; readonly ok: boolean; readonly latencyMs: number; readonly requestId: number }
  | { readonly type: 'landing'; readonly sectorIndex: number; readonly kind: 'advance' | 'curse' };

export type TrialControllerOptions = {
  readonly provider: TrialProvider;
  readonly clock: Clock;
  readonly rules: LadderRules;
  readonly params: TrialParams;
  readonly balance: number;
  readonly wheel?: WheelPort;
  readonly requestTimeoutMs?: number;
  readonly isoNow?: () => string;
};

export class TrialController {
  readonly rules: LadderRules;
  private readonly machine: Machine<TrialState, TrialEvent, TrialContext, TrialEffect>;
  private provider: TrialProvider;
  private wheel: WheelPort;
  private readonly clock: Clock;
  private readonly timeoutMs: number;
  private timeout: TimerHandle | null = null;
  private readonly cueListeners = new Set<(c: ControllerCue) => void>();

  constructor(o: TrialControllerOptions) {
    this.rules = o.rules;
    this.provider = o.provider;
    this.wheel = o.wheel ?? createImmediateWheel();
    this.clock = o.clock;
    this.timeoutMs = o.requestTimeoutMs ?? 8000;
    this.machine = new Machine(createTrialSpec(o.rules), createInitialContext(o.params, o.balance), {
      clock: o.clock,
      runEffect: (effect: TrialEffect) => this.run(effect),
      ...(o.isoNow ? { isoNow: o.isoNow } : {}),
    });
  }

  readonly subscribe = (l: () => void) => this.machine.subscribe(l);
  readonly getSnapshot = (): TrialContext => this.machine.getSnapshot();
  onTransition(l: (r: TransitionRecord<TrialState>, ctx: TrialContext) => void) {
    return this.machine.onTransition(l);
  }
  onCue(l: (c: ControllerCue) => void): () => void {
    this.cueListeners.add(l);
    return () => this.cueListeners.delete(l);
  }
  getHistory() {
    return this.machine.getHistory();
  }
  clearHistory() {
    this.machine.clearHistory();
  }

  start() {
    this.machine.dispatch({ type: EventType.START });
  }
  risk() {
    this.machine.dispatch({ type: EventType.RISK });
  }
  claim() {
    this.machine.dispatch({ type: EventType.CLAIM });
  }
  setParams(patch: Partial<TrialParams>) {
    this.machine.dispatch({ type: EventType.SET_PARAMS, patch });
  }
  setTurbo(enabled: boolean) {
    this.machine.dispatch({ type: EventType.SET_TURBO, enabled });
  }
  retry() {
    this.machine.dispatch({ type: EventType.RETRY });
  }
  dismissError() {
    this.machine.dispatch({ type: EventType.DISMISS_ERROR });
  }
  syncBalance() {
    this.run({ type: 'SYNC_BALANCE' });
  }

  /** Primary action: start between rounds, otherwise risk the next spin. */
  primary() {
    const s = this.getSnapshot().state;
    if (s === TrialState.LADDER_DECISION) this.risk();
    else this.start();
  }

  attachWheel(wheel: WheelPort | null) {
    this.wheel = wheel ?? createImmediateWheel();
  }

  dispose() {
    this.clearTimeout();
    this.machine.dispose();
    this.cueListeners.clear();
  }

  private run(effect: TrialEffect): void {
    switch (effect.type) {
      case 'OPEN_TRIAL':
        this.request('open', effect.request.requestId, () => this.provider.openTrial(effect.request), (result) => this.machine.dispatch({ type: EventType.OPENED, result }));
        return;
      case 'REQUEST_SPIN':
        this.request('spin', effect.request.requestId, () => this.provider.spin(effect.request), (result) => this.machine.dispatch({ type: EventType.SPIN_RESULT, result }));
        return;
      case 'REQUEST_COLLECT':
        this.request('collect', effect.request.requestId, () => this.provider.collect(effect.request), (result) => this.machine.dispatch({ type: EventType.COLLECTED, result }));
        return;
      case 'LAUNCH_WHEEL':
        this.safely(() => this.wheel.launch({ turbo: effect.turbo, rung: effect.rung }));
        return;
      case 'ABORT_WHEEL':
        this.safely(() => this.wheel.abort());
        return;
      case 'LAND_WHEEL': {
        const { requestId } = effect;
        this.cue({ type: 'landing', sectorIndex: effect.sectorIndex, kind: effect.kind });
        let p: Promise<void>;
        try {
          p = this.wheel.land(effect.sectorIndex, effect.offset, { turbo: effect.turbo, kind: effect.kind });
        } catch {
          p = Promise.resolve();
        }
        const settled = () => this.machine.dispatch({ type: EventType.WHEEL_SETTLED, requestId });
        p.then(settled, settled);
        return;
      }
      case 'SYNC_BALANCE':
        this.provider.getBalance().then(
          (balance) => this.machine.dispatch({ type: EventType.BALANCE_SYNCED, balance }),
          () => undefined,
        );
        return;
    }
  }

  private request<T>(kind: 'open' | 'spin' | 'collect', requestId: number, call: () => Promise<ProviderResult<T>>, deliver: (r: ProviderResult<T>) => void) {
    const sentAt = this.clock.now();
    this.clearTimeout();
    const finish = (r: ProviderResult<T>) => {
      this.cue({ type: 'response', kind, ok: r.ok, latencyMs: this.clock.now() - sentAt, requestId });
      deliver(r);
    };
    // Each attempt owns its timer; a late answer to an earlier attempt cannot cancel a retry's timeout.
    const handle = this.clock.setTimeout(() => {
      if (this.timeout === handle) this.timeout = null;
      finish({ ok: false, requestId, error: { code: ProviderErrorCode.TIMEOUT, message: `No word from the court within ${this.timeoutMs} ms.`, recoverable: true } });
    }, this.timeoutMs);
    this.timeout = handle;
    const clearMine = () => {
      this.clock.clearTimeout(handle);
      if (this.timeout === handle) this.timeout = null;
    };
    let pending: Promise<ProviderResult<T>>;
    try {
      pending = call();
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending.then(
      (r) => {
        clearMine();
        finish(r);
      },
      (err: unknown) => {
        clearMine();
        finish({ ok: false, requestId, error: { code: ProviderErrorCode.NETWORK, message: err instanceof Error ? err.message : String(err), recoverable: true } });
      },
    );
  }

  private clearTimeout() {
    if (this.timeout) this.clock.clearTimeout(this.timeout);
    this.timeout = null;
  }

  private safely(fn: () => void) {
    try {
      fn();
    } catch {
      /* a broken renderer must never wedge the trial */
    }
  }

  private cue(c: ControllerCue) {
    for (const l of this.cueListeners) {
      try {
        l(c);
      } catch {
        /* ignore */
      }
    }
  }
}
