/**
 * React ↔ Canvas bridge (ADR-0002). Creates the Scene once, attaches it as the engine's WheelPort, keeps the canvas
 * sized, and tells the scene which wheel to show. It never renders per frame.
 */
import { useEffect, useRef } from 'react';
import { findPreset } from '../config/presets';
import { RUNGS, wheelFor } from '../engine/ladder';
import { TrialState } from '../engine/machine';
import { Scene } from '../scene/scene';
import { useGame, usePrefersReducedMotion, useTrial } from './hooks/game';
import { bindSceneSound } from './scene-sound';
import { ResultScroll } from './components/ResultScroll';

/** Decaying random camera shake (Web Animations, transform only). */
function shakeKeyframes(a: number): Keyframe[] {
  const f: Keyframe[] = [{ transform: 'translate(0, 0)' }];
  for (let i = 1; i <= 8; i++) {
    const amp = a * (1 - i / 9) ** 2;
    f.push({ transform: `translate(${((i % 2 ? -1 : 1) * amp * (0.6 + Math.random() * 0.4)).toFixed(2)}px, ${((Math.random() - 0.5) * amp).toFixed(2)}px)` });
  }
  f.push({ transform: 'translate(0, 0)' });
  return f;
}

export function SceneView() {
  const { controller, sound, scene: holder } = useGame();
  const ctx = useTrial();
  const reduced = usePrefersReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const scene = new Scene(canvas, { reducedMotion: reduced, shake: (a) => host.animate(shakeKeyframes(a), { duration: 480, easing: 'linear' }) });
    sceneRef.current = scene;
    const resize = () => {
      const r = host.getBoundingClientRect();
      scene.resize(Math.round(r.width), Math.round(r.height));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const snap = controller.getSnapshot();
    const preset = findPreset(snap.params.presetId);
    if (preset) scene.setWheel(wheelFor(preset, 0), 0, false);
    controller.attachWheel(scene.wheel);
    holder.set(scene);
    const offAudio = bindSceneSound(scene, sound, () => controller.getSnapshot().trial?.rung ?? 0);
    return () => {
      offAudio();
      ro.disconnect();
      controller.attachWheel(null);
      holder.set(null);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [controller, sound, holder, reduced]);

  // Which wheel is on the axle: the one for the next spin from the current rung. Re-forged after each climb.
  const presetId = ctx.trial?.params.presetId ?? ctx.params.presetId;
  const rung = ctx.trial?.rung ?? 0;
  const turning = ctx.state === TrialState.SPINNING || ctx.state === TrialState.RESOLVING_SECTOR;
  useEffect(() => {
    const preset = findPreset(presetId);
    if (!preset || turning) return;
    sceneRef.current?.setWheel(wheelFor(preset, Math.min(rung, RUNGS - 1)), rung, true);
  }, [presetId, rung, turning]);

  // Observe trial milestones.
  const trialId = ctx.trial?.trialId ?? null;
  const collectedFor = useRef<string | null>(null);
  useEffect(() => {
    if (ctx.state === TrialState.CONFIGURING) sceneRef.current?.roundStart();
    if (ctx.state === TrialState.ROUND_OVER_COLLECTED && trialId && collectedFor.current !== trialId) {
      collectedFor.current = trialId;
      sceneRef.current?.collected();
    }
  }, [ctx.state, trialId]);

  return (
    <div className="stage" ref={hostRef} data-state={ctx.state}>
      <canvas ref={canvasRef} className="stage__canvas" role="img" aria-label="The Alchemist Wheel, the alchemist Aldric Vane and his raven" />
      <ResultScroll />
    </div>
  );
}
