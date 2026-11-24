import type { TrialController } from '../engine/controller';
import { TrialState } from '../engine/machine';
import { Cue, type CourtSound } from './sound';

/**
 * Engine-level cues only (stake, error). Wheel, character and FX cues follow the scene's animation beats
 * (ui/scene-sound.ts), so they land exactly on the motion. Audio observes; it never drives (ADR-0001).
 */
export function bindSound(controller: TrialController, sound: CourtSound): () => void {
  return controller.onTransition((r) => {
    if (!r.accepted || r.from === r.to) return;
    if (r.to === TrialState.CONFIGURING) sound.play(Cue.STAKE);
    if (r.to === TrialState.ERROR_RECOVERABLE) sound.play(Cue.ERROR);
  });
}
