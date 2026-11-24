/**
 * Scene composition for any canvas size (pure; unit-tested): where the wheel, its stand, the alchemist and the
 * raven go. Landscape puts the alchemist beside the wheel; portrait puts a smaller alchemist in front of the stand.
 */
export type SceneLayout = {
  readonly width: number;
  readonly height: number;
  readonly cx: number;
  readonly cy: number;
  /** Wheel radius including the iron tyre. */
  readonly r: number;
  /** Floor line (y). */
  readonly floor: number;
  /** Alchemist feet position and scale (character is ~250 units tall). */
  readonly alchemist: { readonly x: number; readonly y: number; readonly scale: number };
  /** Raven perch (top of the pointer housing) and scale. */
  readonly raven: { readonly x: number; readonly y: number; readonly scale: number };
  readonly mode: 'landscape' | 'portrait';
};

export const ALCHEMIST_HEIGHT = 250;

export function composeScene(width: number, height: number): SceneLayout {
  const landscape = width / height >= 1.15;
  if (landscape) {
    const r = Math.max(40, Math.min(height * 0.36, width * 0.29));
    const cx = Math.round(width * 0.6);
    const cy = Math.round(Math.max(height * 0.54, r * 1.5));
    const floor = Math.min(height - 4, cy + r * 1.18);
    const scale = Math.min((r * 1.75) / ALCHEMIST_HEIGHT, ((cx - r) * 0.85) / 120);
    return {
      width,
      height,
      cx,
      cy,
      r,
      floor,
      mode: 'landscape',
      alchemist: { x: Math.max(70 * scale, cx - r - 62 * scale), y: floor, scale },
      raven: { x: cx + r * 0.03, y: cy - r - r * 0.15, scale: Math.max(0.4, r / 150) },
    };
  }
  const r = Math.max(40, Math.min(width * 0.37, height * 0.36));
  const cx = Math.round(width * 0.57);
  const cy = Math.round(Math.max(r * 1.5, height * 0.46));
  const floor = Math.min(height - 4, cy + r * 1.2);
  const scale = Math.min((r * 1.1) / ALCHEMIST_HEIGHT, (width * 0.36) / 130);
  return {
    width,
    height,
    cx,
    cy,
    r,
    floor,
    mode: 'portrait',
    alchemist: { x: Math.max(58 * scale, cx - r * 0.95), y: floor, scale },
    raven: { x: cx + r * 0.03, y: cy - r - r * 0.15, scale: Math.max(0.4, r / 150) },
  };
}
