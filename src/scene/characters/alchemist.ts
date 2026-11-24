/**
 * Master Alchemist Aldric Vane: rigged, procedurally drawn court alchemist (ADR-0003). No image assets.
 * Oxblood velvet hat with a tarnished brass band, umber robe lined in crimson, rope belt with a pouch, long grey
 * beard, and an amber flask in the off hand. Lamp-light from the upper left. Local space: feet on y = 0, up is −y,
 * facing +x (toward the wheel).
 */
import { PALETTE as C } from '../../config/palette';
import { ClipAnimator, type Clip, type Key, type KeyPose } from '../clip-animator';
import { Easing, lerp, type Ease } from '../easing';

export const ALCH_PARAMS = ['crouch', 'lean', 'knock', 'headTilt', 'headTurn', 'reach', 'raise', 'clasp', 'shield', 'bow', 'hatTip', 'hatLift', 'mouth', 'brow', 'squint'] as const;
export type AlchParam = (typeof ALCH_PARAMS)[number];
export type AlchClip = 'idle' | 'ready' | 'push' | 'watch' | 'tension' | 'triumph' | 'flinch' | 'bow';
export type AlchMarker = 'push' | 'cheer' | 'stagger' | 'flourish';

const NEUTRAL: Record<AlchParam, number> = {
  crouch: 0.04,
  lean: 0.03,
  knock: 0,
  headTilt: 0,
  headTurn: 0.4,
  reach: 0,
  raise: 0,
  clasp: 0,
  shield: 0,
  bow: 0,
  hatTip: 0,
  hatLift: 0,
  mouth: 0.1,
  brow: 0.15,
  squint: 0.15,
};

const k = (at: number, pose: KeyPose<AlchParam>, ease: Ease = Easing.inOutCubic): Key<AlchParam> => ({ at, pose, ease });
type AClip = Clip<AlchParam, AlchClip, AlchMarker>;

/** ms from launch to the alchemist's push. The wheel's wind-up takes the same time (engine/wheel NORMAL_TUNING). */
export const PUSH_MS = 190;

