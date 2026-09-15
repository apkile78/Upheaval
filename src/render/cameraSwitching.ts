/**
 * Camera mode switching - keyboard bindings (1/2) for the two-perspective
 * camera system. Keeps main.ts focused on wiring the simulation and render
 * subsystems together.
 *
 * Architecture: lives in /src/render/; imports sim/render types only.
 */

import type { CameraViewMode } from '../types/player';
import type { PlayerState } from '../types/player';

/** Minimal structural contract for the camera controller. */
interface CameraModeSink {
  setMode(mode: CameraViewMode): void;
}

const KEY_MODES: Record<string, CameraViewMode> = {
  '1': 'first-person',
  '2': 'third-person',
};

/** Bind 1/2 to camera modes, keeping PlayerState.cameraMode in sync. */
export function initCameraSwitching(camera: CameraModeSink, player: PlayerState): void {
  window.addEventListener('keydown', (e: KeyboardEvent): void => {
    const mode = KEY_MODES[e.key];
    if (mode === undefined) return;
    player.cameraMode = mode;
    camera.setMode(mode);
  });
}