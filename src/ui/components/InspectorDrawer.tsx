import { useEffect, useState, useSyncExternalStore } from 'react';
import { verifyTrial, type TrialVerification } from '../../adapters/fairness';
import { FORCED_LABELS, ForcedOutcome } from '../../adapters/mock-provider';
import { findPreset } from '../../config/presets';
import type { TransitionRecord } from '../../core/machine';
import { formatMultiplier } from '../../core/money';
import { TIER_NAMES } from '../../engine/ladder';
import { TRIAL_STATE_ORDER, TrialState } from '../../engine/machine';
import type { SceneDebug } from '../../scene/scene';
import { isBetween, useCue, useGame, useMock, useTrial } from '../hooks/game';
import { Drawer } from './Drawer';

const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(1)}°`;

export function InspectorDrawer({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const { controller } = useGame();
  const [history, setHistory] = useState<readonly TransitionRecord[]>([]);
  const [lastResponse, setLastResponse] = useState('—');

  useEffect(() => {
    if (!open) return;
    setHistory([...controller.getHistory()]);
    return controller.onTransition(() => setHistory([...controller.getHistory()]));
  }, [open, controller]);

  useCue((c) => {
    if (c.type === 'response') setLastResponse(`${c.kind} #${c.requestId} · ${c.ok ? 'ok' : 'error'} · ${c.latencyMs.toFixed(0)} ms`);
  });

  const exportLog = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), transitions: controller.getHistory() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-transitions-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      modal={false}
      className="inspector"
      title={
        <>
          Provider Inspector <kbd>`</kbd>
        </>
      }
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              controller.clearHistory();
              setHistory([]);
            }}
          >
            Clear log
          </button>
          <button type="button" className="btn btn--ghost" onClick={exportLog}>
            Export log
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {open && (
        <>
          <StateSection />
          <SceneSection />
          <TrialSection />
          <MockSection lastResponse={lastResponse} />
          <LogSection history={history} />
        </>
      )}
    </Drawer>
  );
}

function StateSection() {
  const ctx = useTrial();
  const { formatMoney } = useGame();
  const preset = findPreset(ctx.trial?.params.presetId ?? ctx.params.presetId);
  return (
    <section className="insp">
      <h3 className="insp__title">Trial state machine</h3>
      <ol className="chain">
        {TRIAL_STATE_ORDER.map((s) => (
          <li key={s} className={`pill ${s === ctx.state ? 'is-active' : ''} ${s === TrialState.ERROR_RECOVERABLE || s === TrialState.ROUND_OVER_BUST ? 'is-grave' : ''}`}>
            {s}
          </li>
        ))}
      </ol>
      <dl className="kv">
        <div>
          <dt>risk preset</dt>
          <dd data-testid="insp-preset">{preset?.id ?? '—'}</dd>
        </div>
        <div>
          <dt>rung</dt>
          <dd>{ctx.trial ? `${ctx.trial.rung} ${ctx.trial.rung ? `(${TIER_NAMES[ctx.trial.rung - 1]})` : ''} · ${formatMultiplier(ctx.trial.multiplier)}` : '—'}</dd>
        </div>
        <div>
          <dt>treasury</dt>
          <dd>{formatMoney(ctx.balance)}</dd>
        </div>
        <div>
          <dt>in flight</dt>
          <dd>{ctx.inFlight ? `${ctx.inFlight.kind} #${ctx.inFlight.request.requestId}` : '—'}</dd>
        </div>
        <div>
          <dt>trials played</dt>
          <dd>{ctx.roundsPlayed}</dd>
        </div>
      </dl>
    </section>
  );
}

