import { describe, expect, it } from 'vitest';
import type { MachineSpec } from '../core/machine';
import { ladder, reachProbability, RUNGS, rungMultiplier, strategyReturn, validatePreset, wheelFor, type LadderRules, type RiskPreset } from './ladder';
import { ALLOWED_EVENTS, createInitialContext, createTrialSpec, EventType as E, TrialState, type TrialContext, type TrialEffect, type TrialEvent } from './machine';
import { POINTER_TUNING, stepPointer, type PointerState } from './pointer';
import type { SpinResult } from './ports';
import { createWheel, launch, NORMAL_TUNING, planLanding, sectorUnderPointer, stepWheel, TAU, TURBO_TUNING, WheelPhase } from './wheel';

const KNIGHT: RiskPreset = { id: 'KNIGHT_BALANCED', name: 'Knight', motto: '', sectors: 12, curses: [2, 3, 4, 5, 6] };
const SOVEREIGN: RiskPreset = { id: 'SOVEREIGN_HIGH_RISK', name: 'Sovereign', motto: '', sectors: 12, curses: [3, 5, 6, 7, 8] };
const EDGE = 0.04;
const rules: LadderRules = { houseEdge: EDGE, betPresets: [10, 100, 1000], presets: (id) => [KNIGHT, SOVEREIGN].find((p) => p.id === id) };

describe('ladder maths', () => {
  it('reach probability multiplies per-rung advance chances', () => {
    expect(reachProbability(KNIGHT, 2)).toBeCloseTo((10 / 12) * (9 / 12));
  });

  it('every claim-at-k strategy returns at most 1 − edge, and within one cent of it', () => {
    for (const p of [KNIGHT, SOVEREIGN]) {
      for (let k = 1; k <= RUNGS; k++) {
        const r = strategyReturn(p, k, EDGE);
        expect(r).toBeLessThanOrEqual(1 - EDGE + 1e-9);
        expect(r).toBeGreaterThan(1 - EDGE - 0.01 * reachProbability(p, k) - 1e-9);
      }
    }
  });

  it('ladder escalates and higher risk pays more at the crown', () => {
    const k = ladder(KNIGHT, EDGE);
    for (let i = 1; i < k.length; i++) expect(k[i]).toBeGreaterThan(k[i - 1] ?? 0);
    expect(rungMultiplier(SOVEREIGN, 5, EDGE)).toBeGreaterThan(rungMultiplier(KNIGHT, 5, EDGE));
  });

  it('wheel layouts carry exactly the configured curses and differ per rung', () => {
    for (let k = 0; k < RUNGS; k++) expect(wheelFor(KNIGHT, k).filter((s) => s.kind === 'curse')).toHaveLength(KNIGHT.curses[k] ?? -1);
    expect(wheelFor(KNIGHT, 0).map((s) => s.kind)).not.toEqual(wheelFor(KNIGHT, 1).map((s) => s.kind));
  });

  it('preset validation rejects decreasing peril', () => {
    expect(validatePreset(KNIGHT)).toEqual([]);
    expect(validatePreset({ ...KNIGHT, curses: [4, 3, 3, 3, 3] }).length).toBeGreaterThan(0);
  });
});

