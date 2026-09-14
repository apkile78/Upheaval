/**
 * Distant-terrain LOD shell - coarse, far-field geometry sampled directly
 * from the real-Earth elevation source.
 *
 * Each macro tile is a coarse screen-space grid (MACRO_TILE_SIZE-meter
 * footprint, GRID_POINTS points per side) sampled bilinearly from the same
 * elevation source the voxel chunks use, vertex-colored with the shared
 * height palette. Geometry is built anchor-relative via frameAnchor (mesh
 * origin rebased once per tile, vertices carry absolute world heights minus
 * the anchor at build time) so far tiles keep float32 precision. Tiles are
 * cached by tile coordinate and only rebuilt on anchor re-bases.
 *
 * Architecture: lives in /src/render/; imports Three.js and sim types only.
 */

import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { EarthElevationSource } from '../types/world';
import { frameAnchor } from './frameAnchor';
import { getTypeFromHeight } from './chunkGeometry';
import { BIOME_COLORS } from '../sim/world/biomeManager';

/** Macro tile footprint in meters. Covers the 3 km+ ring with headroom. */
export const MACRO_TILE_SIZE = 1024;

/** Grid points per macro tile side (33 x 33 vertices, 32 x 32 quads). */
export const MACRO_GRID_POINTS = 33;

/** Half-extent of the macro shell in tiles (7 x 7 = ~7.2 km span). */
export const MACRO_HALF_TILES = 3;

/**
 * Build one anchor-relative macro tile as a BufferGeometry.
 * tileX/tileZ are macro-tile indices (MACRO_TILE_SIZE * index = world origin).
 */
export function buildMacroTileGeometry(
  source: EarthElevationSource,
  tileX: number,
  tileZ: number,
): BufferGeometry {
  const originX = tileX * MACRO_TILE_SIZE;
  const originZ = tileZ * MACRO_TILE_SIZE;
  const step = MACRO_TILE_SIZE / (MACRO_GRID_POINTS - 1);

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let gz = 0; gz < MACRO_GRID_POINTS; gz++) {
    for (let gx = 0; gx < MACRO_GRID_POINTS; gx++) {
      const wx = originX + gx * step;
      const wz = originZ + gz * step;
      const height = source.sampleHeight(wx, wz);

      // Anchor-relative vertex (base offset applied once to the whole tile).
      positions.push(wx - frameAnchor.x, height, wz - frameAnchor.z);

      const type = getTypeFromHeight(height);
      const color = BIOME_COLORS[type as keyof typeof BIOME_COLORS] ?? BIOME_COLORS.grass;
      colors.push(((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
    }
  }

  for (let gz = 0; gz < MACRO_GRID_POINTS - 1; gz++) {
    for (let gx = 0; gx < MACRO_GRID_POINTS - 1; gx++) {
      const a = gz * MACRO_GRID_POINTS + gx;
      const b = gz * MACRO_GRID_POINTS + gx + 1;
      const c = (gz + 1) * MACRO_GRID_POINTS + gx;
      const d = (gz + 1) * MACRO_GRID_POINTS + gx + 1;
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
