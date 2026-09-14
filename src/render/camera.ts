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
      8000, // far (covers the 3 km+ LOD shell + fog fade)
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
    cam.position.set(pos.x * SCALE - frameAnchor.x, pos.y * SCALE + 0.7, pos.z * SCALE - frameAnchor.z);

    // Rotate camera to match player heading (yaw) and look-down (pitch)
    cam.rotation.set(0, 0, 0);
    cam.rotateY(-rot.y);
    cam.rotateX(rot.x);
  }

  private updateThirdPerson(pos: Vector3D, rot: Vector3D): void {
    const cam = this.perspectiveCamera;
    const behind = 5;
    const height = 3;

    // Use player rotation to offset camera position behind the player
    const yawRad = -rot.y;
    const offsetX = Math.sin(yawRad) * behind;
    const offsetZ = Math.cos(yawRad) * behind;

    cam.position.set(
      pos.x * SCALE + offsetX - frameAnchor.x,
      pos.y * SCALE + height,
      pos.z * SCALE + offsetZ - frameAnchor.z,
    );

    cam.lookAt(pos.x * SCALE - frameAnchor.x, pos.y * SCALE, pos.z * SCALE - frameAnchor.z);
  }
}
