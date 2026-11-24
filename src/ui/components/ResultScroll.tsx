import { formatMultiplier } from '../../core/money';
import { TIER_NAMES } from '../../engine/ladder';
import { TrialState } from '../../engine/machine';
import { useGame, useTrial } from '../hooks/game';

/** Proclamation scroll over the wheel at the end of a trial. Delayed so the curse or the bow reads first. */
export function ResultScroll() {
  const { formatMoney } = useGame();
  const ctx = useTrial();
  const t = ctx.trial;
  if (!t) return null;
  if (ctx.state === TrialState.ROUND_OVER_COLLECTED) {
    return (
      <div className="proclaim proclaim--won" role="status" key={`w-${t.trialId}`}>
        <span className="proclaim__kicker">By royal decree</span>
        <span className="proclaim__title num">{formatMoney(t.payout)}</span>
        <span className="proclaim__sub">
          Claimed as {TIER_NAMES[t.rung - 1]} · <span className="num">{formatMultiplier(t.multiplier)}</span>
        </span>
      </div>
    );
  }
  if (ctx.state === TrialState.ROUND_OVER_BUST) {
    return (
      <div className="proclaim proclaim--cursed" role="status" key={`b-${t.trialId}`}>
        <span className="proclaim__kicker">The wheel has spoken</span>
        <span className="proclaim__title">Cursed</span>
        <span className="proclaim__sub">{t.rung > 0 ? `Fallen from ${TIER_NAMES[t.rung - 1]}.` : 'Fallen before the first rung.'} The stake is forfeit.</span>
      </div>
    );
  }
  return null;
}