export const ALCH_CLIPS: Record<AlchClip, AClip> = {
  idle: { name: 'idle', duration: 500, keys: [k(500, { ...NEUTRAL })], markers: [], next: null, idleWeight: 1 },
  ready: {
    name: 'ready',
    duration: 340,
    keys: [k(140, { crouch: 0.16, lean: 0.12, headTurn: 1, brow: 0.35 }, Easing.outQuad), k(340, { reach: 0.3, squint: 0.4, mouth: 0 }, Easing.outBack)],
    markers: [],
    next: null,
    idleWeight: 0.6,
  },
  push: {
    name: 'push',
    duration: 560,
    keys: [
      // anticipation: wind back with the wheel
      k(PUSH_MS - 20, { crouch: 0.24, lean: -0.12, reach: 0.15, headTurn: 1, squint: 0.5, knock: 0, shield: 0, raise: 0, clasp: 0, bow: 0, hatLift: 0 }, Easing.outQuad),
      // strike: thrust the wheel
      k(PUSH_MS + 70, { lean: 0.24, reach: 1, crouch: 0.1, mouth: -0.1 }, Easing.outBack),
      // follow-through
      k(560, { reach: 0.45, lean: 0.08, crouch: 0.06, mouth: 0.1 }, Easing.outSpring),
    ],
    markers: [{ at: PUSH_MS, name: 'push' }],
    next: 'watch',
    idleWeight: 0.2,
  },
  watch: {
    name: 'watch',
    duration: 400,
    keys: [k(400, { reach: 0.2, headTurn: 1, lean: 0.06, brow: 0.25, squint: 0.35, clasp: 0 })],
    markers: [],
    next: null,
    idleWeight: 0.5,
  },
  tension: {
    name: 'tension',
    duration: 320,
    keys: [k(320, { clasp: 1, reach: 0, lean: 0.16, brow: 1, mouth: -0.35, squint: 0.7, crouch: 0.12 }, Easing.outBack)],
    markers: [],
    next: null,
    idleWeight: 0.3,
  },
  triumph: {
    name: 'triumph',
    duration: 1400,
    keys: [
      k(130, { crouch: 0.26, raise: 0.1, clasp: 0, reach: 0.2 }, Easing.outQuad),
      k(400, { raise: 1, crouch: 0.02, lean: -0.1, mouth: 1, brow: 0, squint: 0.2, hatTip: -0.12, reach: 0.55 }, Easing.outBack),
      k(950, { raise: 0.85, hatTip: -0.08 }, Easing.inOutSine),
      k(1400, { ...NEUTRAL, mouth: 0.5, headTurn: 0.8 }, Easing.inOutCubic),
    ],
    markers: [{ at: 400, name: 'cheer' }],
    next: 'idle',
    idleWeight: 0.3,
  },
  flinch: {
    name: 'flinch',
    duration: 1400,
    keys: [
      k(90, { knock: 1, lean: -0.32, shield: 1, headTurn: -1, squint: 1, mouth: -1, brow: 1, hatLift: 1, crouch: 0.45, clasp: 0, reach: 0, raise: 0 }, Easing.outQuad),
      k(300, { knock: 0.82, hatLift: 0.5 }, Easing.outCubic),
      k(820, { knock: 0.3, hatLift: 0, shield: 0.45, crouch: 0.3, headTilt: 0.14 }, Easing.inOutCubic),
      k(1050, { headTilt: -0.1, headTurn: 0.3 }, Easing.inOutSine),
      k(1400, { ...NEUTRAL, mouth: -0.2, brow: 0.5 }, Easing.outSpring),
    ],
    markers: [{ at: 90, name: 'stagger' }],
    next: 'idle',
    idleWeight: 0.15,
  },
  bow: {
    name: 'bow',
    duration: 1600,
    keys: [
      k(180, { lean: -0.06, raise: 0.25, clasp: 0, reach: 0.3, mouth: 0.6 }, Easing.outQuad),
      k(560, { bow: 1, hatTip: 0.35, raise: 0.35, reach: 0.65, mouth: 0.9, squint: 0.5 }, Easing.inOutCubic),
      k(1100, { bow: 0.9 }, Easing.inOutSine),
      k(1600, { ...NEUTRAL, mouth: 0.6 }, Easing.inOutCubic),
    ],
    markers: [{ at: 560, name: 'flourish' }],
    next: 'idle',
    idleWeight: 0.2,
  },
};

export type AlchemistPose = Readonly<Record<AlchParam, number>> & {
  readonly breath: number;
  readonly blink: number;
  readonly shift: number;
  /** Eye focus: −1 away … +1 toward the wheel; −1 (up) … +1 (down). */
  readonly lookX: number;
  readonly lookY: number;
  readonly sway: number;
  readonly hatLag: number;
};

/** Clips + procedural layer (breath, blinks, weight shift, gaze, springs). */
export class AlchemistAnimator {
  readonly clips: ClipAnimator<AlchParam, AlchClip, AlchMarker>;
  private clock = 0;
  private blinkT = -1;
  private nextBlink = 2400;
  private shift = 0;
  private shiftTarget = 0;
  private nextShift = 2600;
  private sway = 0;
  private swayV = 0;
  private hatLag = 0;
  private hatLagV = 0;
  private prevDrive = 0;
  private gazeX = 0.6;
  private gazeY = 0;
  private gazeTarget: { x: number; y: number } = { x: 0.6, y: 0 };
  private pose: AlchemistPose;

  constructor(
    private readonly reduced: boolean,
    private readonly random: () => number = Math.random,
  ) {
    this.clips = new ClipAnimator(ALCH_PARAMS, NEUTRAL, ALCH_CLIPS, 'idle', reduced ? 3 : 1);
    this.pose = { ...NEUTRAL, breath: 0, blink: 0, shift: 0, lookX: 0.6, lookY: 0, sway: 0, hatLag: 0 };
  }

