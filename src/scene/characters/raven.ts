/**
 * The raven familiar: perches on the pointer housing (ADR-0003). It bobs and preens at idle, cocks its head at
 * ticks, hops on launch, flutters on an advance, flaps off in alarm on a curse and spreads its wings on a claim.
 * Local space: feet on y = 0, facing −x (toward the alchemist), ~44 units tall.
 */
import { PALETTE as C } from '../../config/palette';
import { ClipAnimator, type Clip, type Key, type KeyPose } from '../clip-animator';
import { Easing, type Ease } from '../easing';

export const RAVEN_PARAMS = ['crouch', 'lift', 'wing', 'beat', 'cock', 'dip', 'beak', 'lean'] as const;
export type RavenParam = (typeof RAVEN_PARAMS)[number];
export type RavenClip = 'idle' | 'hop' | 'cock' | 'flutter' | 'flap' | 'spread' | 'preen';

const N: Record<RavenParam, number> = { crouch: 0, lift: 0, wing: 0, beat: 0, cock: 0, dip: 0, beak: 0, lean: 0 };
const k = (at: number, pose: KeyPose<RavenParam>, ease: Ease = Easing.inOutCubic): Key<RavenParam> => ({ at, pose, ease });

export const RAVEN_CLIPS: Record<RavenClip, Clip<RavenParam, RavenClip, never>> = {
  idle: { name: 'idle', duration: 300, keys: [k(300, { ...N })], markers: [], next: null, idleWeight: 1 },
  hop: {
    name: 'hop',
    duration: 520,
    keys: [k(110, { crouch: 1, wing: 0.15 }, Easing.outQuad), k(250, { crouch: 0, lift: 9, wing: 0.55, beat: 0.6 }, Easing.outBack), k(520, { lift: 0, wing: 0, beat: 0 }, Easing.outSpring)],
    markers: [],
    next: 'idle',
    idleWeight: 0.2,
  },
  cock: { name: 'cock', duration: 420, keys: [k(90, { cock: 1, dip: 0.2 }, Easing.outBack), k(420, { cock: 0.3, dip: 0 }, Easing.inOutSine)], markers: [], next: null, idleWeight: 0.7 },
  flutter: {
    name: 'flutter',
    duration: 760,
    keys: [k(120, { crouch: 0.6 }, Easing.outQuad), k(260, { crouch: 0, wing: 0.8, beat: 1, lift: 4, beak: 0.6 }, Easing.outBack), k(760, { wing: 0, beat: 0, lift: 0, beak: 0, cock: 0 }, Easing.inOutCubic)],
    markers: [],
    next: 'idle',
    idleWeight: 0.2,
  },
  flap: {
    name: 'flap',
    duration: 1500,
    keys: [
      k(70, { crouch: 0.8, beak: 1, lean: 0.3 }, Easing.outQuad),
      k(260, { crouch: 0, lift: 40, wing: 1, beat: 1, lean: -0.3 }, Easing.outCubic),
      k(900, { lift: 30, beak: 0.2 }, Easing.inOutSine),
      k(1500, { lift: 0, wing: 0, beat: 0, lean: 0, beak: 0 }, Easing.inOutCubic),
    ],
    markers: [],
    next: 'idle',
    idleWeight: 0,
  },
  spread: {
    name: 'spread',
    duration: 1200,
    keys: [k(150, { crouch: 0.5 }, Easing.outQuad), k(420, { crouch: 0, wing: 1, beat: 0.25, beak: 0.7, lean: -0.15 }, Easing.outBack), k(1200, { ...N }, Easing.inOutCubic)],
    markers: [],
    next: 'idle',
    idleWeight: 0.3,
  },
  preen: {
    name: 'preen',
    duration: 1100,
    keys: [k(260, { dip: 1, cock: -0.6, wing: 0.2 }, Easing.inOutSine), k(700, { dip: 0.8, cock: -0.4 }, Easing.inOutSine), k(1100, { dip: 0, cock: 0, wing: 0 }, Easing.inOutCubic)],
    markers: [],
    next: 'idle',
    idleWeight: 0.5,
  },
};

export type RavenPose = Readonly<Record<RavenParam, number>> & { readonly bob: number; readonly flap: number; readonly blink: number };

export class RavenAnimator {
  readonly clips: ClipAnimator<RavenParam, RavenClip, never>;
  private clock = 0;
  private nextFidget = 3000;
  private blinkT = -1;
  private nextBlink = 1800;
  private pose: RavenPose;

  constructor(
    private readonly reduced: boolean,
    private readonly random: () => number = Math.random,
  ) {
    this.clips = new ClipAnimator(RAVEN_PARAMS, N, RAVEN_CLIPS, 'idle', reduced ? 3 : 1);
    this.pose = { ...N, bob: 0, flap: 0, blink: 0 };
  }

  getPose(): RavenPose {
    return this.pose;
  }

