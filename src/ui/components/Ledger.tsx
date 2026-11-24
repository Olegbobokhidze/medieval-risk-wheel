/** The steward's ledger: treasury, stake, risk standard, the ladder and the decision (claim vs. risk). */
import { BET_PRESETS, findPreset, RISK_PRESETS } from '../../config/presets';
import { formatMultiplier } from '../../core/money';
import { advanceChance, RUNGS, rungMultiplier, TIER_NAMES } from '../../engine/ladder';
import { TrialState } from '../../engine/machine';
import { isBetween, useGame, useTrial } from '../hooks/game';
import { IconMinus, IconPlus } from './icons';
import { Ladder } from './Ladder';

export function Ledger({ compactLadder }: { readonly compactLadder: boolean }) {
  const { controller, formatMoney } = useGame();
  const ctx = useTrial();
  const s = ctx.state;
  const between = isBetween(s);
  const betIndex = BET_PRESETS.indexOf(ctx.params.bet as (typeof BET_PRESETS)[number]);
  const trial = ctx.trial;
  const preset = findPreset(trial?.params.presetId ?? ctx.params.presetId);
  const rung = trial?.rung ?? 0;
  const claimNow = trial && rung > 0 ? Math.floor(trial.params.bet * trial.multiplier) : 0;
  const nextMult = preset && rung < RUNGS ? rungMultiplier(preset, rung + 1, controller.rules.houseEdge) : null;
  const odds = preset && rung < RUNGS ? advanceChance(preset, rung) : null;

  const busy: Partial<Record<TrialState, string>> = {
    CONFIGURING: 'The herald announces…',
    SPINNING: 'The wheel turns…',
    RESOLVING_SECTOR: 'The wheel slows…',
    COLLECTING: 'Sealing the claim…',
    ERROR_RECOVERABLE: 'A messenger is delayed',
  };

  return (
    <section className="ledger" aria-label="Steward's ledger">
      <div className="ledger__row ledger__treasury">
        <span className="label">Treasury</span>
        <output className="figure num" aria-live="polite">
          {formatMoney(ctx.balance)}
        </output>
      </div>

      <div className="ledger__split">
        <div className="field-group">
          <span className="label" id="stake-l">
            Stake
          </span>
          <div className="stepper" role="group" aria-labelledby="stake-l">
            <button type="button" className="stepper__btn" aria-label="Lower the stake" disabled={!between || betIndex <= 0} onClick={() => controller.setParams({ bet: BET_PRESETS[Math.max(0, betIndex - 1)] ?? ctx.params.bet })}>
              <IconMinus />
            </button>
            <output className="stepper__value num">{formatMoney(ctx.params.bet)}</output>
            <button
              type="button"
              className="stepper__btn"
              aria-label="Raise the stake"
              disabled={!between || betIndex >= BET_PRESETS.length - 1}
              onClick={() => controller.setParams({ bet: BET_PRESETS[Math.min(BET_PRESETS.length - 1, betIndex + 1)] ?? ctx.params.bet })}
            >
              <IconPlus />
            </button>
          </div>
        </div>
        <div className="field-group">
          <span className="label">Holding</span>
          <output className="holding num" aria-live="polite">
            {rung > 0 ? `${formatMultiplier(trial?.multiplier ?? 0)} · ${formatMoney(claimNow)}` : '—'}
          </output>
        </div>
      </div>

      <div className="field-group">
        <span className="label" id="risk-l">
          Standard of risk
        </span>
        <div className="pennants" role="radiogroup" aria-labelledby="risk-l">
          {RISK_PRESETS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={ctx.params.presetId === p.id}
              className={`pennant pennant--${i}`}
              disabled={!between}
              onClick={() => controller.setParams({ presetId: p.id })}
              title={`${p.motto} (key ${i + 1})`}
            >
              <span className="pennant__name">{p.name}</span>
              <span className="pennant__motto">{p.motto}</span>
            </button>
          ))}
        </div>
      </div>

      <Ladder compact={compactLadder} />

      {odds !== null && nextMult !== null && s !== TrialState.ROUND_OVER_BUST && s !== TrialState.ROUND_OVER_COLLECTED && (
        <p className="omen">
          Next: <strong>{TIER_NAMES[rung]}</strong> at <span className="num">{formatMultiplier(nextMult)}</span> · fortune favours{' '}
          <span className="num">
            {Math.round(odds * (preset?.sectors ?? 12))}/{preset?.sectors ?? 12}
          </span>
        </p>
      )}

      <div className="decision">
        <button type="button" className={`toggle ${ctx.turbo ? 'is-on' : ''}`} aria-pressed={ctx.turbo} onClick={() => controller.setTurbo(!ctx.turbo)} title="Swift wheel (T)">
          Swift
        </button>
        {s === TrialState.LADDER_DECISION ? (
          <>
            <button type="button" className="act act--claim" onClick={() => controller.claim()} data-testid="claim">
              Claim <span className="num">{formatMoney(claimNow)}</span>
            </button>
            <button type="button" className="act act--risk" onClick={() => controller.risk()} data-testid="risk" title="Risk the wheel for the next rung (Space)">
              Tempt Fate
            </button>
          </>
        ) : between ? (
          <button type="button" className="act act--risk" onClick={() => controller.start()} data-testid="begin">
            {s === TrialState.IDLE ? 'Begin the Trial' : 'Another Trial'}
          </button>
        ) : (
          <button type="button" className="act act--busy" disabled data-testid="busy">
            {busy[s] ?? '…'}
          </button>
        )}
      </div>
    </section>
  );
}