  /** Where the eyes look (normalised −1..1), e.g. the pointer tip relative to the head. */
  setGaze(x: number, y: number): void {
    this.gazeTarget = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  getPose(): AlchemistPose {
    return this.pose;
  }

  update(dt: number): AlchemistPose {
    this.clock += dt;
    const v = this.clips.update(dt);
    const w = this.reduced ? 0 : this.clips.idleWeight;
    if (!this.reduced) {
      this.nextShift -= dt;
      if (this.nextShift <= 0) {
        this.shiftTarget = (this.random() - 0.5) * 7;
        this.nextShift = 2400 + this.random() * 2800;
      }
      this.shift += (this.shiftTarget - this.shift) * (1 - Math.exp(-dt / 650));
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        if (this.blinkT > 150) this.blinkT = -1;
      } else if ((this.nextBlink -= dt) <= 0) {
        this.blinkT = 0;
        this.nextBlink = 1900 + this.random() * 3600;
      }
      // secondary springs driven by body motion
      const drive = v.lean * 34 - v.knock * 28 + v.bow * 22 - v.crouch * 10;
      const vel = (drive - this.prevDrive) / Math.max(1, dt);
      this.prevDrive = drive;
      const s = dt / 1000;
      this.swayV += (-110 * this.sway - 8 * this.swayV - vel * 950) * s;
      this.sway = Math.max(-16, Math.min(16, this.sway + this.swayV * s));
      this.hatLagV += (-150 * (this.hatLag + (v.lean + v.knock * 0.8) * 0.12) - 10 * this.hatLagV) * s;
      this.hatLag = Math.max(-0.4, Math.min(0.4, this.hatLag + this.hatLagV * s));
    }
    const follow = 1 - Math.exp(-dt / 90);
    this.gazeX += (this.gazeTarget.x - this.gazeX) * follow;
    this.gazeY += (this.gazeTarget.y - this.gazeY) * follow;
    this.pose = {
      ...v,
      shift: this.shift * w,
      breath: Math.sin((this.clock / 1000) * Math.PI * 2 * 0.24) * w,
      blink: this.blinkT >= 0 ? Math.sin(Math.min(1, this.blinkT / 150) * Math.PI) : 0,
      lookX: this.gazeX,
      lookY: this.gazeY,
      sway: this.sway + Math.sin(this.clock / 1100) * 1.4 * w,
      hatLag: this.hatLag,
    };
    return this.pose;
  }
}

// ------------------------------------------------------------------ rig

type P = { x: number; y: number };
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const up = (a: number, len: number): P => ({ x: Math.sin(a) * len, y: -Math.cos(a) * len });
const rot = (p: P, a: number): P => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
const mix = (a: P, b: P, t: number): P => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