describe('wheel kinematics', () => {
  const spinTo = (sector: number, offset: number, dt: number, tuning = NORMAL_TUNING) => {
    const w = createWheel(1.234);
    launch(w, tuning);
    for (let t = 0; t < 900; t += dt) stepWheel(w, dt);
    expect(w.phase).toBe(WheelPhase.CRUISE);
    planLanding(w, sector, offset, 12);
    let elapsed = 0;
    let max = 0;
    let prev = w.theta;
    while (!stepWheel(w, dt)) {
      elapsed += dt;
      max = Math.max(max, Math.abs(w.theta - prev));
      prev = w.theta;
      if (elapsed > 20_000) throw new Error('never settled');
    }
    return { w, elapsed };
  };

  it('always lands with the chosen sector under the pointer, at any frame rate', () => {
    for (const dt of [4, 8.33, 16.67, 33.3, 50]) {
      for (const [sector, offset] of [
        [0, 0],
        [5, 0.5],
        [11, 0.999],
      ] as const) {
        const { w } = spinTo(sector, offset, dt);
        expect(sectorUnderPointer(w.theta, 12)).toBe(sector);
        expect(w.omega).toBe(0);
      }
    }
  });

  it('deceleration duration stays in the tuning window (natural, never abrupt)', () => {
    const { elapsed } = spinTo(3, 0.3, 16.67);
    expect(elapsed).toBeGreaterThanOrEqual(NORMAL_TUNING.minDecelMs);
    expect(elapsed).toBeLessThan(NORMAL_TUNING.maxDecelMs + NORMAL_TUNING.settleMs + 1200);
    const turbo = spinTo(3, 0.3, 16.67, TURBO_TUNING).elapsed;
    expect(turbo).toBeLessThan(elapsed);
  });

  it('velocity is continuous at the cruise → deceleration hand-off', () => {
    const w = createWheel(0);
    launch(w, NORMAL_TUNING);
    for (let t = 0; t < 900; t += 16) stepWheel(w, 16);
    const before = w.omega;
    planLanding(w, 7, 0.5, 12);
    stepWheel(w, 1);
    expect(Math.abs(w.omega - before) / before).toBeLessThan(0.05);
  });

  it('anticipation: the wind-up pulls the wheel back before launch', () => {
    const w = createWheel(2);
    launch(w, NORMAL_TUNING);
    stepWheel(w, 100);
    expect(w.theta).toBeLessThan(2);
  });
});

describe('pointer physics', () => {
  it('ticks exactly once per sector boundary crossed', () => {
    const p: PointerState = { deflection: 0, velocity: 0 };
    let ticks = 0;
    let theta = 0.05;
    const turns = 3;
    const end = theta + turns * TAU;
    while (theta < end) {
      const next = Math.min(end, theta + 0.09);
      ticks += stepPointer(p, theta, next, 9, 12, 10).ticks;
      theta = next;
    }
    expect(ticks).toBe(turns * 12);
  });

  it('deflects while a pin pushes and springs back after release', () => {
    const p: PointerState = { deflection: 0, velocity: 0 };
    let maxDefl = 0;
    let theta = 0;
    for (let i = 0; i < 40; i++) {
      stepPointer(p, theta, theta + 0.02, 2, 12, 16);
      theta += 0.02;
      maxDefl = Math.max(maxDefl, p.deflection);
    }
    expect(maxDefl).toBeGreaterThan(POINTER_TUNING.maxDeflection * 0.5);
    for (let i = 0; i < 120; i++) stepPointer(p, theta, theta, 0, 12, 16);
    expect(Math.abs(p.deflection)).toBeLessThan(0.01);
  });
});

// ------------------------------------------------------------------ state machine

const spec: MachineSpec<TrialState, TrialEvent, TrialContext, TrialEffect> = createTrialSpec(rules);
const params = { presetId: 'KNIGHT_BALANCED' as const, bet: 100, clientSeed: 'seed' };

