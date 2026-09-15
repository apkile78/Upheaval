/**
 * Camera controller providing first-person and third-person views,
 * driven by simulation player state.
 *
 * Positions are resolved through the shared render-space frame anchor so
 * far-from-origin world coordinates keep float32 precision. Lights and the
 * camera all operate in anchor-relative render space.
 *
 * Architecture: lives in /src/render/; imports only from /src/types/.
 */

import {
  PerspectiveCamera,
} from 'three';

import type { CameraViewMode, PlayerState } from '../types/player';
import type { Vector3D } from '../types/world';
import { frameAnchor } from './frameAnchor';
import { currentLocalEarthFrame, worldToLocalEnu } from './earth/localFrame';

/** Conversion factor: sim units to Three.js world units. */
export const SCALE = 1;

/**
 * Two-perspective camera controller.
 * Maintains the shared projection camera with first- and third-person
 * placement, switched by the active CameraViewMode.
 */
export class CameraController {
  private readonly canvas: HTMLCanvasElement;

  /** Active perspective camera (first-person & third-person). */
  private perspectiveCamera: PerspectiveCamera;

  /** Currently active camera exposed for external render calls. */
  public camera: PerspectiveCamera;

  /** Currently active view mode, or null before first setMode call. */
  public currentMode: CameraViewMode | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const aspect = canvas.clientWidth / canvas.clientHeight;

    this.perspectiveCamera = new PerspectiveCamera(
      75, // field of view
      aspect,
      0.1, // near
      22000, // far (covers the normal shell and curved horizon)
    );
    this.perspectiveCamera.position.set(0 - frameAnchor.x, 1.7, 0 - frameAnchor.z); // eye height

    this.camera = this.perspectiveCamera;
  }

  /** Switch to the given view mode and reconfigure the active camera. */
  setMode(mode: CameraViewMode): void {
    this.currentMode = mode;
    this.camera = this.perspectiveCamera;

    this.perspectiveCamera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.perspectiveCamera.updateProjectionMatrix();
  }

  /**
   * Update camera position and orientation from latest player state.
   * Called once per render frame after simulation tick.
   */
  update(player: PlayerState): void {
    if (this.currentMode === null) return;

    const pos = player.transform.position;
    const rot = player.transform.rotation;

    switch (this.currentMode) {
      case 'first-person':
        this.updateFirstPerson(pos, rot);
        break;
      case 'third-person':
        this.updateThirdPerson(pos, rot);
        break;
    }
  }

  private updateFirstPerson(pos: Vector3D, rot: Vector3D): void {
    const cam = this.perspectiveCamera;
    const local = currentLocalEarthFrame === null
      ? { east: pos.x * SCALE - frameAnchor.x, up: pos.y * SCALE, north: -(pos.z * SCALE - frameAnchor.z) }
      : worldToLocalEnu(pos.x, pos.z, pos.y, currentLocalEarthFrame);
    cam.position.set(local.east, local.up + 0.7, -local.north);

    // Three.js looks down -Z by default; the simulation's forward direction is +Z.
    cam.rotation.set(rot.x, rot.y - Math.PI, 0);
  }

  private updateThirdPerson(pos: Vector3D, rot: Vector3D): void {
    const cam = this.perspectiveCamera;
    const behind = 5;
    const height = 3;

    // Use player rotation to offset camera position behind the player
    const offsetX = -Math.sin(rot.y) * behind;
    const offsetZ = -Math.cos(rot.y) * behind;

    const local = currentLocalEarthFrame === null
      ? { east: pos.x * SCALE - frameAnchor.x, up: pos.y * SCALE, north: -(pos.z * SCALE - frameAnchor.z) }
      : worldToLocalEnu(pos.x, pos.z, pos.y, currentLocalEarthFrame);
    cam.position.set(local.east + offsetX, local.up + height, -local.north + offsetZ);
    cam.lookAt(local.east, local.up, -local.north);
  }
}
