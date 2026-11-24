/**
 * The court scene (ADR-0002, ADR-0003): one canvas, one rAF loop (delta time) for the wheel, the pointer, the
 * alchemist, the raven and the particles. It implements WheelPort for the engine and otherwise only OBSERVES the
 * trial. Landing waits for the wheel to settle on the server's sector; a fallback timer guarantees progress.
 */
import type { Sector } from '../engine/ladder';
import type { WheelPort } from '../engine/ports';
import { POINTER_TUNING, stepPointer, type PointerState } from '../engine/pointer';
import { coast, createWheel, launch, NORMAL_TUNING, norm, planLanding, sectorUnderPointer, stepWheel, TAU, targetAngle, TURBO_TUNING, WheelPhase, type WheelMotion } from '../engine/wheel';
import { Easing } from './easing';
import { AlchemistAnimator, drawAlchemist, solveAlchemist, type AlchClip } from './characters/alchemist';
import { drawRaven, RavenAnimator, type RavenClip } from './characters/raven';
import { composeScene, type SceneLayout } from './layout';
import { Particles } from './particles';
import { bakeLighting, bakeWheelFace, drawPointer, drawStand } from './wheel-art';

export type SceneEvent =
  | { readonly type: 'launch' }
  | { readonly type: 'push' }
  | { readonly type: 'tick'; readonly strength: number }
  | { readonly type: 'tension' }
  | { readonly type: 'landed'; readonly kind: 'advance' | 'curse'; readonly sector: number }
  | { readonly type: 'collect' }
  | { readonly type: 'reforge' };

export type FrameStatsSnapshot = { readonly fps: number; readonly avgMs: number; readonly p95Ms: number; readonly maxMs: number; readonly samples: readonly number[] };

export type SceneDebug = {
  readonly wheelPhase: string;
  readonly theta: number;
  readonly omega: number;
  readonly targetAngle: number | null;
  readonly targetSector: number | null;
  readonly underPointer: number;
  readonly ticksThisSpin: number;
  /** Last landing: the server's sector vs. the sector under the pointer at the moment the wheel settled. */
  readonly lastLanding: { readonly target: number; readonly settledUnder: number } | null;
  readonly pointerDeflection: number;
  readonly alchemist: AlchClip;
  readonly raven: RavenClip;
  readonly particles: number;
  readonly events: readonly string[];
  readonly stats: FrameStatsSnapshot;
};

export type SceneOptions = {
  readonly reducedMotion: boolean;
  /** Decaying camera shake of the scene element (compositor-only transform). */
  readonly shake: (amplitude: number) => void;
};

/** If the wheel never settles (paused tab, zero-size canvas), resolve the landing anyway. */
export const LANDING_FALLBACK_MS = 12_000;
const MIN_CRUISE_MS = { normal: 480, turbo: 110 } as const;

class FrameStats {
  private readonly buf = new Float32Array(240);
  private i = 0;
  private n = 0;
  push(ms: number) {
    this.buf[this.i] = ms;
    this.i = (this.i + 1) % this.buf.length;
    this.n = Math.min(this.n + 1, this.buf.length);
  }
  snapshot(): FrameStatsSnapshot {
    if (!this.n) return { fps: 0, avgMs: 0, p95Ms: 0, maxMs: 0, samples: [] };
    const out: number[] = [];
    const start = (this.i - this.n + this.buf.length) % this.buf.length;
    for (let k = 0; k < this.n; k++) out.push(this.buf[(start + k) % this.buf.length] ?? 0);
    const sorted = [...out].sort((a, b) => a - b);
    const avg = out.reduce((a, b) => a + b, 0) / out.length;
    return { fps: avg > 0 ? 1000 / avg : 0, avgMs: avg, p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, maxMs: sorted[sorted.length - 1] ?? 0, samples: out };
  }
}