function SceneSection() {
  const { scene } = useGame();
  const current = useSyncExternalStore(scene.subscribe, scene.get);
  const [d, setD] = useState<SceneDebug | null>(null);
  useEffect(() => {
    if (!current) return;
    const id = window.setInterval(() => setD(current.getDebug()), 200);
    return () => window.clearInterval(id);
  }, [current]);
  const samples = d?.stats.samples ?? [];
  const W = 280;
  const H = 40;
  const pts = samples.map((v, i) => `${(i / Math.max(1, samples.length - 1)) * W},${H - (Math.min(v, 50) / 50) * H}`).join(' ');
  return (
    <section className="insp">
      <h3 className="insp__title">Wheel physics · characters · FX</h3>
      <dl className="kv">
        <div>
          <dt>wheel</dt>
          <dd data-testid="insp-wheel">
            {d ? `${d.wheelPhase} · θ ${deg(d.theta)} · ω ${d.omega.toFixed(2)} rad/s` : '—'}
          </dd>
        </div>
        <div>
          <dt>target angle</dt>
          <dd data-testid="insp-target">{d?.targetAngle != null ? `${deg(d.targetAngle)} → sector ${(d.targetSector ?? 0) + 1}` : '—'}</dd>
        </div>
        <div>
          <dt>last landing</dt>
          <dd data-testid="insp-landing">{d?.lastLanding ? `server #${d.lastLanding.target + 1} · settled under pointer #${d.lastLanding.settledUnder + 1}` : '—'}</dd>
        </div>
        <div>
          <dt>under pointer</dt>
          <dd data-testid="insp-under">sector {(d?.underPointer ?? 0) + 1}</dd>
        </div>
        <div>
          <dt>pin ticks (spin)</dt>
          <dd data-testid="insp-ticks">
            {d?.ticksThisSpin ?? 0} · pointer {deg(d?.pointerDeflection ?? 0)}
          </dd>
        </div>
        <div>
          <dt>alchemist / raven</dt>
          <dd data-testid="insp-chars">
            {d ? `${d.alchemist} / ${d.raven}` : '—'}
          </dd>
        </div>
        <div>
          <dt>particles</dt>
          <dd data-testid="insp-particles">{d?.particles ?? 0} / 480</dd>
        </div>
        <div>
          <dt>scene events</dt>
          <dd data-testid="insp-events">{d?.events.slice(0, 4).join(' · ') || '—'}</dd>
        </div>
      </dl>
      <div className="preview-row" role="group" aria-label="Preview character clips (cosmetic only)">
        {(['push', 'tension', 'triumph', 'flinch', 'bow', 'curseFx'] as const).map((p) => (
          <button key={p} type="button" className="btn btn--ghost btn--sm" disabled={!current} onClick={() => current?.preview(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="perf">
        <span className={`perf__fps num ${d && d.stats.fps < 50 ? 'is-warn' : ''}`} data-testid="insp-fps">
          {d ? d.stats.fps.toFixed(0) : '—'}
          <small>fps</small>
        </span>
        <span className="perf__stats num" data-testid="insp-perf">
          avg {d?.stats.avgMs.toFixed(1) ?? '—'} · p95 {d?.stats.p95Ms.toFixed(1) ?? '—'} · max {d?.stats.maxMs.toFixed(1) ?? '—'} ms
        </span>
      </div>
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Frame time, last 240 frames">
        <line x1={0} x2={W} y1={H - (16.67 / 50) * H} y2={H - (16.67 / 50) * H} className="spark__budget" />
        <polyline points={pts} className="spark__line" />
      </svg>
    </section>
  );
}

function TrialSection() {
  const { controller } = useGame();
  const ctx = useTrial();
  const t = ctx.trial;
  const [v, setV] = useState<{ id: string; r: TrialVerification } | null>(null);
  const [seed, setSeed] = useState(ctx.params.clientSeed);
  const between = isBetween(ctx.state);
  const verify = async () => {
    if (!t?.serverSeed) return;
    const preset = findPreset(t.params.presetId);
    const r = await verifyTrial({ serverSeed: t.serverSeed, serverSeedHash: t.serverSeedHash, clientSeed: t.params.clientSeed, nonce: t.nonce, sectors: preset?.sectors ?? 12, spins: t.spins });
    setV({ id: t.trialId, r });
  };
  return (
    <section className="insp">
      <h3 className="insp__title">Trial & fair dealing</h3>
      <form
        className="field field--inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (seed.trim()) controller.setParams({ clientSeed: seed.trim() });
        }}
      >
        <label className="field__label" htmlFor="client-seed">
          Your seed
        </label>
        <input id="client-seed" value={seed} disabled={!between} maxLength={64} onChange={(e) => setSeed(e.target.value)} />
        <button type="submit" className="btn btn--ghost btn--sm" disabled={!between}>
          Set
        </button>
      </form>
      {t ? (
        <>
          <dl className="kv">
            <div>
              <dt>trial / nonce</dt>
              <dd>
                {t.trialId} / {t.nonce}
              </dd>
            </div>
            <div>
              <dt>commitment</dt>
              <dd className="hash" title={t.serverSeedHash}>
                {t.serverSeedHash.slice(0, 24)}…
              </dd>
            </div>
            <div>
              <dt>court seed</dt>
              <dd className="hash">{t.serverSeed ?? 'sealed until the trial ends'}</dd>
            </div>
            <div>
              <dt>turns</dt>
              <dd>{t.spins.map((s) => `${s.spin}:${s.kind === 'curse' ? '☠' : '↑'}#${s.sectorIndex + 1}@${s.offset.toFixed(2)}`).join(' ') || '—'}</dd>
            </div>
          </dl>
          <div className="row-actions">
            <button type="button" className="btn btn--ghost btn--sm" disabled={!t.serverSeed} onClick={() => void verify()} data-testid="verify">
              Verify trial
            </button>
          </div>
          {v && v.id === t.trialId && (
            <p className={`verdict ${v.r.commitmentOk && v.r.spinsOk ? 'is-ok' : 'is-bad'}`} role="status" data-testid="verdict">
              Seal {v.r.commitmentOk ? '✓ matches' : '✗ broken'} · turns {v.r.spinsOk ? '✓ re-derived exactly' : '✗ differ (forced by QA)'}
            </p>
          )}
        </>
      ) : (
        <p className="muted small">No trial begun.</p>
      )}
    </section>
  );
}

function MockSection({ lastResponse }: { readonly lastResponse: string }) {
  const { provider, controller, formatMoney } = useGame();
  const { settings, wallet } = useMock();
  const [min, max] = settings.latencyMs;
  return (
    <section className="insp">
      <h3 className="insp__title">Mock court (TrialProvider)</h3>
      <label className="field">
        <span className="field__label">Force next</span>
        <select value={settings.forced} onChange={(e) => provider.updateSettings({ forced: e.target.value as ForcedOutcome })} data-testid="force">
          {Object.values(ForcedOutcome).map((f) => (
            <option key={f} value={f}>
              {FORCED_LABELS[f]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label num">
          Latency {min}–{max} ms
        </span>
        <div className="range-pair">
          <input type="range" min={0} max={3000} step={20} value={min} aria-label="Minimum latency" onChange={(e) => provider.updateSettings({ latencyMs: [Number(e.target.value), Math.max(Number(e.target.value), max)] })} />
          <input type="range" min={0} max={3000} step={20} value={max} aria-label="Maximum latency" onChange={(e) => provider.updateSettings({ latencyMs: [Math.min(min, Number(e.target.value)), Number(e.target.value)] })} />
        </div>
      </label>
      <label className="field">
        <span className="field__label num">Random courier failure {(settings.errorRate * 100).toFixed(0)}%</span>
        <input type="range" min={0} max={50} value={Math.round(settings.errorRate * 100)} onChange={(e) => provider.updateSettings({ errorRate: Number(e.target.value) / 100 })} />
      </label>
      <dl className="kv">
        <div>
          <dt>last answer</dt>
          <dd>{lastResponse}</dd>
        </div>
        <div>
          <dt>court treasury</dt>
          <dd>{formatMoney(wallet)}</dd>
        </div>
      </dl>
      <div className="row-actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            provider.setWallet(wallet + 100_000);
            controller.syncBalance();
          }}
        >
          +£1,000 to treasury
        </button>
      </div>
    </section>
  );
}

function LogSection({ history }: { readonly history: readonly TransitionRecord[] }) {
  const rows = history.slice(-120).reverse();
  const t0 = history[0]?.at ?? 0;
  return (
    <section className="insp">
      <h3 className="insp__title">
        Transition log <span className="muted small">newest first · {history.length}</span>
      </h3>
      <div className="log" role="log">
        <table>
          <thead>
            <tr>
              <th scope="col">+ms</th>
              <th scope="col">event</th>
              <th scope="col">from → to</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.seq} className={r.accepted ? '' : 'is-rejected'} title={r.iso}>
                <td className="num">{(r.at - t0).toFixed(0)}</td>
                <td>
                  {r.event}
                  {r.detail && <span className="log__detail">{r.detail}</span>}
                </td>
                <td>{r.from === r.to ? <span className="muted">{r.to}</span> : `${r.from} → ${r.to}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted small">No transitions yet.</p>}
      </div>
    </section>
  );
}
