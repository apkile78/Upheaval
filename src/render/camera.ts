/**
 * Camera controller providing triple-perspective support.
 * Supports first-person, third-person, and isometric views
 * driven by simulation player state.
 *
 * Architecture: lives in /src/render/; imports only from /src/types/.
 */

import {
  PerspectiveCamera,
  OrthographicCamera,
} from 'three';

import type { CameraViewMode, PlayerState } from '../types/player';
import type { Vector3D } from '../types/world';

/** Conversion factor: sim units to Three.js world units. */
const SCALE = 1;

/**
 * Triple-perspective camera controller.
 * Maintains up to three camera instances and switches between them
 * based on the active CameraViewMode.
 */
export class CameraController {
  private readonly canvas: HTMLCanvasElement;

  /** Active perspective camera (first-person & third-person). */
  private perspectiveCamera: PerspectiveCamera;

  /** Orthographic camera for isometric view. */
  private orthographicCamera: OrthographicCamera;

  /** Currently active camera exposed for external render calls. */
  public camera: PerspectiveCamera | OrthographicCamera;

  /** Currently active view mode, or null before first setMode call. */
  public currentMode: CameraViewMode | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const aspect = canvas.clientWidth / canvas.clientHeight;

    this.perspectiveCamera = new PerspectiveCamera(
      75, // field of view
      aspect,
      0.1, // near
      1000, // far
    );
    this.perspectiveCamera.position.set(0, 1.7, 0); // eye height

    this.orthographicCamera = new OrthographicCamera(
      -aspect * 10,
      aspect * 10,
      10,
      -10,
      0.1,
      1000,
    );
    this.orthographicCamera.position.set(0, 20, 0);
    this.orthographicCamera.lookAt(0, 0, 0);

    this.camera = this.perspectiveCamera;
  }

  /** Switch to the given view mode and reconfigure the active camera. */
  setMode(mode: CameraViewMode): void {
    this.currentMode = mode;

    if (mode === 'isometric') {
      this.camera = this.orthographicCamera;
      this.syncOrthoAspect();
    } else {
      this.camera = this.perspectiveCamera;
      this.perspectiveCamera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
      this.perspectiveCamera.updateProjectionMatrix();
    }
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
      case 'isometric':
        this.updateIsometric(pos);
        break;
    }
  }

  private updateFirstPerson(pos: Vector3D, rot: Vector3D): void {
    const cam = this.perspectiveCamera;
    cam.position.set(pos.x * SCALE, pos.y * SCALE + 1.7, pos.z * SCALE);

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
      pos.x * SCALE + offsetX,
      pos.y * SCALE + height,
      pos.z * SCALE + offsetZ,
    );

    cam.lookAt(pos.x * SCALE, pos.y * SCALE + 1.5, pos.z * SCALE);
  }

  private updateIsometric(pos: Vector3D): void {
    const cam = this.orthographicCamera;
    const dist = 30;

    cam.position.set(
      pos.x * SCALE + dist,
      pos.y * SCALE + dist,
      pos.z * SCALE + dist,
    );
    cam.lookAt(pos.x * SCALE, pos.y * SCALE, pos.z * SCALE);
    this.syncOrthoAspect();
  }

  private syncOrthoAspect(): void {
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    const halfHeight = 10;
    const halfWidth = aspect * halfHeight;

    this.orthographicCamera.left = -halfWidth;
    this.orthographicCamera.right = halfWidth;
    this.orthographicCamera.top = halfHeight;
    this.orthographicCamera.bottom = -halfHeight;
    this.orthographicCamera.updateProjectionMatrix();
  }
}
