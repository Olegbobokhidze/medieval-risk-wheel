import { useEffect, useState, useSyncExternalStore } from 'react';
import { RISK_PRESETS } from '../config/presets';
import { TrialState } from '../engine/machine';
import { ErrorLetter } from './components/ErrorLetter';
import { IconAstrolabe, IconHorn, IconHornMute, IconScroll } from './components/icons';
import { InspectorDrawer } from './components/InspectorDrawer';
import { Ledger } from './components/Ledger';
import { RulesDrawer } from './components/RulesDrawer';
import { isBetween, useGame, useSoundState, useTrial } from './hooks/game';
import { SceneView } from './SceneView';

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(t.tagName));

/** Compact ladder on short or narrow layouts (matches the CSS breakpoints). */
function useCompactLadder(): boolean {
  return useSyncExternalStore(
    (l) => {
      const m = globalThis.matchMedia?.('(max-height: 780px), (max-width: 980px)');
      m?.addEventListener('change', l);
      return () => m?.removeEventListener('change', l);
    },
    () => globalThis.matchMedia?.('(max-height: 780px), (max-width: 980px)').matches ?? false,
  );
}

export function App() {
  const game = useGame();
  const { controller, sound } = game;
  const ctx = useTrial();
  const audio = useSoundState();
  const compact = useCompactLadder();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(game.initialInspectorOpen);

  useEffect(() => {
    const unlock = () => sound.unlock();
    const vis = () => sound.setPageVisible(document.visibilityState === 'visible');
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [sound]);

  const modal = rulesOpen || ctx.state === TrialState.ERROR_RECOVERABLE;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`') {
        e.preventDefault();
        setInspectorOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        setRulesOpen(false);
        return;
      }
      if (modal || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'enter') {
        e.preventDefault();
        if (!e.repeat) controller.primary();
      } else if (k === 'c') controller.claim();
      else if (k === 't') controller.setTurbo(!controller.getSnapshot().turbo);
      else if (/^[1-3]$/.test(k) && isBetween(controller.getSnapshot().state)) {
        const p = RISK_PRESETS[Number(k) - 1];
        if (p) controller.setParams({ presetId: p.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, modal]);

  return (
    <div className="hall" data-state={ctx.state} data-inspector={inspectorOpen ? 'open' : 'closed'}>
      <header className="masthead">
        <span className="crest" aria-hidden="true" />
        <div className="masthead__text">
          <h1 className="masthead__title">The Sovereign’s Trial</h1>
          <span className="masthead__sub">
            <span className="masthead__long">&amp; the Alchemist Wheel · </span>by Oleg Bobokhidze
          </span>
        </div>
        <nav className="masthead__actions" aria-label="Court">
          <button
            type="button"
            className="stud"
            aria-pressed={audio.muted}
            aria-label={audio.muted ? 'Unmute' : 'Mute'}
            title={audio.status === 'unavailable' ? 'Sound unavailable in this browser' : undefined}
            onClick={() => {
              sound.unlock();
              sound.toggleMuted();
            }}
          >
            {audio.muted || audio.status === 'unavailable' ? <IconHornMute /> : <IconHorn />}
          </button>
          <button type="button" className="stud" aria-label="Laws of the trial" onClick={() => setRulesOpen(true)}>
            <IconScroll />
          </button>
          <button type="button" className={`stud ${inspectorOpen ? 'is-on' : ''}`} aria-pressed={inspectorOpen} aria-label="Provider inspector (backtick)" onClick={() => setInspectorOpen((v) => !v)}>
            <IconAstrolabe />
          </button>
        </nav>
      </header>

      <main className="court">
        <section className="alcove" aria-label="The Alchemist Wheel">
          <SceneView />
        </section>
        <Ledger compactLadder={compact} />
      </main>

      <footer className="colophon">The Sovereign’s Trial &amp; Alchemist Wheel · made by Oleg Bobokhidze</footer>

      <RulesDrawer open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <InspectorDrawer open={inspectorOpen} onClose={() => setInspectorOpen(false)} />
      <ErrorLetter />
    </div>
  );
}
