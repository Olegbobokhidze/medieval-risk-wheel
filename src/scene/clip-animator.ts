/**
 * Generic keyframed clip animator for character rigs (ADR-0003). Each key eases FROM the previous value of a
 * param TO its own value with its own easing (anticipation → strike → follow-through → settle). Interrupts
 * blend from the current keyed values, so nothing pops. Markers fire exactly once per clip. Pure; unit-tested.
 */
import { lerp, type Ease } from './easing';

export type KeyPose<P extends string> = Partial<Record<P, number>>;
export type Key<P extends string> = { readonly at: number; readonly pose: KeyPose<P>; readonly ease: Ease };

export type Clip<P extends string, N extends string, M extends string> = {
  readonly name: N;
  /** ms; Infinity = hold. */
  readonly duration: number;
  readonly keys: readonly Key<P>[];
  readonly markers: readonly { readonly at: number; readonly name: M }[];
  /** Clip to chain into when done; null = hold the final pose. */
  readonly next: N | null;
  /** How strongly procedural idle motion plays over this clip (0..1). */
  readonly idleWeight: number;
};

type Track = { at: number; v: number; ease: Ease }[];

export class ClipAnimator<P extends string, N extends string, M extends string> {
  private keyed: Record<P, number>;
  private clip: Clip<P, N, M>;
  private t = 0;
  private tracks = new Map<P, Track>();
  private readonly markerListeners = new Set<(m: M) => void>();

  constructor(
    private readonly params: readonly P[],
    neutral: Record<P, number>,
    private readonly clips: Readonly<Record<N, Clip<P, N, M>>>,
    initial: N,
    private readonly speed = 1,
  ) {
    this.keyed = { ...neutral };
    this.clip = clips[initial];
    this.start(this.clip);
  }

  get current(): N {
    return this.clip.name;
  }
  get clipTime(): number {
    return this.t;
  }
  get idleWeight(): number {
    return this.clip.idleWeight;
  }
  values(): Readonly<Record<P, number>> {
    return this.keyed;
  }

  onMarker(l: (m: M) => void): () => void {
    this.markerListeners.add(l);
    return () => this.markerListeners.delete(l);
  }

  play(name: N): void {
    this.start(this.clips[name]);
  }

  update(dtMs: number): Readonly<Record<P, number>> {
    const prev = this.t;
    this.t += Math.min(dtMs, 100) * this.speed;
    for (const m of this.clip.markers) if (m.at > prev && m.at <= this.t) for (const l of this.markerListeners) l(m.name);
    this.keyed = { ...this.keyed, ...this.sample(this.t) };
    if (this.t >= this.clip.duration) {
      const next = this.clip.next;
      if (next) this.start(this.clips[next]);
      else this.freeze();
    }
    return this.keyed;
  }

  private start(clip: Clip<P, N, M>): void {
    this.clip = clip;
    this.t = 0;
    this.tracks = new Map();
    for (const p of this.params) {
      const track: Track = [{ at: 0, v: this.keyed[p], ease: (u) => u }];
      for (const key of clip.keys) {
        const v = key.pose[p];
        if (v !== undefined) track.push({ at: key.at, v, ease: key.ease });
      }
      if (track.length > 1) this.tracks.set(p, track);
    }
  }

  private freeze(): void {
    this.tracks = new Map();
    this.t = 0;
    this.clip = { ...this.clip, duration: Infinity, keys: [], markers: [] };
  }

  private sample(t: number): Partial<Record<P, number>> {
    const out: Partial<Record<P, number>> = {};
    for (const [p, track] of this.tracks) {
      let i = 1;
      while (i < track.length - 1 && (track[i]?.at ?? 0) < t) i++;
      const a = track[i - 1];
      const b = track[i];
      if (!a || !b) continue;
      const span = b.at - a.at;
      const u = span <= 0 ? 1 : Math.min(1, Math.max(0, (t - a.at) / span));
      out[p] = lerp(a.v, b.v, b.ease(u));
    }
    return out;
  }
}
