/**
 * Escalation ladder, risk presets and per-rung wheel layouts (ADR-0004). Pure.
 * Each rung's wheel has `sectors` equally likely sectors, of which `curses[k]` end the trial.
 */

export const RUNGS = 5;

export const TIER_NAMES = ['Novitiate', 'Squire', 'Knight', 'Lord', 'Sovereign Crown'] as const;
export const TIER_NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const;

export const RiskPresetId = {
  SQUIRE_SAFE: 'SQUIRE_SAFE',
  KNIGHT_BALANCED: 'KNIGHT_BALANCED',
  SOVEREIGN_HIGH_RISK: 'SOVEREIGN_HIGH_RISK',
} as const;
export type RiskPresetId = (typeof RiskPresetId)[keyof typeof RiskPresetId];

export type RiskPreset = {
  readonly id: RiskPresetId;
  readonly name: string;
  readonly motto: string;
  /** Sectors per wheel (all equally likely). */
  readonly sectors: number;
  /** Curse sectors on the wheel spun FROM rung k (k = 0 … RUNGS−1). Must be non-decreasing. */
  readonly curses: readonly number[];
};

export const Charge = {
  CROWN: 'crown',
  FLEUR: 'fleur',
  SWORD: 'sword',
  CHALICE: 'chalice',
  SKULL: 'skull',
} as const;
export type Charge = (typeof Charge)[keyof typeof Charge];

export type SectorKind = 'advance' | 'curse';
export type Sector = { readonly index: number; readonly kind: SectorKind; readonly charge: Charge };

export type LadderRules = {
  readonly houseEdge: number;
  readonly betPresets: readonly number[];
  readonly presets: (id: string) => RiskPreset | undefined;
};

const floor2 = (x: number) => Math.floor(x * 100 + 1e-9) / 100;

/** Advance chance on the wheel spun from rung k. */
export function advanceChance(p: RiskPreset, k: number): number {
  const c = p.curses[k] ?? p.sectors;
  return (p.sectors - c) / p.sectors;
}

/** P(reach rung k) from the start (k = 0 → 1). */
export function reachProbability(p: RiskPreset, k: number): number {
  let prob = 1;
  for (let i = 0; i < k; i++) prob *= advanceChance(p, i);
  return prob;
}

/** Multiplier held at rung k (1 … RUNGS); rung 0 has nothing to claim. */
export function rungMultiplier(p: RiskPreset, k: number, houseEdge: number): number {
  if (k <= 0) return 0;
  const reach = reachProbability(p, k);
  return reach <= 0 ? 0 : floor2((1 - houseEdge) / reach);
}

export function ladder(p: RiskPreset, houseEdge: number): number[] {
  return Array.from({ length: RUNGS }, (_, i) => rungMultiplier(p, i + 1, houseEdge));
}

/** Exact return of "claim as soon as rung k is reached". */
export function strategyReturn(p: RiskPreset, k: number, houseEdge: number): number {
  return reachProbability(p, k) * rungMultiplier(p, k, houseEdge);
}

const ADVANCE_CHARGES: readonly Charge[] = [Charge.CROWN, Charge.FLEUR, Charge.SWORD, Charge.CHALICE];

/**
 * Deterministic wheel layout for the spin from rung k: curses spread evenly and rotated per rung
 * so each climb visibly re-forges the wheel. Identical on client and server.
 */
export function wheelFor(p: RiskPreset, k: number): Sector[] {
  const n = p.sectors;
  const c = Math.max(0, Math.min(n - 1, p.curses[k] ?? 0));
  const cursed = new Set<number>();
  for (let i = 0; i < c; i++) cursed.add((Math.floor((i * n) / c) + k * 5 + 2) % n);
  let a = 0;
  return Array.from({ length: n }, (_, i) =>
    cursed.has(i) ? { index: i, kind: 'curse', charge: Charge.SKULL } : { index: i, kind: 'advance', charge: ADVANCE_CHARGES[a++ % ADVANCE_CHARGES.length] ?? Charge.CROWN },
  );
}

export function validatePreset(p: RiskPreset): string[] {
  const errors: string[] = [];
  if (p.sectors < 4) errors.push('at least 4 sectors');
  if (p.curses.length !== RUNGS) errors.push(`curses must have ${RUNGS} entries`);
  p.curses.forEach((c, i) => {
    if (!Number.isInteger(c) || c < 0 || c >= p.sectors) errors.push(`curses[${i}] out of range`);
    if (i > 0 && c < (p.curses[i - 1] ?? 0)) errors.push('peril must not decrease up the ladder');
  });
  return errors;
}
