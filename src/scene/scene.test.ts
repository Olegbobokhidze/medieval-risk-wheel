import { describe, expect, it } from 'vitest';
import { ALCH_CLIPS, AlchemistAnimator, PUSH_MS, solveAlchemist } from './characters/alchemist';
import { RavenAnimator } from './characters/raven';
import { ClipAnimator } from './clip-animator';
import { Easing } from './easing';
import { ALCHEMIST_HEIGHT, composeScene } from './layout';
import { NORMAL_TUNING } from '../engine/wheel';

const seeded = () => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};
const run = <T,>(a: { update(dt: number): T }, ms: number, step = 16) => {
  let v!: T;
  for (let t = 0; t < ms; t += step) v = a.update(step);
  return v;
};

describe('ClipAnimator', () => {
  const clips = {
    a: { name: 'a', duration: 200, keys: [{ at: 200, pose: { x: 1 }, ease: Easing.outBack }], markers: [{ at: 100, name: 'hit' }], next: 'b', idleWeight: 1 },
    b: { name: 'b', duration: 100, keys: [{ at: 100, pose: { x: 0 }, ease: Easing.inOutCubic }], markers: [], next: null, idleWeight: 1 },
  } as const;
  it('fires markers once even across long frames, chains and holds', () => {
    const an = new ClipAnimator(['x'] as const, { x: 0 }, clips, 'a');
    const hits: string[] = [];
    an.onMarker((m) => hits.push(m));
    an.update(150);
    an.update(150);
    expect(hits).toEqual(['hit']);
    expect(an.current).toBe('b');
    an.update(500);
    expect(an.values().x).toBeCloseTo(0);
  });
  it('interrupting blends from the current value (no pop)', () => {
    const an = new ClipAnimator(['x'] as const, { x: 0 }, clips, 'a');
    an.update(120);
    const before = an.values().x;
    an.play('b');
    expect(Math.abs(an.update(16).x - before)).toBeLessThan(0.2);
  });
});

describe('alchemist', () => {
  it('push strike lines up with the wheel wind-up (anticipation in sync)', () => {
    expect(PUSH_MS).toBe(NORMAL_TUNING.windupMs);
  });
  it('never freezes at idle (breathing) and returns to idle after every reaction', () => {
    const a = new AlchemistAnimator(false, seeded());
    const b1 = run(a, 600).breath;
    const b2 = run(a, 900).breath;
    expect(b1).not.toBeCloseTo(b2, 3);
    for (const clip of ['triumph', 'flinch', 'bow'] as const) {
      a.clips.play(clip);
      const p = run(a, ALCH_CLIPS[clip].duration + 700);
      expect(a.clips.current).toBe('idle');
      expect(p.knock).toBeCloseTo(0, 2);
      expect(p.bow).toBeCloseTo(0, 2);
    }
  });
  it('push extends the hand toward the wheel; flinch knocks the body back; triumph raises the flask', () => {
    const a = new AlchemistAnimator(true, seeded());
    const rest = solveAlchemist(a.getPose());
    a.clips.play('push');
    const pushed = solveAlchemist(run(a, 260 / 3, 4));
    expect(pushed.handF.x).toBeGreaterThan(rest.handF.x + 20);
    a.clips.play('flinch');
    const flinched = solveAlchemist(run(a, 100 / 3, 4));
    expect(flinched.hip.x).toBeLessThan(rest.hip.x);
    a.clips.play('triumph');
    const up = solveAlchemist(run(a, 420 / 3, 4));
    expect(up.handB.y).toBeLessThan(rest.handB.y - 40);
  });
});

describe('raven', () => {
  it('fidgets on its own and returns to idle after a flap', () => {
    const r = new RavenAnimator(false, seeded());
    r.clips.play('flap');
    run(r, 1600);
    expect(['idle', 'preen', 'cock']).toContain(r.clips.current);
  });
});

describe('scene layout', () => {
  for (const [w, h] of [
    [1280, 720],
    [900, 560],
    [600, 360],
    [390, 340],
    [360, 300],
    [800, 900],
  ] as const) {
    it(`${w}×${h}: wheel, raven and alchemist stay inside the canvas`, () => {
      const L = composeScene(w, h);
      expect(L.cx - L.r).toBeGreaterThanOrEqual(0);
      expect(L.cx + L.r).toBeLessThanOrEqual(w);
      expect(L.cy + L.r).toBeLessThanOrEqual(h);
      expect(L.raven.y - 50 * L.raven.scale).toBeGreaterThanOrEqual(0); // raven + raised wings
      expect(L.alchemist.y - ALCHEMIST_HEIGHT * L.alchemist.scale).toBeGreaterThanOrEqual(0);
      expect(L.alchemist.x - 60 * L.alchemist.scale).toBeGreaterThanOrEqual(-1);
      expect(L.floor).toBeLessThanOrEqual(h);
    });
  }
});