function ik(root: P, target: P, a: number, b: number, bend: number): P {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const d = Math.min(Math.hypot(dx, dy), a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const off = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const ang = base + off * bend;
  return { x: root.x + Math.cos(ang) * a, y: root.y + Math.sin(ang) * a };
}

export type AlchemistRig = {
  hip: P;
  neck: P;
  head: P;
  torso: number;
  headAngle: number;
  shoulderF: P;
  shoulderB: P;
  elbowF: P;
  handF: P;
  elbowB: P;
  handB: P;
  hat: P;
  hatAngle: number;
};

export function solveAlchemist(p: AlchemistPose): AlchemistRig {
  const hip = { x: p.shift - p.knock * 20, y: -96 + p.crouch * 14 - p.breath * 0.6 };
  const torso = p.lean - p.knock * 0.12 + p.bow * 0.62;
  const neck = add(hip, up(torso, 68 + p.breath * 1.2));
  const headAngle = torso + p.headTilt + p.bow * 0.2;
  const head = add(neck, up(headAngle, 19));
  const shoulderF = add(neck, rot({ x: 6, y: 10 }, torso));
  const shoulderB = add(neck, rot({ x: -8, y: 11 }, torso));

  // Front hand: rest at the belt → reaching for the wheel → clasped at the chest.
  const restF = add(hip, { x: 15, y: -10 });
  const reachF = add(shoulderF, { x: 52, y: -4 });
  const chest = add(neck, rot({ x: 12, y: 30 }, torso));
  let handF = mix(restF, reachF, p.reach);
  handF = mix(handF, chest, p.clasp);
  const elbowF = ik(shoulderF, handF, 29, 28, 1);

  // Off hand (flask): at the side → raised aloft → shielding the face → clasped.
  const restB = add(hip, { x: -8, y: -4 });
  const raiseB = add(shoulderB, { x: 10, y: -58 });
  const shieldB = add(head, { x: 16, y: 6 });
  let handB = mix(restB, raiseB, p.raise);
  handB = mix(handB, shieldB, p.shield);
  handB = mix(handB, add(chest, { x: -3, y: 3 }), p.clasp);
  const elbowB = ik(shoulderB, handB, 29, 28, -1);

  const hatAngle = headAngle + p.hatTip + p.hatLag - p.hatLift * 0.3;
  const hat = add(head, up(headAngle + p.hatTip * 0.4, 11 + p.hatLift * 16));
  return { hip, neck, head, torso, headAngle, shoulderF, shoulderB, elbowF, handF, elbowB, handB, hat, hatAngle };
}

// ------------------------------------------------------------------ drawing

function stroke(g: CanvasRenderingContext2D, a: P, b: P, w: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke();
}

function poly(g: CanvasRenderingContext2D, pts: readonly P[], fill: string) {
  const f = pts[0];
  if (!f) return;
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(f.x, f.y);
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i];
    if (q) g.lineTo(q.x, q.y);
  }
  g.closePath();
  g.fill();
}

/** Wide medieval sleeve along an arm segment, flaring at the wrist. */
function sleeve(g: CanvasRenderingContext2D, a: P, b: P, wA: number, wB: number, fill: string, lining?: string) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
  const nx = Math.cos(ang);
  const ny = Math.sin(ang);
  poly(g, [{ x: a.x + nx * wA, y: a.y + ny * wA }, { x: b.x + nx * wB, y: b.y + ny * wB }, { x: b.x - nx * wB, y: b.y - ny * wB }, { x: a.x - nx * wA, y: a.y - ny * wA }], fill);
  if (lining) poly(g, [{ x: b.x + nx * wB, y: b.y + ny * wB }, { x: b.x + nx * wB * 0.4, y: b.y + ny * wB * 0.4 }, { x: b.x - nx * wB, y: b.y - ny * wB }], lining);
}

