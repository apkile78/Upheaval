/**
 * Selection wireframe box that highlights the currently targeted tile.
 *
 * Architecture: lives in /src/render/; imports Three.js.
 * Automatically created and managed; position updates each frame.
 */

import { BoxGeometry, LineBasicMaterial, LineSegments, EdgesGeometry } from 'three';
import { frameAnchor } from './frameAnchor';
import { currentLocalEarthFrame, worldToLocalEnu } from './earth/localFrame';

/** Wireframe color for the targeted tile outline. */
const HIGHLIGHT_COLOR = 0x00ff88;

/** Selection box edge width. */
/**
 * Reusable geometry/material for the selection wireframe.
 * Created once; position is updated via updatePosition().
 */
export class SelectionBox {
  private mesh: LineSegments;

  constructor() {
    const geometry = new BoxGeometry(1, 1, 1);
    const edges = new EdgesGeometry(geometry);
    geometry.dispose();

    const material = new LineBasicMaterial({
      color: HIGHLIGHT_COLOR,
    });

    this.mesh = new LineSegments(edges, material);
    this.mesh.visible = false;
  }

  /** Reference to the underlying Three.js LineSegments mesh. */
  get meshRef(): LineSegments {
    return this.mesh;
  }

  /** Show/hide the selection box. */
  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  /** Update the box position and size to match a target tile. */
  updatePosition(tileX: number, tileY: number, tileZ: number): void {
    // Tile center in world space, minus the shared render-space anchor.
    this.mesh.position.set(
      tileX + 0.5 - frameAnchor.x,
      tileY + 0.5,
      tileZ + 0.5 - frameAnchor.z,
    );
    this.mesh.visible = true;
  }

  /**
   * Update the box to highlight a specific tile at the given world position.
   * @param worldPos World-space position of the tile center.
   */
  updateFromWorldPos(worldPos: { x: number; y: number; z: number }): void {
    if (currentLocalEarthFrame === null) {
      this.mesh.position.set(worldPos.x - frameAnchor.x, worldPos.y, worldPos.z - frameAnchor.z);
    } else {
      const local = worldToLocalEnu(worldPos.x, worldPos.z, worldPos.y, currentLocalEarthFrame);
      this.mesh.position.set(local.east, local.up, -local.north);
    }
    this.mesh.visible = true;
  }

  /** Hide the selection box. */
  hide(): void {
    this.mesh.visible = false;
  }
}

// Singleton instance
export const selectionBox = new SelectionBox();