function step(ctx: TrialContext, ev: TrialEvent) {
  if (!spec.allowed[ctx.state].includes(ev.type)) return { accepted: false as const, reason: 'NOT_ALLOWED_IN_STATE', ctx, effects: [] as TrialEffect[] };
  const r = spec.reduce(ctx, ev);
  return r.accepted ? r : { ...r, ctx, effects: [] as TrialEffect[] };
}
function run(ctx: TrialContext, ...evs: TrialEvent[]) {
  let c = ctx;
  const effects: string[] = [];
  for (const ev of evs) {
    const r = step(c, ev);
    if (!r.accepted) throw new Error(`rejected ${ev.type} in ${c.state}: ${r.reason}`);
    c = r.ctx;
    effects.push(...r.effects.map((e) => e.type));
  }
  return { ctx: c, effects };
}
const opened = (requestId = 1): TrialEvent => ({ type: E.OPENED, result: { ok: true, requestId, value: { trialId: 'T1', serverSeedHash: 'h', nonce: 1, balanceAfter: 9_900 } } });
const advanceAt = (rung: number) => wheelFor(KNIGHT, rung).find((s) => s.kind === 'advance')?.index ?? 0;
const curseAt = (rung: number) => wheelFor(KNIGHT, rung).find((s) => s.kind === 'curse')?.index ?? 0;
const spinOk = (requestId: number, spin: number, rung: number, kind: 'advance' | 'curse'): TrialEvent => {
  const value: SpinResult = {
    spin,
    sectorIndex: kind === 'advance' ? advanceAt(rung) : curseAt(rung),
    offset: 0.5,
    kind,
    rung: kind === 'advance' ? rung + 1 : rung,
    multiplier: rungMultiplier(KNIGHT, kind === 'advance' ? rung + 1 : rung, EDGE),
    serverSeed: kind === 'curse' ? 's' : null,
  };
  return { type: E.SPIN_RESULT, result: { ok: true, requestId, value } };
};
const climbed = () => run(createInitialContext(params, 10_000), { type: E.START }, opened(), spinOk(2, 1, 0, 'advance'), { type: E.WHEEL_SETTLED, requestId: 2 }).ctx;

