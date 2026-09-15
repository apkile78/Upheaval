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
import { currentLocalEarthFrame, worldToLocalEnu } from './earth/localFrame';

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
  /** Whether tiles crossing the inner boundary belong to the previous ring. */
  exclusiveInner?: boolean;
}

export const NORMAL_TERRAIN_RADIUS = 8000;
export const HORIZON_TERRAIN_RADIUS = 20000;
export const SCOPE_TERRAIN_RADIUS = 35000;

export const MACRO_NEAR_RING: MacroRing = {
  tileSize: 256,
  gridPoints: 33,
  innerRadius: 96,
  outerRadius: 1280,
};

export const MACRO_FAR_RING: MacroRing = {
  tileSize: 256,
  gridPoints: 9,
  innerRadius: MACRO_NEAR_RING.outerRadius,
  outerRadius: NORMAL_TERRAIN_RADIUS,
  exclusiveInner: true,
};

/**
 * Voxel-chunk half extent (square) in meters that the shell skips around the
 * player. Tiles whose bounds intersect this box keep their voxel depiction.
 */
export const VOXEL_SKIP_HALF = 112;

/** Distance range of a tile bounds in the square render-distance metric. */
export function tileDistanceRange(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  centerWorldX: number,
  centerWorldZ: number,
): { min: number; max: number } {
  const dx = Math.max(minX - centerWorldX, 0, centerWorldX - maxX);
  const dz = Math.max(minZ - centerWorldZ, 0, centerWorldZ - maxZ);
  const min = Math.max(dx, dz);
  const max = Math.max(
    Math.abs(minX - centerWorldX),
    Math.abs(maxX - centerWorldX),
    Math.abs(minZ - centerWorldZ),
    Math.abs(maxZ - centerWorldZ),
  );
  return { min, max };
}

/** True when a macro tile bounds overlaps a render-distance band. */
export function tileOverlapsRing(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  centerWorldX: number,
  centerWorldZ: number,
  ring: MacroRing,
): boolean {
  const distance = tileDistanceRange(minX, maxX, minZ, maxZ, centerWorldX, centerWorldZ);
  const reachesInnerBoundary = ring.exclusiveInner
    ? distance.min >= ring.innerRadius
    : distance.max >= ring.innerRadius;
  return reachesInnerBoundary && distance.min <= ring.outerRadius;
}

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
