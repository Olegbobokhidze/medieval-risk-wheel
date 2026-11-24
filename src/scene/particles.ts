/**
 * Particle pool for the scene (ADR-0003): dust motes in lamp light, brass glints, warm embers, soot and ash for
 * curses, splinters at the pointer, and coins for a claim. Fixed capacity, pre-rendered sprites, no per-frame allocation.
 */
import { PALETTE as C } from '../config/palette';

type Kind = 'mote' | 'glint' | 'ember' | 'soot' | 'ash' | 'spark' | 'chip' | 'coin' | 'wax' | 'ring';

type Particle = {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  delay: number;
  size: number;
  grow: number;
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
  color: string;
};

const CAP = 480;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function radial(size: number, stops: readonly [number, string][]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [a, col] of stops) r.addColorStop(a, col);
    g.fillStyle = r;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

export class Particles {
  private readonly pool: Particle[] = [];
  private readonly soot = radial(96, [
    [0, 'rgba(28,20,17,0.8)'],
    [0.55, 'rgba(40,30,26,0.42)'],
    [1, 'rgba(40,30,26,0)'],
  ]);
  private readonly dustSpr = radial(64, [
    [0, 'rgba(216,195,160,0.38)'],
    [0.6, 'rgba(190,168,130,0.16)'],
    [1, 'rgba(190,168,130,0)'],
  ]);
  private readonly glint = radial(32, [
    [0, 'rgba(255,240,205,0.95)'],
    [0.35, 'rgba(235,203,130,0.5)'],
    [1, 'rgba(235,203,130,0)'],
  ]);
  private readonly ember = radial(16, [
    [0, 'rgba(255,214,150,1)'],
    [0.45, 'rgba(217,119,46,0.85)'],
    [1, 'rgba(160,50,20,0)'],
  ]);
  private w = 0;
  private h = 0;
  active = 0;

  constructor(private readonly reduced: boolean) {
    for (let i = 0; i < CAP; i++) this.pool.push({ kind: 'mote', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, delay: 0, size: 1, grow: 0, rot: 0, vr: 0, gravity: 0, drag: 0, color: '#000' });
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (this.reduced) return;
    let n = 0;
    for (const p of this.pool) {
      if (n >= 36) break;
      if (p.kind === 'mote' || p.life <= 0) {
        // dust motes drifting through the lamp-light (upper-left)
        Object.assign(p, { kind: 'mote', x: Math.random() * w, y: Math.random() * h, vx: rnd(3, 10), vy: rnd(-3, 2), life: Infinity, max: Infinity, size: rnd(0.8, 2.2), delay: 0, rot: rnd(0, 6), vr: rnd(0.3, 0.9), color: C.dust });
        n++;
      }
    }
  }

  // ------------------------------------------------------------ emitters

