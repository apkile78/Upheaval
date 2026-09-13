/**
 * River tile carving helpers.
 *
 * Split from riverGenerator.ts to respect the 250-line file cap.
 * Pure tile mutation against world-space river segment points - no noise,
 * no rendering imports.
 *
 * Architecture: /src/sim/ layer - pure TypeScript, zero rendering imports.
 */

import type { Vector3D, WorldChunk } from '../../types/world';
import { RIVER_WIDTH } from './riverGenerator';

/** Carve corridor half-width: half of RiverGenerator's traced width. */
export const RIVER_HALF_WIDTH = RIVER_WIDTH / 2;

/** Point-to-segment distance in the XZ plane. */
export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = 0;
  if (l2 > 0) {
    t = ((px - ax) * dx + (pz - az) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return Math.sqrt((px - cx) * (px - cx) + (pz - cz) * (pz - cz));
}

/**
 * Carve river channels into a chunk's tiles: any column whose XZ center is
 * within the river half-width of a path segment has its surface tile set to
 * 'water'. The heightmap is intentionally untouched so terrain-follow
 * physics and render mesh stay consistent.
 *
 * @returns Number of columns carved.
 */
export function carveRiverTiles(chunk: WorldChunk, points: Vector3D[], halfWidth: number = RIVER_HALF_WIDTH): number {
  let carved = 0;
  for (let x = 0; x < chunk.tiles.length; x++) {
    for (let z = 0; z < chunk.tiles[x].length; z++) {
      const wx = chunk.coordinate.x * 16 + x + 0.5;
      const wz = chunk.coordinate.z * 16 + z + 0.5;

      let near = false;
      if (points.length === 1) {
        near = Math.sqrt((wx - points[0].x) * (wx - points[0].x) + (wz - points[0].z) * (wz - points[0].z)) < halfWidth;
      } else {
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i];
          const b = points[i + 1];
          if (distToSegment(wx, wz, a.x, a.z, b.x, b.z) < halfWidth) {
            near = true;
            break;
          }
        }
      }
      if (!near) continue;

      // Surface tile: top-down scan; air tiles carry elevation -1.
      const column = chunk.tiles[x][z];
      for (let y = column.length - 1; y >= 0; y--) {
        if (column[y].elevation >= 0) {
          column[y].terrainType = 'water';
          carved++;
          break;
        }
      }
    }
  }
  return carved;
}
