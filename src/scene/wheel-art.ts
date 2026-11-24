/**
 * The Alchemist Wheel's artwork (ADR-0003): an astrolabe-like wheel of fortune, drawn procedurally.
 * Vellum and oak sectors with heraldic charges (crown, fleur-de-lis, sword, chalice), crimson-and-soot curse
 * sectors with a skull, engraved radial rules, a Roman-numeral chapter ring, brass sector pins, a riveted iron
 * tyre, and a brass hub with astrolabe rings. The static face is baked to an offscreen canvas once per layout or size.
 */
import { PALETTE as C } from '../config/palette';
import type { Charge, Sector } from '../engine/ladder';
import { TAU } from '../engine/wheel';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];

function charge(g: CanvasRenderingContext2D, c: Charge, size: number, ink: string, fill: string) {
  const s = size;
  g.fillStyle = fill;
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1, s * 0.07);
  g.lineJoin = 'round';
  g.beginPath();
  switch (c) {
    case 'crown':
      g.moveTo(-s * 0.5, s * 0.3);
      g.lineTo(-s * 0.55, -s * 0.25);
      g.lineTo(-s * 0.25, s * 0.02);
      g.lineTo(0, -s * 0.38);
      g.lineTo(s * 0.25, s * 0.02);
      g.lineTo(s * 0.55, -s * 0.25);
      g.lineTo(s * 0.5, s * 0.3);
      g.closePath();
      break;
    case 'fleur':
      g.moveTo(0, -s * 0.48);
      g.quadraticCurveTo(s * 0.18, -s * 0.2, 0, s * 0.1);
      g.quadraticCurveTo(-s * 0.18, -s * 0.2, 0, -s * 0.48);
      g.moveTo(-s * 0.06, s * 0.02);
      g.quadraticCurveTo(-s * 0.55, -s * 0.28, -s * 0.42, s * 0.12);
      g.quadraticCurveTo(-s * 0.3, s * 0.02, -s * 0.06, s * 0.14);
      g.moveTo(s * 0.06, s * 0.02);
      g.quadraticCurveTo(s * 0.55, -s * 0.28, s * 0.42, s * 0.12);
      g.quadraticCurveTo(s * 0.3, s * 0.02, s * 0.06, s * 0.14);
      g.rect(-s * 0.3, s * 0.12, s * 0.6, s * 0.1);
      g.moveTo(-s * 0.08, s * 0.22);
      g.lineTo(0, s * 0.48);
      g.lineTo(s * 0.08, s * 0.22);
      break;
    case 'sword':
      g.rect(-s * 0.05, -s * 0.5, s * 0.1, s * 0.72);
      g.rect(-s * 0.3, s * 0.18, s * 0.6, s * 0.08);
      g.rect(-s * 0.04, s * 0.26, s * 0.08, s * 0.18);
      g.arc(0, s * 0.48, s * 0.07, 0, TAU);
      break;
    case 'chalice':
      g.moveTo(-s * 0.34, -s * 0.4);
      g.lineTo(s * 0.34, -s * 0.4);
      g.quadraticCurveTo(s * 0.32, -s * 0.02, s * 0.05, s * 0.06);
      g.lineTo(s * 0.05, s * 0.3);
      g.lineTo(s * 0.26, s * 0.44);
      g.lineTo(-s * 0.26, s * 0.44);
      g.lineTo(-s * 0.05, s * 0.3);
      g.lineTo(-s * 0.05, s * 0.06);
      g.quadraticCurveTo(-s * 0.32, -s * 0.02, -s * 0.34, -s * 0.4);
      break;
    case 'skull':
      // cranium + cheekbones + jaw
      g.moveTo(-s * 0.36, -s * 0.02);
      g.bezierCurveTo(-s * 0.4, -s * 0.5, s * 0.4, -s * 0.5, s * 0.36, -s * 0.02);
      g.bezierCurveTo(s * 0.36, s * 0.12, s * 0.26, s * 0.16, s * 0.22, s * 0.2);
      g.lineTo(s * 0.2, s * 0.4);
      g.lineTo(-s * 0.2, s * 0.4);
      g.lineTo(-s * 0.22, s * 0.2);
      g.bezierCurveTo(-s * 0.26, s * 0.16, -s * 0.36, s * 0.12, -s * 0.36, -s * 0.02);
      break;
  }
  g.fill();
  g.stroke();
  if (c === 'skull') {
    g.fillStyle = ink;
    // eye sockets
    g.beginPath();
    g.ellipse(-s * 0.15, -s * 0.03, s * 0.11, s * 0.13, 0.2, 0, TAU);
    g.ellipse(s * 0.15, -s * 0.03, s * 0.11, s * 0.13, -0.2, 0, TAU);
    g.fill();
    // nasal cavity
    g.beginPath();
    g.moveTo(0, s * 0.08);
    g.lineTo(-s * 0.05, s * 0.18);
    g.lineTo(s * 0.05, s * 0.18);
    g.closePath();
    g.fill();
    // teeth
    g.lineWidth = Math.max(1, s * 0.035);
    g.beginPath();
    g.moveTo(-s * 0.18, s * 0.29);
    g.lineTo(s * 0.18, s * 0.29);
    for (const x of [-0.1, 0, 0.1]) {
      g.moveTo(s * x, s * 0.22);
      g.lineTo(s * x, s * 0.38);
    }
    g.stroke();
  }
}