export class Scene {
  readonly wheel: WheelPort;
  private readonly g: CanvasRenderingContext2D | null;
  private layout: SceneLayout = composeScene(1, 1);
  private dpr = 1;
  private sectors: readonly Sector[] = [];
  private rung = 0;
  private face: HTMLCanvasElement | null = null;
  private oldFace: HTMLCanvasElement | null = null;
  private reforgeT = 1;
  private lighting: HTMLCanvasElement | null = null;
  private readonly motion: WheelMotion = createWheel(-Math.PI / 12);
  private readonly pointer: PointerState = { deflection: 0, velocity: 0 };
  private readonly alchemist: AlchemistAnimator;
  private readonly raven: RavenAnimator;
  private readonly particles: Particles;
  private readonly stats = new FrameStats();
  private landing: { sector: number; offset: number; kind: 'advance' | 'curse'; resolve: () => void; planned: boolean; cruiseMs: number; minCruise: number; tensed: boolean } | null = null;
  private targetAngle: number | null = null;
  /** Re-forge nudge: eases the idle wheel so the pointer rests on a heraldic (advance) sector of the new layout. */
  private nudge: { from: number; to: number; t: number } | null = null;
  private ticksThisSpin = 0;
  private lastLanding: { target: number; settledUnder: number } | null = null;
  private tincture = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  private readonly listeners = new Set<(e: SceneEvent) => void>();
  private readonly log: string[] = [];
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly o: SceneOptions,
  ) {
    this.g = canvas.getContext('2d');
    this.alchemist = new AlchemistAnimator(o.reducedMotion);
    this.raven = new RavenAnimator(o.reducedMotion);
    this.particles = new Particles(o.reducedMotion);
    this.alchemist.clips.onMarker((m) => {
      if (m === 'push') this.emit({ type: 'push' });
    });
    this.wheel = {
      launch: ({ turbo, rung }) => this.launch(turbo, rung),
      land: (sector, offset, { turbo, kind }) => this.land(sector, offset, turbo, kind),
      abort: () => this.abort(),
    };
    this.start();
  }

  // ------------------------------------------------------------ wiring

  onEvent(l: (e: SceneEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.layout = composeScene(width, height);
    this.particles.resize(width, height);
    this.rebake();
  }

  /** Show the wheel for the next spin; `animate` re-forges it with a crossfade and brass glints. */
  setWheel(sectors: readonly Sector[], rung: number, animate: boolean): void {
    const same = sectors.length === this.sectors.length && sectors.every((s, i) => s.kind === this.sectors[i]?.kind && s.charge === this.sectors[i]?.charge);
    this.rung = rung;
    if (same && this.face) return;
    this.sectors = sectors;
    if (animate && this.face && !this.o.reducedMotion) {
      this.oldFace = this.face;
      this.reforgeT = 0;
      const { cx, cy, r } = this.layout;
      this.particles.glints(cx, cy, r * 0.95, 10);
      this.emit({ type: 'reforge' });
      this.note('reforge');
    }
    this.face = this.layout.r > 0 ? bakeWheelFace(sectors, this.layout.r, this.dpr) : null;
    if (animate && this.motion.phase === WheelPhase.IDLE) this.nudgeToAdvance();
  }

  private nudgeToAdvance(): void {
    const n = this.sectors.length;
    if (!n) return;
    const theta = this.motion.theta;
    let best: number | null = null;
    for (const sec of this.sectors) {
      if (sec.kind !== 'advance') continue;
      let d = norm(targetAngle(sec.index, 0.5, n) - theta);
      if (d > Math.PI) d -= TAU;
      if (best === null || Math.abs(d) < Math.abs(best)) best = d;
    }
    if (best !== null && Math.abs(best) > 1e-3) this.nudge = { from: theta, to: theta + best, t: 0 };
  }

  /** New trial staked: the alchemist readies himself. */
  roundStart(): void {
    // The wheel usually launches on the same press; only show the ready stance if it is still at rest.
    if (this.motion.phase === WheelPhase.IDLE) this.alchemist.clips.play('ready');
    this.note('trial begun');
  }

  /** The court pays out: bow, wings spread, coins. */
  collected(): void {
    const { cx, cy, r } = this.layout;
    this.particles.coins(cx - r, cy - r * 1.1, r * 2);
    this.particles.glints(cx, cy, r * 0.6, 8);
    this.alchemist.clips.play('bow');
    this.raven.clips.play('spread');
    this.tincture = 1;
    this.emit({ type: 'collect' });
    this.note('collect');
  }

  preview(name: 'push' | 'tension' | 'triumph' | 'flinch' | 'bow' | 'curseFx'): void {
    if (name === 'curseFx') this.curseFx();
    else this.alchemist.clips.play(name);
    if (name === 'triumph') this.raven.clips.play('flutter');
    if (name === 'bow') this.raven.clips.play('spread');
    this.note(`preview ${name}`);
  }

  getDebug(): SceneDebug {
    const m = this.motion;
    return {
      wheelPhase: m.phase,
      theta: norm(m.theta),
      omega: m.omega,
      targetAngle: this.targetAngle === null ? null : norm(this.targetAngle),
      targetSector: this.landing?.sector ?? null,
      underPointer: sectorUnderPointer(m.theta, Math.max(1, this.sectors.length)),
      ticksThisSpin: this.ticksThisSpin,
      lastLanding: this.lastLanding,
      pointerDeflection: this.pointer.deflection,
      alchemist: this.alchemist.clips.current,
      raven: this.raven.clips.current,
      particles: this.particles.active,
      events: [...this.log],
      stats: this.stats.snapshot(),
    };
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.landing?.resolve();
    this.landing = null;
    this.listeners.clear();
  }

  // ------------------------------------------------------------ WheelPort

  private launch(turbo: boolean, rung: number): void {
    this.nudge = null;
    this.rung = rung;
    const turning = this.motion.phase === WheelPhase.WINDUP || this.motion.phase === WheelPhase.ACCEL || this.motion.phase === WheelPhase.CRUISE;
    if (turning) return; // already launched on the press; the follow-up SPINNING entry just keeps it going
    this.ticksThisSpin = 0;
    this.targetAngle = null;
    launch(this.motion, turbo || this.o.reducedMotion ? TURBO_TUNING : NORMAL_TUNING);
    this.alchemist.clips.play('push');
    this.raven.clips.play('hop');
    const { cx, r, floor } = this.layout;
    this.particles.dust(cx, floor, r * 0.6);
    this.emit({ type: 'launch' });
    this.note(`launch rung ${rung}`);
  }

  private land(sector: number, offset: number, turbo: boolean, kind: 'advance' | 'curse'): Promise<void> {
    this.landing?.resolve();
    return new Promise<void>((resolve) => {
      const minCruise = turbo || this.o.reducedMotion ? MIN_CRUISE_MS.turbo : MIN_CRUISE_MS.normal;
      this.landing = { sector, offset, kind, resolve, planned: false, cruiseMs: 0, minCruise, tensed: false };
      if (this.motion.phase === WheelPhase.IDLE) launch(this.motion, turbo ? TURBO_TUNING : NORMAL_TUNING);
      this.note(`land → ${kind} #${sector}`);
      const landing = this.landing;
      this.later(LANDING_FALLBACK_MS, () => {
        if (this.landing !== landing) return;
        // Frames were paused: jump to the result so the trial can continue.
        if (!landing.planned) planLanding(this.motion, sector, offset, this.sectors.length || 12);
        this.motion.theta = this.motion.target;
        this.motion.omega = 0;
        this.motion.phase = WheelPhase.IDLE;
        this.finishLanding();
      });
    });
  }

  private abort(): void {
    coast(this.motion);
    this.landing?.resolve();
    this.landing = null;
    this.alchemist.clips.play('idle');
    this.note('abort (coast)');
  }

  // ------------------------------------------------------------ loop

  private start(): void {
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const elapsed = now - this.last;
      this.last = now;
      this.stats.push(elapsed);
      this.update(Math.min(elapsed, 100));
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    const m = this.motion;
    const n = Math.max(1, this.sectors.length);
    const prev = m.theta;
    const L = this.landing;
    if (L && !L.planned) {
      if (m.phase === WheelPhase.CRUISE) L.cruiseMs += dt;
      if (m.phase === WheelPhase.CRUISE && L.cruiseMs >= L.minCruise) {
        this.targetAngle = planLanding(m, L.sector, L.offset, n);
        L.planned = true;
      }
    }
    if (this.nudge && m.phase === WheelPhase.IDLE) {
      this.nudge.t = Math.min(1, this.nudge.t + dt / 650);
      m.theta = this.nudge.from + (this.nudge.to - this.nudge.from) * Easing.inOutCubic(this.nudge.t);
      if (this.nudge.t >= 1) this.nudge = null;
    }
    const settled = stepWheel(m, dt);

    // pointer against the pins
    const pr = stepPointer(this.pointer, prev, m.theta, m.omega, n, dt, POINTER_TUNING);
    if (pr.ticks !== 0) {
      this.ticksThisSpin += Math.abs(pr.ticks);
      this.raven.onTick(pr.strength);
      const { cx, cy, r } = this.layout;
      this.particles.strike(cx, cy - r, pr.strength);
      this.emit({ type: 'tick', strength: pr.strength });
    }

    // tension: the pointer is crawling toward a curse
    if (L && L.planned && !L.tensed && m.phase === WheelPhase.DECEL && m.omega < 5.5) {
      const under = sectorUnderPointer(m.theta, n);
      const ahead = (under - 1 + n) % n; // the next sector to arrive under the pointer
      if (this.sectors[ahead]?.kind === 'curse' || this.sectors[under]?.kind === 'curse') {
        L.tensed = true;
        this.alchemist.clips.play('tension');
        this.raven.clips.play('cock');
        this.emit({ type: 'tension' });
        this.note('tension');
      }
    }
    if (settled && L && L.planned) this.finishLanding();

    // the alchemist's eyes follow the pointer tip
    const lay = this.layout;
    const s = lay.alchemist.scale;
    const head = { x: lay.alchemist.x + 10 * s, y: lay.alchemist.y - 195 * s };
    const dx = lay.cx - head.x;
    const dy = lay.cy - lay.r - head.y;
    const d = Math.hypot(dx, dy) || 1;
    this.alchemist.setGaze(dx / d, dy / d);

    this.alchemist.update(dt);
    this.raven.update(dt);
    this.particles.update(dt);
    this.tincture = Math.max(0, this.tincture - dt / 1600);
    if (this.reforgeT < 1) this.reforgeT = Math.min(1, this.reforgeT + dt / 650);
  }

  private finishLanding(): void {
    const L = this.landing;
    if (!L) return;
    this.landing = null;
    this.lastLanding = { target: L.sector, settledUnder: sectorUnderPointer(this.motion.theta, Math.max(1, this.sectors.length)) };
    const { cx, cy, r } = this.layout;
    if (L.kind === 'curse') {
      this.curseFx();
    } else {
      this.alchemist.clips.play('triumph');
      this.raven.clips.play('flutter');
      this.particles.glints(cx, cy - r, r * 0.3, 7);
      if (this.rung + 1 >= 3) this.particles.embers(cx, cy, r * 0.3, 10 + (this.rung + 1) * 4);
      this.tincture = 1;
    }
    this.emit({ type: 'landed', kind: L.kind, sector: L.sector });
    this.note(`landed ${L.kind} #${L.sector} · ${this.ticksThisSpin} ticks`);
    L.resolve();
  }

  private curseFx(): void {
    const { cx, cy, r } = this.layout;
    this.particles.curse(cx, cy - r * 0.7, Math.max(0.5, r / 200));
    this.alchemist.clips.play('flinch');
    this.raven.clips.play('flap');
    if (!this.o.reducedMotion) this.o.shake(Math.min(10, 4 + r / 60));
  }

  private rebake(): void {
    const { r } = this.layout;
    this.face = this.sectors.length ? bakeWheelFace(this.sectors, r, this.dpr) : null;
    this.oldFace = null;
    this.reforgeT = 1;
    this.lighting = bakeLighting(r, this.dpr);
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    const { cx, cy, r, floor, alchemist: A, raven: RV, width, height } = this.layout;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, width, height);

    drawStand(g, cx, cy, r, floor);

    // rotating face (with a crossfade while re-forging)
    const drawFace = (face: HTMLCanvasElement, alpha: number) => {
      const size = face.width / this.dpr;
      g.save();
      g.globalAlpha = alpha;
      g.translate(cx, cy);
      g.rotate(this.motion.theta);
      g.drawImage(face, -size / 2, -size / 2, size, size);
      g.restore();
    };
    if (this.oldFace && this.reforgeT < 1) drawFace(this.oldFace, 1);
    if (this.face) drawFace(this.face, this.oldFace ? this.reforgeT : 1);
    if (this.reforgeT >= 1) this.oldFace = null;
    if (this.lighting) g.drawImage(this.lighting, cx - r, cy - r, r * 2, r * 2);
    // axle cap (static, over the hub)
    g.fillStyle = '#14110E';
    g.beginPath();
    g.arc(cx, cy, Math.max(2, r * 0.035), 0, TAU);
    g.fill();

    // pointer: + deflection pushes the tip along the spin (to the right at the top)
    drawPointer(g, cx, cy, r, -this.pointer.deflection);

    g.save();
    g.translate(RV.x, RV.y);
    g.scale(RV.scale, RV.scale);
    drawRaven(g, this.raven.getPose());
    g.restore();

    g.save();
    g.translate(A.x, A.y);
    g.scale(A.scale, A.scale);
    const pose = this.alchemist.getPose();
    drawAlchemist(g, solveAlchemist(pose), pose, this.tincture);
    g.restore();

    this.particles.draw(g);
  }

  // ------------------------------------------------------------ utils

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private note(s: string): void {
    this.log.unshift(`${new Date().toISOString().slice(11, 23)} ${s}`);
    if (this.log.length > 10) this.log.pop();
  }

  private emit(e: SceneEvent): void {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        /* observers must not break the scene */
      }
    }
  }
}
