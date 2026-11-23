/**
 * Hinged, spring-loaded pointer against the sector pins (ADR-0002). Pure; unit-tested.
 *
 * Pins sit on every sector boundary. A pin approaching the pointer axis (within `contact` radians of wheel angle)
 * pushes the pointer tip sideways; as the pin passes the axis it releases the pointer, which snaps back on a damped
 * spring and emits a tick. Ticks are counted exactly as boundaries crossed.
 */
import { norm, POINTER_ANGLE, TAU } from './wheel';

export type PointerState = {
  /** Deflection in radians (+ = pushed along the direction of spin). */
  deflection: number;
  velocity: number;
};

export type PointerTuning = {
  readonly maxDeflection: number;
  /** Wheel-angle window (as a fraction of a sector) in which a pin is in contact with the tip. */
  readonly contact: number;
  readonly stiffness: number;
  readonly damping: number;
};

export const POINTER_TUNING: PointerTuning = { maxDeflection: 0.42, contact: 0.32, stiffness: 520, damping: 16 };

export type PointerStep = {
  /** Pins that passed the pointer this step (+ forward, − backward). */
  readonly ticks: number;
  /** Peak strike strength 0..1 of the passes (for audio/raven), based on wheel speed. */
  readonly strength: number;
};

/** Boundary index the pointer axis is past (monotonic in θ). */
const boundaryIndex = (theta: number, sectors: number) => Math.floor((theta - POINTER_ANGLE) / (TAU / sectors));

export function stepPointer(p: PointerState, thetaPrev: number, theta: number, omega: number, sectors: number, dtMs: number, tune: PointerTuning = POINTER_TUNING): PointerStep {
  const s = TAU / sectors;
  const dt = Math.min(dtMs, 50) / 1000;
  const ticks = boundaryIndex(theta, sectors) - boundaryIndex(thetaPrev, sectors);

  // Distance from the pointer axis to the next pin still approaching (a pin at wheel-local j·s sits at world j·s + θ).
  const rel = norm(POINTER_ANGLE - theta); // wheel-local angle under the pointer
  const toNextPin = rel - Math.floor(rel / s) * s; // the pin at the start of this sector is `toNextPin` behind the axis
  const window = tune.contact * s;
  // As θ grows, `toNextPin` shrinks to 0 and the pin crosses the axis; contact while within the window.
  const push = toNextPin < window && omega > 0.02 ? tune.maxDeflection * (1 - toNextPin / window) : 0;

  // Damped spring toward rest, constrained by the pin.
  const acc = -tune.stiffness * p.deflection - tune.damping * p.velocity;
  p.velocity += acc * dt;
  p.deflection += p.velocity * dt;
  if (p.deflection < push) {
    p.deflection = push;
    p.velocity = Math.max(p.velocity, 0);
  }
  p.deflection = Math.max(-tune.maxDeflection, Math.min(tune.maxDeflection * 1.15, p.deflection));

  const strength = ticks !== 0 ? Math.min(1, Math.abs(omega) / 10) : 0;
  return { ticks, strength };
}