  /** Brass glints around a point (advance / high multipliers). */
  glints(x: number, y: number, radius: number, count: number): void {
    const n = this.reduced ? Math.min(3, count) : count;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const d = rnd(0.2, 1) * radius;
      this.spawn('glint', x + Math.cos(a) * d, y + Math.sin(a) * d, 0, rnd(-14, -4), rnd(0.35, 0.8), rnd(10, 22), { delay: rnd(0, 0.25) });
    }
  }

  /** Warm embers rising (alchemical heat on high rungs). */
  embers(x: number, y: number, spread: number, count: number): void {
    if (this.reduced) return;
    for (let i = 0; i < count; i++) {
      this.spawn('ember', x + rnd(-spread, spread), y + rnd(-spread * 0.3, spread * 0.3), rnd(-20, 20), rnd(-90, -40), rnd(1, 2), rnd(2.5, 5), { drag: 0.8, gravity: -10, delay: rnd(0, 0.3) });
    }
  }

  /** Curse: a soot burst from the cursed sector, red embers, falling ash, and a shock ring. */
  curse(x: number, y: number, scale: number): void {
    const k = this.reduced ? 0.25 : 1;
    this.spawn('ring', x, y, 0, 0, 0.5, 8 * scale, { grow: 300 * scale });
    for (let i = 0; i < 16 * k; i++) {
      this.spawn('soot', x + rnd(-14, 14) * scale, y + rnd(-10, 10) * scale, rnd(-60, 60), rnd(-90, -20), rnd(1.4, 2.6), rnd(26, 46) * scale, { grow: rnd(40, 70) * scale, drag: 0.9, delay: rnd(0, 0.12) });
    }
    for (let i = 0; i < 22 * k; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(120, 340) * scale;
      this.spawn('ember', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 80, rnd(0.6, 1.3), rnd(2, 4.5), { drag: 1.8, gravity: 160 });
    }
    for (let i = 0; i < 18 * k; i++) {
      this.spawn('chip', x, y, rnd(-220, 220) * scale, rnd(-260, -60) * scale, rnd(0.7, 1.2), rnd(2, 5), { gravity: 900, drag: 1, vr: rnd(-14, 14), color: Math.random() < 0.5 ? C.oakDark : C.iron });
    }
    for (let i = 0; i < 20 * k; i++) {
      this.spawn('ash', x + rnd(-160, 160) * scale, y - rnd(60, 180) * scale, rnd(-10, 10), rnd(14, 32), rnd(2.2, 3.4), rnd(1.2, 2.4), { delay: rnd(0.3, 1.1), vr: rnd(-3, 3) });
    }
  }

  /** Splinters and a spark where a pin strikes the pointer at speed. */
  strike(x: number, y: number, strength: number): void {
    if (this.reduced || strength < 0.55 || Math.random() > 0.35) return;
    this.spawn('spark', x, y, rnd(40, 140), rnd(-60, 20), rnd(0.08, 0.16), rnd(4, 7), { drag: 4, color: C.goldLight });
    this.spawn('chip', x, y, rnd(20, 90), rnd(-90, -30), rnd(0.3, 0.5), rnd(1.2, 2.2), { gravity: 700, vr: rnd(-12, 12), color: C.oakLight });
  }

  /** Coins raining over an area (claim). */
  coins(x: number, y: number, width: number): void {
    const n = this.reduced ? 8 : 44;
    for (let i = 0; i < n; i++) {
      this.spawn('coin', x + Math.random() * width, y - rnd(0, 60), rnd(-30, 30), rnd(40, 180), rnd(1.4, 2.2), rnd(5, 8), { gravity: 640, drag: 0.2, vr: rnd(-8, 8), delay: rnd(0, 0.25) });
    }
  }

  /** Small wax flecks (ladder seal pressed). */
  wax(x: number, y: number): void {
    if (this.reduced) return;
    for (let i = 0; i < 8; i++) {
      const a = rnd(0, Math.PI * 2);
      this.spawn('wax', x, y, Math.cos(a) * rnd(40, 110), Math.sin(a) * rnd(40, 110) - 40, rnd(0.4, 0.7), rnd(2, 3.5), { gravity: 600, drag: 1.5, color: C.crimson });
    }
  }

  /** Dust kicked up at the stand's feet (launch). */
  dust(x: number, y: number, width: number): void {
    if (this.reduced) return;
    for (let i = 0; i < 10; i++) this.spawn('soot', x + rnd(-width, width), y, rnd(-30, 30), rnd(-26, -8), rnd(0.6, 1.1), rnd(18, 30), { grow: 40, drag: 1.6, color: C.dust });
  }

  // ------------------------------------------------------------ simulate / draw

  private spawn(kind: Kind, x: number, y: number, vx: number, vy: number, life: number, size: number, o: Partial<Pick<Particle, 'grow' | 'drag' | 'gravity' | 'delay' | 'vr' | 'color'>> = {}): void {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return; // bounded: drop rather than allocate
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.grow = o.grow ?? 0;
    p.drag = o.drag ?? 0;
    p.gravity = o.gravity ?? 0;
    p.delay = o.delay ?? 0;
    p.vr = o.vr ?? 0;
    p.rot = Math.random() * Math.PI;
    p.color = o.color ?? '#fff';
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    let n = 0;
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      if (p.kind === 'mote') {
        p.rot += p.vr * dt;
        p.x += (p.vx + Math.sin(p.rot) * 5) * dt;
        p.y += (p.vy + Math.cos(p.rot * 0.7) * 3) * dt;
        if (p.x > this.w + 4) p.x = -4;
        if (p.y < -4) p.y = this.h + 4;
        if (p.y > this.h + 4) p.y = -4;
        continue;
      }
      n++;
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.life -= dt;
      p.vy += p.gravity * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
      if (p.kind === 'ring') p.grow *= Math.max(0, 1 - 3 * dt);
      if (p.kind === 'ash') p.vx += Math.sin(p.rot * 3) * 10 * dt;
    }
    this.active = n;
  }

  draw(g: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (p.life <= 0 || p.delay > 0) continue;
      const t = p.kind === 'mote' ? 1 : Math.max(0, p.life / p.max);
      const age = 1 - t;
      switch (p.kind) {
        case 'mote': {
          // brighter inside the lamp-light (upper-left), nearly invisible in shadow
          const lit = Math.max(0, 1 - (p.x / Math.max(1, this.w)) * 0.9 - (p.y / Math.max(1, this.h)) * 0.5);
          g.globalAlpha = (0.1 + 0.25 * lit) * (0.7 + 0.3 * Math.sin(p.rot * 2));
          g.fillStyle = p.color;
          g.fillRect(p.x, p.y, p.size, p.size);
          break;
        }
        case 'soot':
          g.globalAlpha = Math.min(1, age * 5) * t * 0.9;
          g.drawImage(p.color === C.dust ? this.dustSpr : this.soot, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'glint': {
          g.globalAlpha = Math.sin(t * Math.PI);
          g.drawImage(this.glint, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          // four-point star
          g.strokeStyle = 'rgba(255, 240, 205, 0.8)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(p.x - p.size * 0.5, p.y);
          g.lineTo(p.x + p.size * 0.5, p.y);
          g.moveTo(p.x, p.y - p.size * 0.5);
          g.lineTo(p.x, p.y + p.size * 0.5);
          g.stroke();
          break;
        }
        case 'ember':
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = t * (0.6 + 0.4 * Math.sin(p.rot * 30 + p.life * 25));
          g.drawImage(this.ember, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          g.globalCompositeOperation = 'source-over';
          break;
        case 'ash':
          g.globalAlpha = Math.min(1, age * 4) * t * 0.7;
          g.fillStyle = '#5A534C';
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
          g.restore();
          break;
        case 'ring':
          g.globalAlpha = t * 0.6;
          g.strokeStyle = '#C9B48A';
          g.lineWidth = 1 + 6 * t;
          g.beginPath();
          g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          g.stroke();
          break;
        case 'spark': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          g.globalAlpha = t;
          g.strokeStyle = p.color;
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - (p.vx / sp) * p.size, p.y - (p.vy / sp) * p.size);
          g.stroke();
          break;
        }
        case 'coin':
          g.globalAlpha = Math.min(1, t * 2);
          g.save();
          g.translate(p.x, p.y);
          g.scale(Math.abs(Math.cos(p.rot)) * 0.9 + 0.1, 1);
          g.fillStyle = C.gold;
          g.beginPath();
          g.arc(0, 0, p.size, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = C.goldDark;
          g.lineWidth = 1;
          g.stroke();
          g.restore();
          break;
        default:
          // chip / wax
          g.globalAlpha = Math.min(1, t * 1.5);
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          g.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          g.restore();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}