describe('trial state machine', () => {
  it('has all nine states', () => {
    expect(Object.keys(ALLOWED_EVENTS)).toHaveLength(9);
  });

  it('stake → first spin launches immediately → resolve → ladder decision', () => {
    const r1 = run(createInitialContext(params, 10_000), { type: E.START });
    expect(r1.ctx.state).toBe(TrialState.CONFIGURING);
    expect(r1.ctx.balance).toBe(9_900);
    const r2 = run(r1.ctx, opened());
    expect(r2.ctx.state).toBe(TrialState.SPINNING);
    expect(r2.effects).toEqual(['LAUNCH_WHEEL', 'REQUEST_SPIN']);
    const r3 = run(r2.ctx, spinOk(2, 1, 0, 'advance'));
    expect(r3.ctx.state).toBe(TrialState.RESOLVING_SECTOR);
    expect(r3.effects).toEqual(['LAND_WHEEL']);
    const c = climbed();
    expect(c.state).toBe(TrialState.LADDER_DECISION);
    expect(c.trial?.rung).toBe(1);
  });

  it('double spin and double collect are impossible', () => {
    const spinning = run(climbed(), { type: E.RISK }).ctx;
    expect(step(spinning, { type: E.RISK }).accepted).toBe(false);
    expect(step(spinning, { type: E.CLAIM }).accepted).toBe(false);
    const collecting = run(climbed(), { type: E.CLAIM }).ctx;
    expect(collecting.state).toBe(TrialState.COLLECTING);
    expect(step(collecting, { type: E.CLAIM }).accepted).toBe(false);
    expect(step(collecting, { type: E.RISK }).accepted).toBe(false);
  });

  it('the outcome is not applied until the wheel settles', () => {
    const c = run(climbed(), { type: E.RISK }, spinOk(3, 2, 1, 'advance')).ctx;
    expect(c.trial?.rung).toBe(1);
    expect(run(c, { type: E.WHEEL_SETTLED, requestId: 3 }).ctx.trial?.rung).toBe(2);
  });

  it('stale and duplicate answers are discarded', () => {
    const c = run(climbed(), { type: E.RISK }).ctx;
    expect(step(c, spinOk(99, 2, 1, 'advance')).accepted).toBe(false);
    const resolving = run(c, spinOk(3, 2, 1, 'advance')).ctx;
    expect(step(resolving, { type: E.WHEEL_SETTLED, requestId: 2 }).accepted).toBe(false);
  });

  it('a curse busts the trial and discloses the seed', () => {
    const c = run(climbed(), { type: E.RISK }, spinOk(3, 2, 1, 'curse'), { type: E.WHEEL_SETTLED, requestId: 3 }).ctx;
    expect(c.state).toBe(TrialState.ROUND_OVER_BUST);
    expect(c.trial?.serverSeed).toBe('s');
    expect(c.lastOutcome).toEqual({ kind: 'bust', amount: 0, rung: 1 });
  });

  it('claim settles the payout; a wrong payout is caught', () => {
    const c = run(climbed(), { type: E.CLAIM }).ctx;
    const mult = rungMultiplier(KNIGHT, 1, EDGE);
    const good = run(c, { type: E.COLLECTED, result: { ok: true, requestId: 3, value: { payout: Math.floor(100 * mult), multiplier: mult, rung: 1, balanceAfter: 10_015, serverSeed: 's' } } }).ctx;
    expect(good.state).toBe(TrialState.ROUND_OVER_COLLECTED);
    const bad = run(c, { type: E.COLLECTED, result: { ok: true, requestId: 3, value: { payout: 9999, multiplier: mult, rung: 1, balanceAfter: 1, serverSeed: 's' } } }).ctx;
    expect(bad.error?.code).toBe('VALIDATION');
  });

  it('a sector that is not what the server claims is a VALIDATION error', () => {
    const c = run(climbed(), { type: E.RISK }).ctx;
    const lie: TrialEvent = { type: E.SPIN_RESULT, result: { ok: true, requestId: 3, value: { spin: 2, sectorIndex: curseAt(1), offset: 0.5, kind: 'advance', rung: 2, multiplier: rungMultiplier(KNIGHT, 2, EDGE), serverSeed: null } } };
    const r = run(c, lie);
    expect(r.ctx.error?.code).toBe('VALIDATION');
    expect(r.effects).toContain('ABORT_WHEEL');
  });

  it('reaching the Sovereign Crown auto-claims', () => {
    let c = climbed();
    for (let rung = 1; rung < RUNGS; rung++) {
      const id = c.requestSeq + 1;
      c = run(c, { type: E.RISK }, spinOk(id, rung + 1, rung, 'advance'), { type: E.WHEEL_SETTLED, requestId: id }).ctx;
    }
    expect(c.state).toBe(TrialState.COLLECTING);
    expect(c.trial?.rung).toBe(RUNGS);
  });

  it('a failed spin aborts the wheel and must be retried with the same requestId', () => {
    const c = run(climbed(), { type: E.RISK }).ctx;
    const err = run(c, { type: E.SPIN_RESULT, result: { ok: false, requestId: 3, error: { code: 'NETWORK', message: 'x', recoverable: true } } });
    expect(err.ctx.state).toBe(TrialState.ERROR_RECOVERABLE);
    expect(err.effects).toEqual(['ABORT_WHEEL']);
    expect(step(err.ctx, { type: E.DISMISS_ERROR }).accepted).toBe(false);
    const retry = step(err.ctx, { type: E.RETRY });
    expect(retry.accepted && retry.effects[1]).toMatchObject({ type: 'REQUEST_SPIN', request: { requestId: 3, spin: 2 } });
  });

  it('a failed open refunds; insufficient funds is caught up front', () => {
    const r = run(createInitialContext(params, 10_000), { type: E.START }, { type: E.OPENED, result: { ok: false, requestId: 1, error: { code: 'NETWORK', message: 'x', recoverable: true } } });
    expect(r.ctx.balance).toBe(10_000);
    expect(run(r.ctx, { type: E.DISMISS_ERROR }).ctx.state).toBe(TrialState.IDLE);
    const poor = run(createInitialContext(params, 50), { type: E.START });
    expect(poor.ctx.error?.code).toBe('INSUFFICIENT_FUNDS');
    expect(poor.effects).toEqual([]);
  });

  it('settings are locked mid-trial and validated between trials', () => {
    expect(step(climbed(), { type: E.SET_PARAMS, patch: { bet: 10 } }).accepted).toBe(false);
    const idle = createInitialContext(params, 10_000);
    expect(step(idle, { type: E.SET_PARAMS, patch: { bet: 123 } }).accepted).toBe(false);
    expect(run(idle, { type: E.SET_PARAMS, patch: { presetId: 'SOVEREIGN_HIGH_RISK' } }).ctx.params.presetId).toBe('SOVEREIGN_HIGH_RISK');
  });
});
