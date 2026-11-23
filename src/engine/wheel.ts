/**
 * Wheel kinematics (ADR-0002). Pure; frame-rate independent; unit-tested.
 *
 * Angles are canvas radians (0 = +x, clockwise positive). The wheel rotation is θ; a point at wheel-local angle φ
 * is drawn at world angle φ + θ. The pointer sits at the top (world −π/2). Sector i spans local [i·s, (i+1)·s).
 */

export const POINTER_ANGLE = -Math.PI / 2;
export const TAU = Math.PI * 2;

export const norm = (a: number) => ((a % TAU) + TAU) % TAU;

/** Sector currently under the pointer. */
export function sectorUnderPointer(theta: number, sectors: number): number {
  const s = TAU / sectors;
  return Math.floor(norm(POINTER_ANGLE - theta) / s) % sectors;
}

/** Keep landing spots away from the pins so the result is never ambiguous. */
export const landingFraction = (offset: number) => 0.14 + 0.72 * Math.min(1, Math.max(0, offset));

/** A θ (mod 2π) that puts `sector` + `offset` exactly under the pointer. */
export function targetAngle(sector: number, offset: number, sectors: number): number {
  const s = TAU / sectors;
  return norm(POINTER_ANGLE - (sector + landingFraction(offset)) * s);
}

export const WheelPhase = {
  IDLE: 'idle',
  WINDUP: 'windup',
  ACCEL: 'accel',
  CRUISE: 'cruise',
  DECEL: 'decel',
  SETTLE: 'settle',
  COAST: 'coast',
} as const;
export type WheelPhase = (typeof WheelPhase)[keyof typeof WheelPhase];

export type WheelTuning = {
  readonly cruise: number; // rad/s
  readonly windup: number; // rad pulled back before launch
  readonly windupMs: number;
  readonly accelMs: number;
  readonly minDecelMs: number;
  readonly maxDecelMs: number;
  readonly overshoot: number; // rad past target before the pin pulls it back
  readonly settleMs: number;
  readonly coastFriction: number; // 1/s, for aborted spins
};

export const NORMAL_TUNING: WheelTuning = {
  cruise: 13,
  windup: 0.14,
  windupMs: 190,
  accelMs: 320,
  minDecelMs: 2600,
  maxDecelMs: 4400,
  overshoot: 0.032,
  settleMs: 300,
  coastFriction: 1.4,
};

export const TURBO_TUNING: WheelTuning = { ...NORMAL_TUNING, cruise: 16, windupMs: 90, accelMs: 160, minDecelMs: 1100, maxDecelMs: 1900, settleMs: 180 };

export type WheelMotion = {
  phase: WheelPhase;
  theta: number;
  omega: number;
  t: number;
  tuning: WheelTuning;
  from: number;
  distance: number;
  duration: number;
  target: number;
};

export function createWheel(theta = 0): WheelMotion {
  return { phase: WheelPhase.IDLE, theta, omega: 0, t: 0, tuning: NORMAL_TUNING, from: theta, distance: 0, duration: 0, target: theta };
}

export function launch(w: WheelMotion, tuning: WheelTuning): void {
  w.tuning = tuning;
  w.phase = WheelPhase.WINDUP;
  w.t = 0;
  w.from = w.theta;
}

/**
 * Plan the landing: decelerate from the current speed with θ(u) = θ₀ + D·(1 − (1 − u)³), T = 3D/ω₀
 * (velocity-continuous), choosing whole extra turns so T stays within the tuning window.
 * Returns the absolute final angle (before the small overshoot/settle).
 */
export function planLanding(w: WheelMotion, sector: number, offset: number, sectors: number): number {
  const tune = w.tuning;
  const omega = Math.max(w.omega, tune.cruise * 0.7);
  const goal = targetAngle(sector, offset, sectors);
  let d = norm(goal - w.theta);
  const minD = (omega * tune.minDecelMs) / 1000 / 3;
  while (d < minD) d += TAU;
  const target = w.theta + d;
  w.from = w.theta;
  w.distance = d + tune.overshoot;
  w.duration = (3 * w.distance * 1000) / omega;
  w.target = target;
  w.omega = omega;
  w.phase = WheelPhase.DECEL;
  w.t = 0;
  return target;
}

/** Error path: let the wheel coast to rest with friction (no outcome). */
export function coast(w: WheelMotion): void {
  if (w.phase === WheelPhase.IDLE) return;
  w.phase = WheelPhase.COAST;
  w.t = 0;
}

const easeOutQuad = (u: number) => 1 - (1 - u) * (1 - u);
const easeInQuad = (u: number) => u * u;
const easeInOutSine = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2;

/** Advance by dt ms. Returns true on the frame the wheel comes to rest on a planned target. */
export function stepWheel(w: WheelMotion, dtMs: number): boolean {
  const tune = w.tuning;
  const prev = w.theta;
  w.t += dtMs;
  switch (w.phase) {
    case WheelPhase.IDLE:
      w.omega = 0;
      return false;
    case WheelPhase.WINDUP: {
      // anticipation: draw the wheel back against the direction of spin
      const u = Math.min(1, w.t / tune.windupMs);
      w.theta = w.from - tune.windup * easeOutQuad(u);
      if (u >= 1) {
        w.phase = WheelPhase.ACCEL;
        w.t = 0;
      }
      break;
    }
    case WheelPhase.ACCEL: {
      const u = Math.min(1, w.t / tune.accelMs);
      w.omega = tune.cruise * easeInQuad(u);
      w.theta += (w.omega * dtMs) / 1000;
      if (u >= 1) {
        w.phase = WheelPhase.CRUISE;
        w.t = 0;
      }
      return false;
    }
    case WheelPhase.CRUISE:
      w.omega = tune.cruise;
      w.theta += (w.omega * dtMs) / 1000;
      return false;
    case WheelPhase.DECEL: {
      const u = Math.min(1, w.t / w.duration);
      w.theta = w.from + w.distance * (1 - (1 - u) ** 3);
      w.omega = ((3 * w.distance * (1 - u) ** 2) / w.duration) * 1000;
      if (u >= 1) {
        w.phase = WheelPhase.SETTLE;
        w.t = 0;
      }
      return false;
    }
    case WheelPhase.SETTLE: {
      // the pointer's pin pulls the wheel back from the overshoot onto the exact target
      const u = Math.min(1, w.t / tune.settleMs);
      w.theta = w.target + tune.overshoot * (1 - easeInOutSine(u));
      w.omega = (w.theta - prev) / Math.max(1e-6, dtMs / 1000);
      if (u >= 1) {
        w.theta = w.target;
        w.omega = 0;
        w.phase = WheelPhase.IDLE;
        return true;
      }
      return false;
    }
    case WheelPhase.COAST:
      w.omega *= Math.max(0, 1 - tune.coastFriction * (dtMs / 1000));
      w.theta += (w.omega * dtMs) / 1000;
      if (w.omega < 0.05) {
        w.omega = 0;
        w.phase = WheelPhase.IDLE;
      }
      return false;
  }
  w.omega = (w.theta - prev) / Math.max(1e-6, dtMs / 1000);
  return false;
}
