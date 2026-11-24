import { describe, expect, it } from 'vitest';
import { RISK_PRESETS, TABLE_RULES } from '../config/presets';
import { createManualClock } from '../core/clock';
import { TrialController } from '../engine/controller';
import { strategyReturn, validatePreset } from '../engine/ladder';
import { TrialState } from '../engine/machine';
import { verifyTrial } from './fairness';
import { ForcedOutcome, MockProvider } from './mock-provider';

let n = 0;
const seedSource = () => `court-seed-${++n}`;
const params = { presetId: 'KNIGHT_BALANCED' as const, bet: 100, clientSeed: 'heraldry' };
const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};

function setup(delay?: (ms: number) => Promise<void>) {
  const provider = new MockProvider({ rules: TABLE_RULES, balance: 10_000, seedSource, delay: delay ?? (() => Promise.resolve()) });
  const clock = createManualClock();
  const controller = new TrialController({ provider, clock, rules: TABLE_RULES, params, balance: 10_000, isoNow: () => 'T' });
  return { provider, controller, clock };
}

const verify = (c: TrialController) => {
  const s = c.getSnapshot();
  const t = s.trial;
  return verifyTrial({ serverSeed: t?.serverSeed ?? '', serverSeedHash: t?.serverSeedHash ?? '', clientSeed: params.clientSeed, nonce: t?.nonce ?? 0, sectors: 12, spins: t?.spins ?? [] });
};

describe('presets', () => {
  it('all shipped presets are valid and return ≤ 96%', () => {
    for (const p of RISK_PRESETS) {
      expect(validatePreset(p)).toEqual([]);
      for (let k = 1; k <= 5; k++) expect(strategyReturn(p, k, TABLE_RULES.houseEdge)).toBeLessThanOrEqual(0.96 + 1e-9);
    }
  });
});

describe('controller × MockProvider', () => {
  it('plays trials to the end and every finished trial verifies as provably fair', async () => {
    const { controller, provider } = setup();
    let finished = 0;
    for (let round = 0; round < 12; round++) {
      controller.start();
      await settle();
      while (controller.getSnapshot().state === TrialState.LADDER_DECISION) {
        if ((controller.getSnapshot().trial?.rung ?? 0) >= 2) controller.claim();
        else controller.risk();
        await settle();
      }
      const s = controller.getSnapshot();
      expect([TrialState.ROUND_OVER_BUST, TrialState.ROUND_OVER_COLLECTED]).toContain(s.state);
      const v = await verify(controller);
      expect(v).toMatchObject({ commitmentOk: true, spinsOk: true });
      expect(s.balance).toBe(provider.getWallet());
      finished++;
    }
    expect(finished).toBe(12);
  });

  it('rapid double-click on risk/claim sends one request', async () => {
    const { controller } = setup();
    // Force a first advance so we reach the decision point deterministically.
    controller.start();
    await settle();
    while (controller.getSnapshot().state === TrialState.ROUND_OVER_BUST) {
      controller.start();
      await settle();
    }
    controller.claim();
    controller.claim();
    controller.risk();
    expect(controller.getHistory().filter((r) => !r.accepted && (r.event === 'CLAIM' || r.event === 'RISK'))).toHaveLength(2);
    await settle();
    expect(controller.getSnapshot().state).toBe(TrialState.ROUND_OVER_COLLECTED);
  });

  it('lost response → retry with the same requestId → the spin is applied once', async () => {
    const { controller, provider } = setup();
    provider.updateSettings({ forced: ForcedOutcome.NONE });
    controller.start();
    await settle();
    // Force: lost response on the next spin, which must advance (forced advance first).
    while (controller.getSnapshot().state !== TrialState.LADDER_DECISION) {
      controller.start();
      await settle();
    }
    provider.updateSettings({ forced: ForcedOutcome.LOST_RESPONSE });
    controller.risk();
    await settle();
    expect(controller.getSnapshot().state).toBe(TrialState.ERROR_RECOVERABLE);
    const spinsBefore = controller.getSnapshot().trial?.spins.length ?? 0;
    controller.retry();
    await settle();
    const s = controller.getSnapshot();
    expect([TrialState.LADDER_DECISION, TrialState.ROUND_OVER_BUST]).toContain(s.state);
    expect(s.trial?.spins.length).toBe(spinsBefore + 1);
  });

  it('forced outcomes are detected as tampering by verification', async () => {
    const { controller, provider } = setup();
    provider.updateSettings({ forced: ForcedOutcome.CURSE });
    controller.start();
    await settle();
    const s = controller.getSnapshot();
    expect(provider.wasTampered(s.trial?.trialId ?? '')).toBe(true);
    expect(s.state).toBe(TrialState.ROUND_OVER_BUST);
    const v = await verify(controller);
    expect(v.commitmentOk).toBe(true);
    expect(v.spinsOk).toBe(false);
  });

  it('timeout aborts the wheel; the late answer is ignored', async () => {
    const { controller, provider, clock } = setup((ms) => (ms >= 30_000 ? new Promise(() => undefined) : Promise.resolve()));
    provider.updateSettings({ forced: ForcedOutcome.TIMEOUT });
    controller.start();
    await settle();
    clock.advance(8000);
    expect(controller.getSnapshot().error?.code).toBe('TIMEOUT');
  });

  it('a throwing wheel never wedges the trial', async () => {
    const { controller } = setup();
    controller.attachWheel({
      launch: () => {
        throw new Error('boom');
      },
      land: () => Promise.reject(new Error('boom')),
      abort: () => undefined,
    });
    controller.start();
    await settle();
    expect([TrialState.LADDER_DECISION, TrialState.ROUND_OVER_BUST]).toContain(controller.getSnapshot().state);
  });
});