function flask(g: CanvasRenderingContext2D, at: P, tilt: number, glow: number) {
  g.save();
  g.translate(at.x, at.y);
  g.rotate(tilt);
  // round-bottomed glass with amber tincture
  g.fillStyle = 'rgba(214, 205, 180, 0.55)';
  g.beginPath();
  g.arc(0, -14, 9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = `rgba(${200 + glow * 40}, ${120 + glow * 50}, 40, 0.92)`;
  g.beginPath();
  g.arc(0, -13, 7, 0.15 * Math.PI, 0.85 * Math.PI);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(214, 205, 180, 0.7)';
  g.fillRect(-2.5, -30, 5, 9);
  g.fillStyle = C.oakDark;
  g.fillRect(-3, -33, 6, 4); // cork
  g.fillStyle = 'rgba(255, 248, 230, 0.75)';
  g.fillRect(-5, -19, 2, 5); // glass highlight
  g.restore();
}

export function drawAlchemist(g: CanvasRenderingContext2D, r: AlchemistRig, p: AlchemistPose, tinctureGlow: number): void {
  const { hip } = r;
  // floor shadow
  g.fillStyle = 'rgba(10, 6, 3, 0.42)';
  g.beginPath();
  g.ellipse(hip.x * 0.4 + 4, 1, 52 + p.knock * 8, 8, 0, 0, Math.PI * 2);
  g.fill();

  // off arm + flask behind the body
  sleeve(g, r.shoulderB, r.elbowB, 7, 9, C.robeShade);
  sleeve(g, r.elbowB, r.handB, 9, 13, C.robeShade, C.crimsonDeep);
  g.fillStyle = C.skinShade;
  g.beginPath();
  g.arc(r.handB.x, r.handB.y, 4.8, 0, Math.PI * 2);
  g.fill();
  flask(g, r.handB, p.raise * -0.25 + p.shield * 0.6, p.raise);

  // robe: shoulders → hem on the floor, flaring, swaying
  const c = Math.cos(r.torso);
  const s = Math.sin(r.torso);
  const onT = (x: number, y: number): P => ({ x: hip.x + x * c - y * s, y: hip.y + x * s + y * c });
  const sway = p.sway;
  const hemL = { x: hip.x - 34 + sway, y: -1 };
  const hemR = { x: hip.x + 36 + sway * 0.7, y: -1 };
  poly(g, [onT(-14, -68), onT(13, -66), onT(18, -8), hemR, { x: hip.x + 4 + sway * 0.85, y: 2 }, hemL, onT(-18, -6)], C.robe);
  // far-side shade and crimson lining at the open front
  poly(g, [onT(4, -66), onT(13, -66), onT(18, -8), hemR, { x: hip.x + 14 + sway * 0.8, y: 0 }, onT(6, -8)], C.robeShade);
  poly(g, [onT(8, -40), onT(12, -8), { x: hip.x + 24 + sway * 0.75, y: -1 }, { x: hip.x + 16 + sway * 0.8, y: -1 }], C.robeLining);
  // embroidered hem (antique gold)
  g.strokeStyle = C.goldDark;
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(hemL.x, hemL.y - 4);
  g.quadraticCurveTo(hip.x + sway, 2, hemR.x, hemR.y - 4);
  g.stroke();
  // shoe tips
  g.fillStyle = C.oakDark;
  g.beginPath();
  g.ellipse(hemR.x - 4, -1, 9, 3.5, 0, 0, Math.PI * 2);
  g.fill();
  // rope belt, pouch and hanging vial
  const bA = onT(-15, -4);
  const bB = onT(16, -2);
  stroke(g, bA, bB, 4, '#8A6A3A');
  const pouch = onT(-6, 6);
  g.fillStyle = '#5A3A1E';
  g.beginPath();
  g.ellipse(pouch.x, pouch.y + 6, 7, 9, 0.1, 0, Math.PI * 2);
  g.fill();
  const vial = onT(12, 4);
  stroke(g, vial, { x: vial.x + 1, y: vial.y + 12 }, 1.2, '#8A6A3A');
  g.fillStyle = 'rgba(150, 40, 30, 0.85)';
  g.fillRect(vial.x - 2.5, vial.y + 12, 5, 9);
  // rim light down the lit back edge
  g.strokeStyle = 'rgba(243, 214, 160, 0.45)';
  g.lineWidth = 1.4;
  g.beginPath();
  const e0 = onT(-14, -66);
  const e1 = onT(-18, -6);
  g.moveTo(e0.x, e0.y);
  g.lineTo(e1.x, e1.y);
  g.lineTo(hemL.x, hemL.y);
  g.stroke();

  // head
  g.save();
  g.translate(r.head.x, r.head.y);
  g.rotate(r.headAngle);
  const lx = p.lookX * 2.4;
  const ly = p.lookY * 1.6;
  g.fillStyle = C.skin;
  g.beginPath();
  g.moveTo(-9, -9);
  g.quadraticCurveTo(-11, 7, -3, 11);
  g.lineTo(6, 11);
  g.quadraticCurveTo(11, 7, 11, 1);
  g.quadraticCurveTo(16, 0, 15, -3); // nose
  g.lineTo(11, -5);
  g.quadraticCurveTo(9, -13, 0, -13);
  g.quadraticCurveTo(-8, -13, -9, -9);
  g.fill();
  g.fillStyle = C.skinShade;
  g.beginPath();
  g.moveTo(-9, -7);
  g.quadraticCurveTo(-11, 7, -3, 11);
  g.lineTo(-2, 2);
  g.fill();
  // eye
  const open = Math.max(0, 1 - p.squint * 0.6) * (1 - p.blink);
  g.fillStyle = C.ink;
  if (open > 0.15) {
    g.beginPath();
    g.ellipse(6 + lx, -4 + ly, 1.7, 1.9 * open, 0, 0, Math.PI * 2);
    g.fill();
  } else g.fillRect(4 + lx, -4, 4, 1);
  // bushy brow: worry raises the inner end
  g.strokeStyle = C.beardShade;
  g.lineWidth = 2.6;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(2, -8 - p.brow * 1.5 + p.squint);
  g.lineTo(10, -8.5 + p.brow * 1.2 + p.squint * 1.4);
  g.stroke();
  g.restore();

  // beard (flows with sway), mouth visible as a gap in the moustache
  g.save();
  g.translate(r.head.x, r.head.y);
  g.rotate(r.headAngle);
  const bs = sway * 0.35;
  g.fillStyle = C.beard;
  g.beginPath();
  g.moveTo(-2, 3);
  g.quadraticCurveTo(14, 2, 13, 7);
  g.quadraticCurveTo(14, 26, 6 + bs, 40);
  g.quadraticCurveTo(0 + bs, 30, -4, 12);
  g.closePath();
  g.fill();
  g.fillStyle = C.beardShade;
  g.beginPath();
  g.moveTo(2, 12);
  g.quadraticCurveTo(7 + bs, 26, 6 + bs, 40);
  g.quadraticCurveTo(3 + bs, 28, 0, 14);
  g.fill();
  // mouth: smile curves up, dismay opens down
  g.strokeStyle = '#4A2C1C';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(5, 7.2);
  g.quadraticCurveTo(8, 7.5 - p.mouth * 2.4, 11, 6.4 - p.mouth * 1.6);
  g.stroke();
  g.restore();

  // tall alchemist hat: oxblood velvet cone, bent tip, tarnished brass band with a crescent
  g.save();
  g.translate(r.hat.x, r.hat.y);
  g.rotate(r.hatAngle);
  poly(g, [{ x: -18, y: 2 }, { x: 18, y: 2 }, { x: 6, y: -44 }, { x: 14, y: -58 }, { x: 2, y: -50 }, { x: -9, y: -30 }], C.hat);
  poly(g, [{ x: 4, y: 2 }, { x: 18, y: 2 }, { x: 6, y: -44 }, { x: 0, y: -30 }], C.hatShade);
  g.fillStyle = C.brass;
  g.fillRect(-16, -6, 33, 5);
  g.fillStyle = C.goldLight;
  g.beginPath();
  g.arc(-4, -16, 4, 0.6, Math.PI * 2 - 0.6);
  g.arc(-2.4, -16, 3, Math.PI * 2 - 0.9, 0.9, true);
  g.fill();
  // wide brim
  g.fillStyle = C.hatShade;
  g.beginPath();
  g.ellipse(0, 2, 27, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(243, 214, 160, 0.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(0, 1.5, 26, 4.2, 0, Math.PI, Math.PI * 1.75);
  g.stroke();
  g.restore();

  // front arm on top: wide sleeve and hand
  sleeve(g, r.shoulderF, r.elbowF, 8, 10, C.robe);
  sleeve(g, r.elbowF, r.handF, 10, 14, C.robe, C.robeLining);
  g.fillStyle = C.skin;
  g.beginPath();
  g.arc(r.handF.x, r.handF.y, 5.4, 0, Math.PI * 2);
  g.fill();
  if (tinctureGlow > 0.02) {
    // brass glint on the raised flask (warm, small, short-lived)
    g.fillStyle = `rgba(255, 228, 170, ${0.5 * tinctureGlow})`;
    g.beginPath();
    g.arc(r.handB.x + 2, r.handB.y - 16, 3 + tinctureGlow * 3, 0, Math.PI * 2);
    g.fill();
  }
}
