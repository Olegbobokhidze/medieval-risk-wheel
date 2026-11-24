/**
 * Composition root: the only module that knows every layer (ADR-0001).
 * Swap MockProvider for HttpProvider here to play against a real server (ADR-0005).
 */
import { randomSeedHex } from '../adapters/fairness';
import { MockProvider } from '../adapters/mock-provider';
import { bindSound } from '../audio/bind';
import { CourtSound } from '../audio/sound';
import { BET_PRESETS, CURRENCY, DEFAULT_PRESET, findPreset, STARTING_TREASURY, TABLE_RULES } from '../config/presets';
import { createSystemClock } from '../core/clock';
import { createMoneyFormatter } from '../core/money';
import { TrialController } from '../engine/controller';
import type { RiskPresetId } from '../engine/ladder';
import type { Scene } from '../scene/scene';

export type Holder<T> = { get(): T; set(v: T): void; subscribe(l: () => void): () => void };

export function createHolder<T>(initial: T): Holder<T> {
  let value = initial;
  const ls = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      value = v;
      for (const l of ls) l();
    },
    subscribe: (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
  };
}

export type Game = {
  readonly controller: TrialController;
  readonly provider: MockProvider;
  readonly sound: CourtSound;
  readonly scene: Holder<Scene | null>;
  readonly formatMoney: (minor: number) => string;
  readonly initialInspectorOpen: boolean;
};

export function createGame(): Game {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const presetId = (findPreset(q.get('preset') ?? '')?.id ?? DEFAULT_PRESET) as RiskPresetId;
  const params = { presetId, bet: BET_PRESETS[3], clientSeed: q.get('clientSeed') ?? `herald-${randomSeedHex(4)}` };
  const provider = new MockProvider({ rules: TABLE_RULES, balance: STARTING_TREASURY });
  const controller = new TrialController({ provider, clock: createSystemClock(), rules: TABLE_RULES, params, balance: STARTING_TREASURY });
  const sound = new CourtSound();
  bindSound(controller, sound);
  return {
    controller,
    provider,
    sound,
    scene: createHolder<Scene | null>(null),
    formatMoney: createMoneyFormatter(CURRENCY, 'en-GB'),
    initialInspectorOpen: q.get('inspector') === '1',
  };
}
