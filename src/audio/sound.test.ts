import { describe, expect, it } from 'vitest';
import { CourtSound, Cue } from './sound';

describe('CourtSound', () => {
  it('is a safe no-op without Web Audio', () => {
    const s = new CourtSound({ audioContext: null });
    expect(s.getState().status).toBe('unavailable');
    expect(() => {
      s.unlock();
      for (const c of Object.values(Cue)) s.play(c);
      s.setPageVisible(false);
      s.dispose();
    }).not.toThrow();
  });
  it('survives an AudioContext that refuses to start', () => {
    const Refusing = class {
      constructor() {
        throw new Error('NotAllowedError');
      }
    } as unknown as new () => AudioContext;
    const s = new CourtSound({ audioContext: Refusing });
    expect(() => s.unlock()).not.toThrow();
    expect(s.getState().status).toBe('unavailable');
  });
  it('clamps volume and toggles mute', () => {
    const s = new CourtSound({ audioContext: null });
    s.setVolume(4);
    expect(s.getState().volume).toBe(1);
    s.toggleMuted();
    expect(s.getState().muted).toBe(true);
  });
});
