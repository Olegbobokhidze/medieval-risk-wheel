/**
 * Court sound module: every cue is synthesized with Web Audio (wooden ratchet, axle creak, brass bells and
 * fanfare, oak-and-iron thud, wax seal), so there are no files that can fail to load. Mute and volume persist;
 * every call is a safe no-op when audio is unavailable or blocked.
 */
export const Cue = {
  TICK: 'tick',
  LAUNCH: 'launch',
  CHIME: 'chime',
  FANFARE: 'fanfare',
  THUD: 'thud',
  CURSE: 'curse',
  SEAL: 'seal',
  STAKE: 'stake',
  TENSION: 'tension',
  ERROR: 'error',
} as const;
export type Cue = (typeof Cue)[keyof typeof Cue];

export type SoundState = { readonly volume: number; readonly muted: boolean; readonly status: 'locked' | 'running' | 'unavailable' };

const KEY = 'sovereign.audio.v1';
type Ctor = new () => AudioContext;

const storage = {
  get(k: string): string | null {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* private mode / quota */
    }
  },
};

export class CourtSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private state: SoundState;
  private readonly listeners = new Set<() => void>();
  private readonly ctor: Ctor | null;

  constructor(options: { readonly audioContext?: Ctor | null } = {}) {
    const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    this.ctor = options.audioContext !== undefined ? options.audioContext : (w.AudioContext ?? w.webkitAudioContext ?? null);
    let volume = 0.7;
    let muted = false;
    try {
      const p = JSON.parse(storage.get(KEY) ?? 'null') as { volume?: unknown; muted?: unknown } | null;
      if (p && typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1) volume = p.volume;
      if (p && typeof p.muted === 'boolean') muted = p.muted;
    } catch {
      /* corrupt prefs */
    }
    this.state = { volume, muted, status: this.ctor ? 'locked' : 'unavailable' };
  }

  getState = (): SoundState => this.state;
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  setVolume(v: number) {
    this.update({ volume: Math.max(0, Math.min(1, v)) });
  }
  setMuted(m: boolean) {
    this.update({ muted: m });
  }
  toggleMuted() {
    this.setMuted(!this.state.muted);
  }

  /** Call from a user gesture. Idempotent. */
  unlock(): void {
    if (!this.ctor) return;
    try {
      if (!this.ctx) {
        this.ctx = new this.ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyGain();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      this.state = { ...this.state, status: 'running' };
      this.emit();
    } catch {
      this.ctx = null;
      this.state = { ...this.state, status: 'unavailable' };
      this.emit();
    }
  }

  setPageVisible(visible: boolean): void {
    try {
      if (visible) void this.ctx?.resume().catch(() => undefined);
      else void this.ctx?.suspend().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  play(cue: Cue, opts: { readonly pitch?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.state.muted || ctx.state === 'closed') return;
    const k = opts.pitch ?? 1;
    const t = ctx.currentTime + 0.005;
    try {
      switch (cue) {
        case Cue.TICK: // wooden ratchet click against a brass pin; `pitch` carries the strike strength
          this.knock(ctx, t, 1500 + k * 900, 0.018, 0.05 + Math.min(1, k) * 0.12);
          this.noiseHit(ctx, t, 0.02, 'bandpass', 3200, 0.05 + Math.min(1, k) * 0.08);
          break;
        case Cue.LAUNCH: // axle creak + rushing air
          this.tone(ctx, t, 140, 0.35, 'sawtooth', 0.05, 90);
          this.noiseHit(ctx, t + 0.12, 0.7, 'bandpass', 500, 0.12, 1400);
          break;
        case Cue.CHIME: // tarnished brass bell; climbs a step per rung
          for (const [f, d, v] of [
            [1, 0, 0.16],
            [2.76, 0.004, 0.06],
            [5.4, 0.008, 0.025],
          ] as const) this.tone(ctx, t + d, 523 * k * f, 0.9, 'sine', v);
          break;
        case Cue.FANFARE: // brass-like triad fanfare (filtered saw), then a held chord
          [392, 523, 659, 784].forEach((f, i) => this.brass(ctx, t + i * 0.12, f, 0.22, 0.09));
          [523, 659, 784].forEach((f) => this.brass(ctx, t + 0.52, f, 1.1, 0.06));
          break;
        case Cue.THUD: // heavy oak-and-iron impact
          this.tone(ctx, t, 90, 0.6, 'sine', 0.8, 34);
          this.noiseHit(ctx, t, 0.5, 'lowpass', 700, 0.5, 100);
          break;
        case Cue.CURSE: // descending dissonance
          this.tone(ctx, t + 0.08, 311, 1.1, 'triangle', 0.08, 207);
          this.tone(ctx, t + 0.08, 330, 1.1, 'triangle', 0.07, 196);
          break;
        case Cue.SEAL: // wax pressed: soft thump + paper crinkle
          this.knock(ctx, t, 180, 0.08, 0.3);
          this.noiseHit(ctx, t + 0.02, 0.12, 'highpass', 2500, 0.06);
          break;
        case Cue.STAKE: // coins into a leather purse
          for (let i = 0; i < 4; i++) this.tone(ctx, t + i * 0.05, 2400 + ((i * 431) % 900), 0.1, 'sine', 0.05);
          this.noiseHit(ctx, t + 0.18, 0.08, 'lowpass', 700, 0.14);
          break;
        case Cue.TENSION: // low heartbeat
          this.tone(ctx, t, 62, 0.16, 'sine', 0.45, 48);
          this.tone(ctx, t + 0.22, 58, 0.18, 'sine', 0.35, 44);
          break;
        case Cue.ERROR:
          this.tone(ctx, t, 196, 0.25, 'square', 0.06);
          this.tone(ctx, t + 0.12, 147, 0.3, 'square', 0.06);
          break;
      }
    } catch {
      /* audio must never break the game */
    }
  }

  dispose(): void {
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.listeners.clear();
  }

  // ------------------------------------------------------------ synthesis helpers

  private knock(ctx: AudioContext, at: number, freq: number, dur: number, vol: number) {
    this.tone(ctx, at, freq, dur, 'triangle', vol, freq * 0.55);
  }

  private brass(ctx: AudioContext, at: number, freq: number, dur: number, vol: number) {
    if (!this.master) return;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, at);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 2.2, at);
    f.frequency.linearRampToValueAtTime(freq * 4, at + 0.06);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.04);
    g.gain.setValueAtTime(vol, at + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(f).connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private tone(ctx: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    if (!this.master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private noiseHit(ctx: AudioContext, at: number, dur: number, type: BiquadFilterType, freq: number, vol: number, sweepTo?: number) {
    if (!this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  private update(patch: Partial<Pick<SoundState, 'volume' | 'muted'>>) {
    this.state = { ...this.state, ...patch };
    storage.set(KEY, JSON.stringify({ volume: this.state.volume, muted: this.state.muted }));
    this.applyGain();
    this.emit();
  }

  private applyGain() {
    if (!this.ctx || !this.master) return;
    try {
      this.master.gain.setTargetAtTime(this.state.muted ? 0 : this.state.volume * 0.7, this.ctx.currentTime, 0.02);
    } catch {
      /* ignore */
    }
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}