  /** React to a pointer tick: occasionally cock the head, more often when the wheel is slow. */
  onTick(strength: number): void {
    if (this.clips.current !== 'idle' && this.clips.current !== 'cock') return;
    if (this.random() < (strength < 0.3 ? 0.35 : 0.06)) this.clips.play('cock');
  }

  update(dt: number): RavenPose {
    this.clock += dt;
    const v = this.clips.update(dt);
    if (!this.reduced && this.clips.current === 'idle' && (this.nextFidget -= dt) <= 0) {
      this.clips.play(this.random() < 0.55 ? 'preen' : 'cock');
      this.nextFidget = 3500 + this.random() * 5000;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 120) this.blinkT = -1;
    } else if ((this.nextBlink -= dt) <= 0) {
      this.blinkT = 0;
      this.nextBlink = 1500 + this.random() * 3000;
    }
    const w = this.reduced ? 0 : this.clips.idleWeight;
    this.pose = {
      ...v,
      bob: Math.sin((this.clock / 1000) * Math.PI * 2 * 0.6) * w,
      // wing beats: fast oscillation scaled by the keyed beat amount
      flap: this.reduced ? 0 : Math.sin((this.clock / 1000) * Math.PI * 2 * 7) * v.beat,
      blink: this.blinkT >= 0 ? 1 : 0,
    };
    return this.pose;
  }
}

export function drawRaven(g: CanvasRenderingContext2D, p: RavenPose): void {
  const y0 = -p.lift - 2 + p.crouch * 3 + p.bob * 0.8;
  // perch shadow + feet
  g.fillStyle = 'rgba(10, 6, 3, 0.35)';
  g.beginPath();
  g.ellipse(0, 1, 10 - Math.min(6, p.lift * 0.15), 2, 0, 0, Math.PI * 2);
  g.fill();
  if (p.lift < 3) {
    g.strokeStyle = '#2A2420';
    g.lineWidth = 1.6;
    for (const fx of [-3, 3]) {
      g.beginPath();
      g.moveTo(fx, y0 + 6);
      g.lineTo(fx, 0);
      g.lineTo(fx - 3, 0);
      g.stroke();
    }
  }
  g.save();
  g.translate(0, y0);
  g.rotate(p.lean);
  // tail
  g.fillStyle = C.raven;
  g.beginPath();
  g.moveTo(8, -2);
  g.lineTo(20, 4);
  g.lineTo(19, 8);
  g.lineTo(6, 3);
  g.fill();
  // far wing (spread)
  if (p.wing > 0.05) {
    const a = -0.4 - p.wing * 1.2 + p.flap * 0.6;
    g.save();
    g.translate(3, -8);
    g.rotate(a);
    g.fillStyle = '#141110';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(22 * p.wing + 6, -4);
    g.lineTo(26 * p.wing + 4, 4);
    g.lineTo(18 * p.wing, 6);
    g.lineTo(6, 6);
    g.closePath();
    g.fill();
    g.restore();
  }
  // body, with a warm lamp-light rim along the back so the black bird reads against dark stone
  g.fillStyle = C.raven;
  g.beginPath();
  g.ellipse(0, -6, 11, 8, -0.25, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(235, 203, 130, 0.55)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.ellipse(0, -6, 11, 8, -0.25, Math.PI * 1.05, Math.PI * 1.75);
  g.stroke();
  // folded near wing with a warm sheen line
  const wa = p.wing > 0.05 ? 0.4 + p.wing * 1.1 - p.flap * 0.6 : 0;
  g.save();
  g.translate(1, -8);
  g.rotate(-wa);
  g.fillStyle = '#231E1A';
  g.beginPath();
  g.moveTo(-6, -1);
  g.quadraticCurveTo(6, -4, 16 + p.wing * 12, 4);
  g.lineTo(2, 6);
  g.closePath();
  g.fill();
  g.strokeStyle = C.ravenSheen;
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(-4, 0);
  g.quadraticCurveTo(6, -2, 14 + p.wing * 10, 3);
  g.stroke();
  g.restore();
  // head: cocks and dips; beak opens to caw
  g.save();
  g.translate(-8, -13 + p.dip * 6);
  g.rotate(p.cock * 0.5 + p.dip * 0.7);
  g.fillStyle = C.raven;
  g.beginPath();
  g.arc(0, 0, 6.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(235, 203, 130, 0.5)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(0, 0, 6.5, Math.PI * 1.15, Math.PI * 1.85);
  g.stroke();
  g.fillStyle = '#3A332D';
  g.beginPath();
  g.moveTo(-5, -1.5);
  g.lineTo(-14, 1 - p.beak * 1.5);
  g.lineTo(-5, 1);
  g.fill();
  g.beginPath();
  g.moveTo(-5, 1.5);
  g.lineTo(-12, 2.5 + p.beak * 3);
  g.lineTo(-5, 3.5);
  g.fill();
  if (!p.blink) {
    g.fillStyle = '#E8DDC6';
    g.beginPath();
    g.arc(-2.4, -1.8, 1.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.ink;
    g.beginPath();
    g.arc(-2.6, -1.8, 0.8, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.restore();
}
