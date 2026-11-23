export type TimerHandle = { readonly id: number };

export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

/** Host timer API, typed explicitly so core/engine never touch `window`. */
type TimerHost = {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  performance?: { now(): number };
};
const host = globalThis as unknown as TimerHost;

/** The only place core/engine code reads ambient time. */
export function createSystemClock(): Clock {
  const handles = new Map<number, unknown>();
  let nextId = 1;
  return {
    now: () => (host.performance ? host.performance.now() : Date.now()),
    setTimeout: (fn, ms) => {
      const id = nextId++;
      handles.set(
        id,
        host.setTimeout(() => {
          handles.delete(id);
          fn();
        }, ms),
      );
      return { id };
    },
    clearTimeout: (h) => {
      const raw = handles.get(h.id);
      if (raw !== undefined) host.clearTimeout(raw);
      handles.delete(h.id);
    },
  };
}

export type ManualClock = Clock & { advance(ms: number): void; pending(): number };

/** Deterministic virtual clock for tests. */
export function createManualClock(start = 0): ManualClock {
  let now = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + Math.max(0, ms), fn });
      return { id };
    },
    clearTimeout: (h) => void timers.delete(h.id),
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let due: [number, { at: number; fn: () => void }] | null = null;
        for (const entry of timers) if (entry[1].at <= target && (!due || entry[1].at < due[1].at)) due = entry;
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
    pending: () => timers.size,
  };
}
