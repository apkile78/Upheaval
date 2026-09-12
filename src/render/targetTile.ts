/**
 * Target tile raycasting - updates the selection highlight box each frame.
 *
 * Architecture: lives in /src/render/; calls sim raycast + render selection.
 */

import { raycastTiles } from '../sim/physics/raycast'
import type { PlayerState } from '../types/player'
import type { ChunkManager } from '../sim/world/chunkManager'
import { SelectionBox } from './selectionBox'

/** Maximum raycast distance in world units. */
const RAYCAST_MAX_DISTANCE = 50

/**
 * Cast a ray from the player eye position and update the selection box.
 *
 * @param player     - Player state for origin + yaw/pitch.
 * @param chunkMgr   - Chunk manager for tile lookup.
 * @param selection  - Selection box to update.
 */
export function updateTargetTile(
  player: PlayerState,
  chunkMgr: ChunkManager,
  selection: SelectionBox,
): void {
  const pos = player.transform.position
  const rot = player.transform.rotation

  const yaw = rot.y
  const pitch = rot.x
  const dirX = Math.sin(yaw) * Math.cos(pitch)
  const dirY = Math.sin(pitch)
  const dirZ = Math.cos(yaw) * Math.cos(pitch)

  const ray = {
    origin: { x: pos.x, y: pos.y, z: pos.z },
    direction: { x: dirX, y: dirY, z: dirZ },
  }

  const hit = raycastTiles(ray, RAYCAST_MAX_DISTANCE, chunkMgr)
  if (hit && hit.hit) {
    selection.updateFromWorldPos(hit.point)
    selection.setVisible(true)
  } else {
    selection.setVisible(false)
  }
}
