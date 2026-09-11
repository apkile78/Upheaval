/**
 * Physics primitives for collision detection and raycasting.
 * Shared contract between simulation collision module and potential
 * future systems (line-of-sight, visibility, projectile hits).
 *
 * Architecture: lives in /src/types/; never imports from /src/sim/ or /src/render/.
 */

import type { Vector3D } from './world';

/** Axis-Aligned Bounding Box defined by minimum and maximum corner vectors. */
export interface AABB {
  min: Vector3D;
  max: Vector3D;
}

/** Ray defined by an origin point and a direction vector. */
export interface Ray {
  origin: Vector3D;
  direction: Vector3D;
}

/** Result of a raycast intersection test. */
export interface RaycastHit {
  point: Vector3D;
  normal: Vector3D;
  distance: number;
  hit: boolean;
}

/** Extended raycast result that includes the hit tile's world-space tile coordinate. */
export interface RaycastTileHit extends RaycastHit {
  tileCoord: {
    x: number;
    y: number;
    z: number;
  };
}


/**
 * A tile in world-space coordinates used for collision queries.
 * Derived from TerrainTile but with world-position context.
 */
export interface CollisionTile {
  worldX: number;
  worldY: number;
  worldZ: number;
  terrainType: import('./world').TileTerrainType;
  elevation: number;
}

/**
 * Player body dimensions used to construct the collision AABB.
 * Values in world units (1 unit ≈ 1 metre).
 */
export const PLAYER_HALF_WIDTH = 0.2;
export const PLAYER_HALF_HEIGHT = 0.9;
export const PLAYER_HALF_DEPTH = 0.2;

/** Terrain types that block player movement (impassable). */
export const IMPASSABLE_TERRAIN: ReadonlySet<import('./world').TileTerrainType> = new Set([
  'stone',
  'mountain',
  'building',
  'metal',
]);

/** Terrain types that are impassable when the player is below the surface elevation. */
export const SWIMMABLE_TERRAIN: ReadonlySet<import('./world').TileTerrainType> = new Set([
  'water',
  'swamp',
]);
