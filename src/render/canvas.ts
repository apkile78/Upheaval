/**
 * WebGL rendering scaffold.
 * Sets up the Three.js renderer, scene container, and animation loop.
 * Bridges simulation state from /src/sim/ into the render tree.
 *
 * Architecture: lives entirely in /src/render/; never imported by /src/sim/.
 */

import {
  WebGLRenderer,
  Scene,
  Color,
  PerspectiveCamera,
} from 'three';

import type { PlayerState } from '../types/player';
import { CameraController } from './camera';

/** Default clear colour (CDDA-style dark overcast sky). */
const DEFAULT_SKY_COLOR = 0x1a1a2e;

/** Singleton render-scene container. */
export const scene: Scene = new Scene();
scene.background = new Color(DEFAULT_SKY_COLOR);

/** WebGL renderer instance. Created once and reused for the lifetime of the page. */
export const renderer: WebGLRenderer = new WebGLRenderer({
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false; // enabled when we have materials

/** Module-level camera controller instance. Set by initRender. */
let cameraController: CameraController | null = null;

/**
 * Initialise the render target and return the camera controller.
 *
 * @param mountNode  - The DOM element to attach the canvas to.
 * @returns           - Configured CameraController for external use.
 */
export function initRender(mountNode: HTMLElement): CameraController {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mountNode.appendChild(renderer.domElement);

  cameraController = new CameraController(renderer.domElement);

  function onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);

    if (cameraController !== null && cameraController.currentMode !== null) {
      // Only perspective cameras have the aspect property.
      const cam = cameraController.camera;
      if (cam instanceof PerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
    }
  }

  window.addEventListener('resize', onResize);

  return cameraController;
}

/**
 * Drive one frame of interpolation from simulation state.
 * Call this from the game loop when decoupling sim from render.
 *
 * @param player - Current player state used to position cameras.
 */
export function renderFrame(player: PlayerState): void {
  if (cameraController === null) return;
  cameraController.update(player);
  renderer.render(scene, cameraController.camera);
}
