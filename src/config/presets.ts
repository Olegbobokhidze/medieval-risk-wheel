/** Risk presets & table rules (ADR-0004). Data only; the maths lives in engine/ladder.ts. */
import { RiskPresetId, type LadderRules, type RiskPreset } from '../engine/ladder';

export const RISK_PRESETS: readonly RiskPreset[] = [
  {
    id: RiskPresetId.SQUIRE_SAFE,
    name: "Squire's Caution",
    motto: 'Slow climbs, few curses.',
    sectors: 12,
    curses: [1, 2, 2, 3, 4],
  },
  {
    id: RiskPresetId.KNIGHT_BALANCED,
    name: "Knight's Measure",
    motto: 'Steel nerve, honest odds.',
    sectors: 12,
    curses: [2, 3, 4, 5, 6],
  },
  {
    id: RiskPresetId.SOVEREIGN_HIGH_RISK,
    name: "Sovereign's Gambit",
    motto: 'Crown or ruin.',
    sectors: 12,
    curses: [3, 5, 6, 7, 8],
  },
];

export const DEFAULT_PRESET = RiskPresetId.KNIGHT_BALANCED;
export const HOUSE_EDGE = 0.04;
export const BET_PRESETS = [10, 20, 50, 100, 200, 500, 1000, 2500] as const;
export const STARTING_TREASURY = 100_000; // 1,000.00
export const CURRENCY = 'EUR';

export function findPreset(id: string): RiskPreset | undefined {
  return RISK_PRESETS.find((p) => p.id === id);
}

export const TABLE_RULES: LadderRules = { houseEdge: HOUSE_EDGE, betPresets: BET_PRESETS, presets: findPreset };
