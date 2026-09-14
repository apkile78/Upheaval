/**
 * Sea-level water plane - a translucent surface at y = 0 that follows the
 * player so oceans and below-sea-level seas read correctly over the real
 * Earth bathymetry mesh (which extends down to ~ -11 km).
 *
 * Architecture: lives in /src/render/; imports Three.js.
 */

import { Mesh, MeshStandardMaterial, PlaneGeometry, Scene } from 'three';
import { frameAnchor } from './frameAnchor';

/** Plane extent (meters): sized for the current ~5 km camera far plane. */
const PLANE_SIZE = 12000;

/** Snap step for the follow position (avoids re-render churn per frame). */
const FOLLOW_SNAP_METERS = 50;

export class WaterPlane {
  private mesh: Mesh;
  private material: MeshStandardMaterial;
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    this.material = new MeshStandardMaterial({
      color: 0x1a5276,
      transparent: true,
      opacity: 0.72,
      roughness: 0.15,
      metalness: 0.05,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(PLANE_SIZE, PLANE_SIZE), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /**
   * Follow the player (snapped to FOLLOW_SNAP_METERS so the plane only moves
   * when actually needed). Visibility is decided by the caller: the plane
   * shows when any nearby sampled surface is at or below sea level.
   */
  update(playerX: number, playerZ: number, visible: boolean): void {
    const x = Math.round(playerX / FOLLOW_SNAP_METERS) * FOLLOW_SNAP_METERS;
    const z = Math.round(playerZ / FOLLOW_SNAP_METERS) * FOLLOW_SNAP_METERS;
    // Anchor-relative so the plane rides the same render-space origin as the terrain.
    this.mesh.position.set(x - frameAnchor.x, 0, z - frameAnchor.z);
    this.mesh.visible = visible;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
