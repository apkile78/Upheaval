/**
 * Voxel raycasting module using 3D DDA (Digital Differential Analyzer)
 * traversal for efficient tile-vs-ray intersection.
 *
 * Architecture: lives in /src/sim/physics/; imports ONLY from /src/types/.
 * Zero Three.js, Babylon.js, or DOM imports.
 */

import type { Ray, RaycastTileHit } from '../../types/physics';
import type { Vector3D } from '../../types/world';
import type { TerrainTile, WorldChunk, ChunkCoordinate } from '../../types/world';
import { IMPASSABLE_TERRAIN } from '../../types/physics';

/**
 * Deterministic voxel traversal using the Amanatides & Woo DDA algorithm.
 *
 * Steps through the voxel grid one tile at a time, checking each candidate
 * tile for solidity. Returns the first solid tile hit, or null if the ray
 * exits the traversed region without hitting anything.
 *
 * @param ray           - Ray to cast (origin + direction).
 * @param maxDistance   - Maximum traversal distance in world units.
 * @param chunkManager  - Chunk manager providing active chunks and tile data.
 * @returns RaycastTileHit with hit info and tile coordinate, or null.
 */
export function raycastTiles(
  ray: Ray,
  maxDistance: number,
  chunkManager: {
    getChunk(coord: ChunkCoordinate): WorldChunk | undefined;
  },
): RaycastTileHit | null {
  const { origin, direction } = ray;

  // Handle zero-length direction
  if (direction.x === 0 && direction.y === 0 && direction.z === 0) {
    return null;
  }

  // Current voxel (tile coordinate) we are in
  let tileX = Math.floor(origin.x);
  let tileY = Math.floor(origin.y);
  let tileZ = Math.floor(origin.z);

  // Length of ray from current position to next voxel boundary in each axis
  const tDeltaX = direction.x !== 0 ? 1 / Math.abs(direction.x) : Infinity;
  const tDeltaY = direction.y !== 0 ? 1 / Math.abs(direction.y) : Infinity;
  const tDeltaZ = direction.z !== 0 ? 1 / Math.abs(direction.z) : Infinity;

  // Distance along ray to the next voxel boundary in each axis
  let tMaxX: number, tMaxY: number, tMaxZ: number;

  if (direction.x > 0) {
    tMaxX = ((Math.floor(origin.x) + 1 - origin.x) / direction.x);
  } else if (direction.x < 0) {
    tMaxX = ((origin.x - Math.floor(origin.x)) / -direction.x);
  } else {
    tMaxX = Infinity;
  }

  if (direction.y > 0) {
    tMaxY = ((Math.floor(origin.y) + 1 - origin.y) / direction.y);
  } else if (direction.y < 0) {
    tMaxY = ((origin.y - Math.floor(origin.y)) / -direction.y);
  } else {
    tMaxY = Infinity;
  }

  if (direction.z > 0) {
    tMaxZ = ((Math.floor(origin.z) + 1 - origin.z) / direction.z);
  } else if (direction.z < 0) {
    tMaxZ = ((origin.z - Math.floor(origin.z)) / -direction.z);
  } else {
    tMaxZ = Infinity;
  }

  // Step direction in each axis (+1 or -1)
  const stepX = direction.x > 0 ? 1 : direction.x < 0 ? -1 : 0;
  const stepY = direction.y > 0 ? 1 : direction.y < 0 ? -1 : 0;
  const stepZ = direction.z > 0 ? 1 : direction.z < 0 ? -1 : 0;

  // Accumulated traversal distance
  let t = 0;
  const maxSteps = 10000; // Prevent infinite loops

  for (let i = 0; i < maxSteps && t < maxDistance; i++) {
    // Check current tile
    const hit = checkTileAt(
      tileX, tileY, tileZ,
      chunkManager,
      origin,
      direction,
      t,
    );
    if (hit !== null) {
      return hit;
    }

    // Advance to next voxel
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        tileX += stepX;
        tMaxX += tDeltaX;
      } else {
        t = tMaxZ;
        tileZ += stepZ;
        tMaxZ += tDeltaZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        t = tMaxY;
        tileY += stepY;
        tMaxY += tDeltaY;
      } else {
        t = tMaxZ;
        tileZ += stepZ;
        tMaxZ += tDeltaZ;
      }
    }
  }

  return null;
}