/**
 * Bake the rotating face (sectors, charges, numerals, pins, tyre, hub) at radius r into a square canvas.
 * The canvas is (2r + pad) CSS px × dpr; the caller draws it centred and rotated each frame.
 */
export function bakeWheelFace(sectors: readonly Sector[], r: number, dpr: number): HTMLCanvasElement {
  const pad = 6;
  const size = Math.ceil((r + pad) * 2 * dpr);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.scale(dpr, dpr);
  g.translate(r + pad, r + pad);
  const n = sectors.length;
  const s = TAU / n;
  const tyre = r * 0.085;
  const chapter = r * 0.11;
  const rFace = r - tyre - chapter;

  // sectors
  sectors.forEach((sec, i) => {
    const a0 = i * s;
    const a1 = a0 + s;
    const grad = g.createRadialGradient(0, 0, rFace * 0.2, 0, 0, rFace);
    if (sec.kind === 'curse') {
      grad.addColorStop(0, C.soot);
      grad.addColorStop(0.55, C.crimsonDeep);
      grad.addColorStop(1, C.crimson);
    } else {
      const base = i % 2 === 0 ? C.vellum : C.vellumShade;
      grad.addColorStop(0, C.vellumDeep);
      grad.addColorStop(0.6, base);
      grad.addColorStop(1, base);
    }
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, rFace, a0, a1);
    g.closePath();
    g.fill();
    // charge, upright along the radius
    const mid = a0 + s / 2;
    g.save();
    g.rotate(mid + Math.PI / 2);
    g.translate(0, -rFace * 0.68);
    const ink = sec.kind === 'curse' ? C.goldLight : C.ink;
    const fill = sec.kind === 'curse' ? C.vellumShade : sec.charge === 'crown' || sec.charge === 'chalice' ? C.gold : C.crimson;
    charge(g, sec.charge, rFace * 0.26, ink, fill);
    g.restore();
  });

  // engraved radial rules (dark cut + light lip)
  for (let i = 0; i < n; i++) {
    const a = i * s;
    for (const [col, w, off] of [
      [C.ink, 2, 0],
      ['rgba(255, 244, 220, 0.35)', 1, 1.2],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(Math.cos(a) * rFace * 0.22 + off, Math.sin(a) * rFace * 0.22);
      g.lineTo(Math.cos(a) * rFace + off, Math.sin(a) * rFace);
      g.stroke();
    }
  }

  // chapter ring with Roman numerals on aged oak
  g.lineWidth = chapter;
  g.strokeStyle = C.oak;
  g.beginPath();
  g.arc(0, 0, rFace + chapter / 2, 0, TAU);
  g.stroke();
  g.strokeStyle = C.oakDark;
  g.lineWidth = 1.5;
  for (const rr of [rFace, rFace + chapter]) {
    g.beginPath();
    g.arc(0, 0, rr, 0, TAU);
    g.stroke();
  }
  g.fillStyle = C.goldLight;
  g.font = `${Math.max(8, Math.round(chapter * 0.58))}px "IM Fell English SC", Cinzel, Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const mid = i * s + s / 2;
    g.save();
    g.rotate(mid + Math.PI / 2);
    g.fillText(ROMAN[i] ?? String(i + 1), 0, -(rFace + chapter / 2));
    g.restore();
  }

  // riveted iron tyre
  g.lineWidth = tyre;
  g.strokeStyle = C.iron;
  g.beginPath();
  g.arc(0, 0, r - tyre / 2, 0, TAU);
  g.stroke();
  g.lineWidth = 1.2;
  g.strokeStyle = C.ironLight;
  g.beginPath();
  g.arc(0, 0, r - tyre + 1, 0, TAU);
  g.stroke();
  g.strokeStyle = C.ironEdge;
  g.beginPath();
  g.arc(0, 0, r - 0.6, 0, TAU);
  g.stroke();
  // pins on every boundary (brass) + rivets between
  for (let i = 0; i < n; i++) {
    const a = i * s;
    const pr = r - tyre / 2;
    g.fillStyle = C.gold;
    g.beginPath();
    g.arc(Math.cos(a) * pr, Math.sin(a) * pr, Math.max(2.2, tyre * 0.34), 0, TAU);
    g.fill();
    g.fillStyle = C.goldDark;
    g.beginPath();
    g.arc(Math.cos(a) * pr + 0.8, Math.sin(a) * pr + 0.8, Math.max(1, tyre * 0.16), 0, TAU);
    g.fill();
    const m = a + s / 2;
    g.fillStyle = C.ironLight;
    g.beginPath();
    g.arc(Math.cos(m) * pr, Math.sin(m) * pr, Math.max(1.2, tyre * 0.16), 0, TAU);
    g.fill();
  }

  // brass hub with astrolabe rings and a star rete
  const hub = rFace * 0.22;
  const hg = g.createRadialGradient(-hub * 0.3, -hub * 0.3, hub * 0.1, 0, 0, hub);
  hg.addColorStop(0, C.goldLight);
  hg.addColorStop(0.6, C.brass);
  hg.addColorStop(1, C.goldDark);
  g.fillStyle = hg;
  g.beginPath();
  g.arc(0, 0, hub, 0, TAU);
  g.fill();
  g.strokeStyle = C.ink;
  g.lineWidth = 1.2;
  for (const f of [1, 0.72, 0.45]) {
    g.beginPath();
    g.arc(0, 0, hub * f, 0, TAU);
    g.stroke();
  }
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    const rr = i % 2 === 0 ? hub * 0.95 : hub * 0.5;
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.stroke();
  g.fillStyle = C.ironEdge;
  g.beginPath();
  g.arc(0, 0, hub * 0.14, 0, TAU);
  g.fill();
  return cv;
}

/** Static lamp-light overlay (does not rotate): warm highlight upper-left, shade lower-right. */
export function bakeLighting(r: number, dpr: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2 * dpr);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.scale(dpr, dpr);
  const lg = g.createLinearGradient(0, 0, r * 2, r * 2);
  lg.addColorStop(0, 'rgba(255, 236, 196, 0.16)');
  lg.addColorStop(0.45, 'rgba(255, 236, 196, 0)');
  lg.addColorStop(1, 'rgba(12, 6, 2, 0.38)');
  g.fillStyle = lg;
  g.beginPath();
  g.arc(r, r, r, 0, TAU);
  g.fill();
  return cv;
}

/** Oak A-frame stand and the iron axle bracket, drawn behind the wheel. */
export function drawStand(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, floor: number): void {
  const legW = Math.max(6, r * 0.09);
  g.lineCap = 'butt';
  for (const side of [-1, 1]) {
    const footX = cx + side * r * 0.78;
    const grad = g.createLinearGradient(cx, cy, footX, floor);
    grad.addColorStop(0, C.oakLight);
    grad.addColorStop(1, C.oakDark);
    g.strokeStyle = grad;
    g.lineWidth = legW;
    g.beginPath();
    g.moveTo(cx + side * r * 0.12, cy);
    g.lineTo(footX, floor);
    g.stroke();
    g.fillStyle = C.iron;
    g.fillRect(footX - legW * 0.7, floor - legW * 0.5, legW * 1.4, legW * 0.5);
  }
  // cross brace with iron straps
  g.strokeStyle = C.oak;
  g.lineWidth = legW * 0.7;
  g.beginPath();
  g.moveTo(cx - r * 0.52, cy + (floor - cy) * 0.66);
  g.lineTo(cx + r * 0.52, cy + (floor - cy) * 0.66);
  g.stroke();
  // floor shadow
  g.fillStyle = 'rgba(8, 5, 2, 0.45)';
  g.beginPath();
  g.ellipse(cx, floor + 2, r * 0.95, Math.max(4, r * 0.06), 0, 0, TAU);
  g.fill();
}

/**
 * Pointer: wrought-iron housing above the rim, hinged at `hinge`, with a brass blade whose tip rides the pins.
 * `deflection` rotates the blade about the hinge (radians, + clockwise).
 */
export function drawPointer(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, deflection: number): { hinge: { x: number; y: number }; tip: { x: number; y: number } } {
  const hx = cx;
  const hy = cy - r - r * 0.07;
  const len = r * 0.2;
  // housing bracket (iron) bolted to the frame
  g.fillStyle = C.iron;
  g.beginPath();
  g.moveTo(hx - r * 0.1, hy - r * 0.08);
  g.lineTo(hx + r * 0.1, hy - r * 0.08);
  g.lineTo(hx + r * 0.06, hy + r * 0.02);
  g.lineTo(hx - r * 0.06, hy + r * 0.02);
  g.closePath();
  g.fill();
  g.fillStyle = C.ironLight;
  g.fillRect(hx - r * 0.1, hy - r * 0.08, r * 0.2, Math.max(1.5, r * 0.012));
  // blade
  g.save();
  g.translate(hx, hy);
  g.rotate(deflection);
  const bw = Math.max(4, r * 0.05);
  const blade = g.createLinearGradient(-bw, 0, bw, 0);
  blade.addColorStop(0, C.goldLight);
  blade.addColorStop(0.5, C.gold);
  blade.addColorStop(1, C.goldDark);
  g.fillStyle = blade;
  g.beginPath();
  g.moveTo(-bw, 0);
  g.lineTo(bw, 0);
  g.lineTo(0, len);
  g.closePath();
  g.fill();
  g.strokeStyle = C.ink;
  g.lineWidth = 1;
  g.stroke();
  g.restore();
  // hinge boss
  g.fillStyle = C.brass;
  g.beginPath();
  g.arc(hx, hy, Math.max(3, r * 0.035), 0, TAU);
  g.fill();
  g.fillStyle = C.ironEdge;
  g.beginPath();
  g.arc(hx, hy, Math.max(1.2, r * 0.012), 0, TAU);
  g.fill();
  return { hinge: { x: hx, y: hy }, tip: { x: hx - Math.sin(deflection) * len, y: hy + Math.cos(deflection) * len } };
}
