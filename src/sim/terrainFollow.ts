/**
 * Smooth terrain-following physics - snaps entities to the surface heightmap.
 *
 * The player's transform.position is the entity CENTER. Feet rest at
 * centerY - HALF_HEIGHT, which the renderer places directly ON the surface.
 * To avoid clipping into the triangulated terrain mesh (which uses the max
 * of surrounding column heights), we snap to the max corner height + half-body.
 *
 * Architecture: /src/sim/ layer — pure TypeScript, zero rendering imports.
 */

import type { PlayerState } from '../types/player';
import type { ChunkManager } from './world/chunkManager';

/** Max vertical climb speed (units/sec) when ascending terrain. */
const MAX_CLIMB_SPEED = 50.0

/** Max vertical fall speed (units/sec) when descending terrain. */
const MAX_FALL_SPEED = 100.0

/** Dead-zone tolerance (units) to snap exactly to surface and avoid floating. */
const HEIGHT_TOLERANCE = 0.05

/** Player body half-height (center-to-feet). Entity is 1.8 units tall. */
const HALF_HEIGHT = 0.9

/**
 * Snap the player feet to the terrain surface with smooth vertical motion.
 * Uses the highest of the 4 surrounding corner heights so the player rides
 * ON TOP of the triangulated terrain mesh instead of clipping into it.
 *
 * @param player    - Player state whose Y position is adjusted (entity center).
 * @param chunkMgr  - Chunk manager providing bilinear height lookups.
 * @param dt        - Delta time in seconds for appropriate smoothing.
 */
export function snapPlayerToGround(player: PlayerState, chunkMgr: ChunkManager, dt: number): void {
  const px = player.transform.position.x
  const pz = player.transform.position.z

  // Bilinear interpolation across the 4 surrounding grid vertices.
  // This matches the terrain mesh geometry exactly so the player rides ON the surface.
  const x0 = Math.floor(px), z0 = Math.floor(pz)
  const x1 = x0 + 1, z1 = z0 + 1
  const tx = px - x0, tz = pz - z0
  const h00 = chunkMgr.getHeightAt(x0, z0)
  const h10 = chunkMgr.getHeightAt(x1, z0)
  const h01 = chunkMgr.getHeightAt(x0, z1)
  const h11 = chunkMgr.getHeightAt(x1, z1)
  const surface = (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz

  // Entity center: feet (at maxSurface) + half body height
  const targetY = surface + HALF_HEIGHT

  const currentY = player.transform.position.y
  const diff = targetY - currentY

  // Within tolerance: snap exactly to avoid floating slightly above ground
  if (Math.abs(diff) < HEIGHT_TOLERANCE) {
    player.transform.position.y = targetY
    return
  }

  // Smooth climb, fast responsive fall - never overshoot below terrain
  const speed = diff > 0 ? MAX_CLIMB_SPEED : MAX_FALL_SPEED
  const step = speed * dt

  if (diff > 0) {
    player.transform.position.y = Math.min(targetY, currentY + step)
  } else {
    player.transform.position.y = Math.max(targetY, currentY - step)
  }
}

/** Player eye height above the feet origin, exposed for the render layer. */
export const PLAYER_EYE_HEIGHT = 1.6

/** Player cube half-height (center-to-feet), actual entity height is 1.8. */
export const PLAYER_HALF_HEIGHT = HALF_HEIGHT
