import { Cue, type CourtSound } from '../audio/sound';
import type { Scene } from '../scene/scene';

/**
 * Scene beats → audio (ADR-0002/0003). Lives in ui/ because only the composition layer may know both scene and audio.
 * Every cue fires on the animation beat it belongs to: pin ticks scale with wheel speed, chimes climb with the rung.
 */
export function bindSceneSound(scene: Scene, sound: CourtSound, rung: () => number): () => void {
  return scene.onEvent((e) => {
    switch (e.type) {
      case 'launch':
        sound.play(Cue.LAUNCH);
        break;
      case 'tick':
        sound.play(Cue.TICK, { pitch: 0.25 + e.strength });
        break;
      case 'tension':
        sound.play(Cue.TENSION);
        break;
      case 'landed':
        if (e.kind === 'advance') sound.play(Cue.CHIME, { pitch: 1 + rung() * 0.125 });
        else {
          sound.play(Cue.THUD);
          sound.play(Cue.CURSE);
        }
        break;
      case 'reforge':
        sound.play(Cue.SEAL);
        break;
      case 'collect':
        sound.play(Cue.FANFARE);
        break;
      case 'push':
        break;
    }
  });
}
