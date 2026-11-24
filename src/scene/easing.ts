/** Easing curves (u ∈ [0,1] → progress). Anticipation/overshoot curves may leave [0,1] briefly. */
export type Ease = (u: number) => number;

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);

export const Easing = {
  linear: (u: number) => clamp01(u),
  inQuad: (u: number) => clamp01(u) ** 2,
  outQuad: (u: number) => {
    const x = clamp01(u);
    return 1 - (1 - x) * (1 - x);
  },
  outCubic: (u: number) => 1 - (1 - clamp01(u)) ** 3,
  inOutCubic: (u: number) => {
    const x = clamp01(u);
    return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  },
  inOutSine: (u: number) => -(Math.cos(Math.PI * clamp01(u)) - 1) / 2,
  /** Snappy overshoot: strike past the target, then settle. */
  outBack: (u: number) => {
    const x = clamp01(u);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  },
  /** Damped spring settle for follow-through. */
  outSpring: (u: number) => {
    const x = clamp01(u);
    return 1 - Math.exp(-6 * x) * Math.cos(x * Math.PI * 2.2);
  },
} as const satisfies Record<string, Ease>;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
