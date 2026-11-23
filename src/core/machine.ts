/**
 * Generic, table-driven state machine runner (ADR-0002, ADR-0003).
 * A mode supplies: an allow-list per state and a pure reducer returning effect descriptors.
 * The runner queues events (no re-entrancy), records every accepted/rejected transition,
 * and exposes subscribe/getSnapshot for React's useSyncExternalStore.
 */
import type { Clock } from './clock';

export type Reduction<C, F> =
  | { readonly accepted: true; readonly ctx: C; readonly effects: readonly F[]; readonly note?: string }
  | { readonly accepted: false; readonly reason: string };

export type MachineSpec<S extends string, E extends { readonly type: string }, C extends { readonly state: S }, F> = {
  readonly allowed: Readonly<Record<S, readonly E['type'][]>>;
  readonly reduce: (ctx: C, event: E) => Reduction<C, F>;
};

export type TransitionRecord<S extends string = string> = {
  readonly seq: number;
  /** Clock time in ms. */
  readonly at: number;
  /** Wall-clock ISO timestamp. */
  readonly iso: string;
  readonly event: string;
  readonly from: S;
  readonly to: S;
  readonly accepted: boolean;
  /** Rejection reason, or an informational note. */
  readonly detail: string | null;
};

export const RejectReason = {
  NOT_ALLOWED_IN_STATE: 'NOT_ALLOWED_IN_STATE',
} as const;

export type MachineOptions<F, E> = {
  readonly clock: Clock;
  readonly runEffect: (effect: F, dispatch: (e: E) => void) => void;
  readonly historyLimit?: number;
  readonly isoNow?: () => string;
};

export class Machine<S extends string, E extends { readonly type: string }, C extends { readonly state: S }, F> {
  private ctx: C;
  private readonly queue: E[] = [];
  private processing = false;
  private seq = 0;
  private history: TransitionRecord<S>[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly transitionListeners = new Set<(r: TransitionRecord<S>, ctx: C) => void>();
  private readonly historyLimit: number;
  private readonly isoNow: () => string;
  private disposed = false;

  constructor(
    private readonly spec: MachineSpec<S, E, C, F>,
    initial: C,
    private readonly options: MachineOptions<F, E>,
  ) {
    this.ctx = initial;
    this.historyLimit = options.historyLimit ?? 300;
    this.isoNow = options.isoNow ?? (() => new Date().toISOString());
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): C => this.ctx;

  onTransition(listener: (r: TransitionRecord<S>, ctx: C) => void): () => void {
    this.transitionListeners.add(listener);
    return () => this.transitionListeners.delete(listener);
  }

  getHistory(): readonly TransitionRecord<S>[] {
    return this.history;
  }

  clearHistory(): void {
    this.history = [];
  }

  readonly dispatch = (event: E): void => {
    if (this.disposed) return;
    this.queue.push(event);
    if (this.processing) return;
    this.processing = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) this.process(next);
    } finally {
      this.processing = false;
    }
  };

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.transitionListeners.clear();
  }

  private process(event: E): void {
    const from = this.ctx.state;
    const allowed = this.spec.allowed[from].includes(event.type);
    const result: Reduction<C, F> = allowed ? this.spec.reduce(this.ctx, event) : { accepted: false, reason: RejectReason.NOT_ALLOWED_IN_STATE };
    const to = result.accepted ? result.ctx.state : from;
    const record: TransitionRecord<S> = {
      seq: ++this.seq,
      at: this.options.clock.now(),
      iso: this.isoNow(),
      event: event.type,
      from,
      to,
      accepted: result.accepted,
      detail: result.accepted ? (result.note ?? null) : result.reason,
    };
    this.history.push(record);
    if (this.history.length > this.historyLimit) this.history = this.history.slice(-this.historyLimit);

    if (result.accepted) {
      this.ctx = result.ctx;
      for (const l of this.listeners) l();
    }
    for (const l of this.transitionListeners) {
      try {
        l(record, this.ctx);
      } catch {
        /* observers must not break the loop */
      }
    }
    if (result.accepted) {
      for (const effect of result.effects) {
        try {
          this.options.runEffect(effect, this.dispatch);
        } catch {
          /* a failing effect must never wedge the machine */
        }
      }
    }
  }
}
