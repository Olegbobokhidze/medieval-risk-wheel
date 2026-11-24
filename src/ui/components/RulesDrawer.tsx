import { RISK_PRESETS } from '../../config/presets';
import { formatMultiplier } from '../../core/money';
import { ladder, reachProbability, RUNGS, TIER_NAMES, TIER_NUMERALS } from '../../engine/ladder';
import { useGame, useTrial } from '../hooks/game';
import { Drawer } from './Drawer';

export function RulesDrawer({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const { controller } = useGame();
  const ctx = useTrial();
  const edge = controller.rules.houseEdge;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="The Laws of the Trial"
      className="rules"
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose} data-autofocus>
          Return to the hall
        </button>
      }
    >
      <ol className="laws">
        <li>Choose your stake and a standard of risk, then <strong>begin the trial</strong>. The alchemist sets the wheel turning at once.</li>
        <li>Each turn of the wheel lands on a sector chosen by the court. A heraldic charge lifts you one rung up the ladder. A skull is a curse, and the stake is lost.</li>
        <li>
          After every climb, <strong>claim</strong> your purse at the current rung or <strong>risk the wheel</strong> again. Each rung re-forges the wheel with more curses.
        </li>
        <li>Reach the <em>Sovereign Crown</em> (tier V) and the purse is claimed for you.</li>
      </ol>

      <h3 className="section-title">Keys</h3>
      <dl className="keys">
        {[
          ['Space / Enter', 'Begin the trial · risk the wheel'],
          ['C', 'Claim the purse'],
          ['T', 'Swift wheel'],
          ['1 – 3', 'Standard of risk (between trials)'],
          ['`', 'Provider inspector'],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {RISK_PRESETS.map((p) => {
        const m = ladder(p, edge);
        return (
          <section key={p.id} className={`law-table ${p.id === ctx.params.presetId ? 'is-active' : ''}`}>
            <h3 className="section-title">
              {p.name} <span className="muted">· {p.motto}</span>
            </h3>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Tier</th>
                  <th scope="col">Curses</th>
                  <th scope="col">Reach</th>
                  <th scope="col">Purse</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: RUNGS }, (_, i) => (
                  <tr key={i}>
                    <td>
                      {TIER_NUMERALS[i]} · {TIER_NAMES[i]}
                    </td>
                    <td className="num">
                      {p.curses[i]}/{p.sectors}
                    </td>
                    <td className="num">{(reachProbability(p, i + 1) * 100).toFixed(1)}%</td>
                    <td className="num">{formatMultiplier(m[i] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      <h3 className="section-title">Fair dealing</h3>
      <p className="muted">
        Every purse is fair odds less a {(edge * 100).toFixed(0)}% house share, so claiming at any rung returns at most {(100 - edge * 100).toFixed(0)}%. Before your first turn the court seals a secret seed and shows you its
        SHA-256 hash. Turn <em>n</em> lands where <code>SHA-256(seed:yourSeed:nonce:n)</code> says, both the sector and the spot within it. When the trial ends, the seed is
        revealed and the inspector can re-derive every turn.
      </p>
    </Drawer>
  );
}
