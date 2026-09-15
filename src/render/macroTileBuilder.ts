/**
 * One macro tile geometry builder - coarse, far-field terrain sampled directly
 * from the real-Earth elevation source.
 *
 * Each macro tile is a coarse grid (tileSize-meter footprint, gridPoints
 * points per side) sampled bilinearly from the same elevation source the voxel
 * chunks use, vertex-colored with the shared height palette. Vertices are
 * anchor-relative (see frameAnchor) with the tile's base offset applied once,
 * so far tiles keep float32 precision.
 *
 * Rings marked `rebakeOnRebase` clip quads whose centers fall inside
 * `clipRadius` (their clip boundary follows the player, so they re-bake per
 * anchor); unclipped tiles are baked once and only re-seated (docs/08).
 *
 * Architecture: lives in /src/render/; imports Three.js and sim types only.
 */

import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { EarthElevationSource } from '../types/world';
import { frameAnchor } from './frameAnchor';
import { getTypeFromHeight } from './chunkGeometry';
import { BIOME_COLORS } from '../sim/world/biomeManager';
import { currentLocalEarthFrame, worldToLocalEnu } from './earth/localFrame';

/**
 * Build one anchor-relative macro tile as a BufferGeometry.
 * tileX/tileZ are tile indices for the given ring (tileSize * index = origin).
 */
export function buildMacroTileGeometry(
  source: EarthElevationSource,
  tileX: number,
  tileZ: number,
  tileSize: number,
  gridPoints: number,
  clipCenterX?: number,
  clipCenterZ?: number,
  clipRadius?: number,
): BufferGeometry {
  const originX = tileX * tileSize;
  const originZ = tileZ * tileSize;
  const step = tileSize / (gridPoints - 1);

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let gz = 0; gz < gridPoints; gz++) {
    for (let gx = 0; gx < gridPoints; gx++) {
      const wx = originX + gx * step;
      const wz = originZ + gz * step;
      const height = source.sampleHeight(wx, wz);

      // Anchor-relative vertex (base offset applied once to the whole tile).
      if (currentLocalEarthFrame === null) {
        positions.push(wx - frameAnchor.x, height, wz - frameAnchor.z);
      } else {
        const local = worldToLocalEnu(wx, wz, height, currentLocalEarthFrame);
        positions.push(local.east, local.up, -local.north);
      }

      const type = getTypeFromHeight(height);
      const color = BIOME_COLORS[type as keyof typeof BIOME_COLORS] ?? BIOME_COLORS.grass;
      colors.push(((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
    }
  }

  for (let gz = 0; gz < gridPoints - 1; gz++) {
    for (let gx = 0; gx < gridPoints - 1; gx++) {
      if (
        clipCenterX !== undefined &&
        clipCenterZ !== undefined &&
        clipRadius !== undefined
      ) {
        const centerX = originX + (gx + 0.5) * step;
        const centerZ = originZ + (gz + 0.5) * step;
        const inside = Math.max(Math.abs(centerX - clipCenterX), Math.abs(centerZ - clipCenterZ)) < clipRadius;
        if (inside) continue;
      }
      const a = gz * gridPoints + gx;
      const b = gz * gridPoints + gx + 1;
      const c = (gz + 1) * gridPoints + gx;
      const d = (gz + 1) * gridPoints + gx + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}