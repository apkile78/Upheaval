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

/**
 * LOD ring layout: the macro shell builds two rings of differently-sized
 * tiles. The near ring fills the gap between the voxel chunks and the far
 * ring; the far ring covers the 3 km+ horizon.
 */
export interface MacroRing {
  /** Tile footprint in meters. */
  tileSize: number;
  /** Grid points per tile side. */
  gridPoints: number;
  /** Ring bounds in meters from the player (center-basis X/Z radii). */
  innerRadius: number;
  outerRadius: number;
}

export const MACRO_NEAR_RING: MacroRing = {
  tileSize: 256,
  gridPoints: 33,
  innerRadius: 96,
  outerRadius: 1100,
};

export const MACRO_FAR_RING: MacroRing = {
  tileSize: 1024,
  gridPoints: 33,
  innerRadius: 768,
  outerRadius: 3600,
};

/**
 * Voxel-chunk half extent (square) in meters that the shell skips around the
 * player. Tiles whose bounds intersect this box keep their voxel depiction.
 */
export const VOXEL_SKIP_HALF = 112;

/** True when a macro tile AABB intersects the voxel box around the player. */
export function intersectsVoxelBox(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  centerWorldX: number,
  centerWorldZ: number,
): boolean {
  return (
    minX < centerWorldX + VOXEL_SKIP_HALF &&
    maxX > centerWorldX - VOXEL_SKIP_HALF &&
    minZ < centerWorldZ + VOXEL_SKIP_HALF &&
    maxZ > centerWorldZ - VOXEL_SKIP_HALF
  );
}

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
      positions.push(wx - frameAnchor.x, height, wz - frameAnchor.z);

      const type = getTypeFromHeight(height);
      const color = BIOME_COLORS[type as keyof typeof BIOME_COLORS] ?? BIOME_COLORS.grass;
      colors.push(((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
    }
  }

  for (let gz = 0; gz < gridPoints - 1; gz++) {
    for (let gx = 0; gx < gridPoints - 1; gx++) {
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