/**
 * Check if a specific tile is solid and compute hit info if so.
 */
function checkTileAt(
  tileX: number,
  tileY: number,
  tileZ: number,
  chunkManager: {
    getChunk(coord: ChunkCoordinate): WorldChunk | undefined;
  },
  rayOrigin: Vector3D,
  rayDir: Vector3D,
  t: number,
): RaycastTileHit | null {
  // Determine which chunk this tile belongs to
  const chunkCoord: ChunkCoordinate = {
    x: Math.floor(tileX / 16),
    y: Math.floor(tileY / 16),
    z: Math.floor(tileZ / 16),
  };

  const chunk = chunkManager.getChunk(chunkCoord);
  if (chunk === undefined) {
    return null;
  }

  // Convert to local tile coordinates within the chunk
  const localX = tileX - chunk.coordinate.x * 16;
  const localY = tileY - chunk.coordinate.y * 16;
  const localZ = tileZ - chunk.coordinate.z * 16;

  // Bounds check
  if (
    localX < 0 || localX >= chunk.tiles.length ||
    localY < 0 || localY >= chunk.tiles[0]?.length ||
    localZ < 0 || localZ >= chunk.tiles[0]?.[0]?.length
  ) {
    return null;
  }

  const tile = chunk.tiles[localX]?.[localY]?.[localZ];
  if (tile === undefined || !isSolidTile(tile)) {
    return null;
  }

  // Compute world position of intersection point
  const hitPoint: Vector3D = {
    x: rayOrigin.x + rayDir.x * t,
    y: rayOrigin.y + rayDir.y * t,
    z: rayOrigin.z + rayDir.z * t,
  };

  // Compute face normal based on which side of the voxel we entered from
  const normal = computeFaceNormal(rayDir, tileX, tileY, tileZ, rayOrigin);

  return {
    point: hitPoint,
    normal,
    distance: t,
    hit: true,
    tileCoord: { x: tileX, y: tileY, z: tileZ },
  };
}

/** Determine if a tile blocks ray traversal (solid). */
function isSolidTile(tile: TerrainTile): boolean {
  return IMPASSABLE_TERRAIN.has(tile.terrainType) ||
    (tile.elevation > 0 && tile.elevation > 2);
}

/**
 * Compute the face normal of the voxel we entered.
 * Determines which axis we crossed and in which direction.
 */
function computeFaceNormal(
  rayDir: Vector3D,
  tileX: number,
  tileY: number,
  tileZ: number,
  rayOrigin: Vector3D,
): Vector3D {
  // Determine entry side by checking the ray origin relative to the tile center
  const tileCenterX = tileX + 0.5;
  const tileCenterY = tileY + 0.5;
  const tileCenterZ = tileZ + 0.5;

  // If ray origin is to the left of tile center, we entered from the -X side
  if (rayOrigin.x < tileCenterX && Math.abs(rayDir.x) > 0.001) {
    return { x: -1, y: 0, z: 0 };
  }
  if (rayOrigin.x > tileCenterX && Math.abs(rayDir.x) > 0.001) {
    return { x: 1, y: 0, z: 0 };
  }
  if (rayOrigin.y < tileCenterY && Math.abs(rayDir.y) > 0.001) {
    return { x: 0, y: -1, z: 0 };
  }
  if (rayOrigin.y > tileCenterY && Math.abs(rayDir.y) > 0.001) {
    return { x: 0, y: 1, z: 0 };
  }
  if (rayOrigin.z < tileCenterZ && Math.abs(rayDir.z) > 0.001) {
    return { x: 0, y: 0, z: -1 };
  }
  if (rayOrigin.z > tileCenterZ && Math.abs(rayDir.z) > 0.001) {
    return { x: 0, y: 0, z: 1 };
  }

  // Default: assume we hit the top face (most common for downward-looking rays)
  return { x: 0, y: 1, z: 0 };
}
