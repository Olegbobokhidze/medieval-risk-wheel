/** The escalation ladder: five tiers, top = Sovereign Crown. The current tier carries a freshly pressed wax seal. */
import { findPreset } from '../../config/presets';
import { formatMultiplier } from '../../core/money';
import { advanceChance, ladder, RUNGS, TIER_NAMES, TIER_NUMERALS } from '../../engine/ladder';
import { TrialState } from '../../engine/machine';
import { useGame, useTrial } from '../hooks/game';

export function Ladder({ compact = false }: { readonly compact?: boolean }) {
  const { controller, formatMoney } = useGame();
  const ctx = useTrial();
  const preset = findPreset(ctx.trial?.params.presetId ?? ctx.params.presetId);
  if (!preset) return null;
  const mults = ladder(preset, controller.rules.houseEdge);
  const rung = ctx.trial?.rung ?? 0;
  const bet = ctx.trial?.params.bet ?? ctx.params.bet;
  const cursed = ctx.state === TrialState.ROUND_OVER_BUST;
  const tiers = Array.from({ length: RUNGS }, (_, i) => i + 1).reverse();

  return (
    <ol className={`ladder ${compact ? 'ladder--compact' : ''}`} aria-label="Escalation ladder">
      {tiers.map((k) => {
        const reached = k <= rung;
        const current = k === rung;
        const next = k === rung + 1 && !cursed && ctx.state !== TrialState.ROUND_OVER_COLLECTED;
        const safe = Math.round(advanceChance(preset, k - 1) * preset.sectors);
        const cls = current ? (cursed ? 'is-cursed' : 'is-current') : reached ? 'is-reached' : next ? 'is-next' : '';
        return (
          <li key={k} className={`rung ${cls}`} aria-current={current ? 'step' : undefined}>
            <span className="rung__seal" key={current ? `seal-${ctx.trial?.trialId}-${k}` : `n-${k}`} aria-hidden="true">
              {TIER_NUMERALS[k - 1]}
            </span>
            <span className="rung__name">{TIER_NAMES[k - 1]}</span>
            <span className="rung__mult num">{formatMultiplier(mults[k - 1] ?? 0)}</span>
            {!compact && <span className="rung__pay num">{formatMoney(Math.floor(bet * (mults[k - 1] ?? 0)))}</span>}
            {!compact && (
              <span className="rung__peril" title={`${preset.sectors - safe} of ${preset.sectors} sectors cursed on the way here`}>
                <span className="sr-only">Peril:</span>
                <span className="num">
                  {preset.sectors - safe}/{preset.sectors}
                </span>{' '}
                <span aria-hidden="true">☠</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
