/**
 * Upheaval - main entry point.
 *
 * Thin integration glue between simulation (/src/sim/) and rendering
 * (/src/render/). Neither sub-system imports from this file, keeping the
 * architectural boundary intact.
 *
 * Fixed-timestep simulation loop (60 Hz) driving the WebGL render pipeline.
 */

import { ChunkManager } from './sim/world/chunkManager'
import { Simulation } from './sim/simulation'
import { EntityRenderer } from './render/entityRenderer'
import { ChunkRenderer } from './render/chunkRenderer'
import { createPlayerEntity, syncPlayerEntity } from './sim/player'
import { initInput, updatePlayerMovement } from './sim/playerController'
import { snapPlayerToGround } from './sim/terrainFollow'
import type { Entity } from './types/ecs'
import type { ChunkCoordinate } from './types/world'
import type { PlayerState } from './types/player'
import { initRender, renderFrame, scene } from './render/canvas'
import { selectionBox } from './render/selectionBox'
import { updateTargetTile } from './render/targetTile'
import { HUDManager } from './render/ui/hudManager'

/** Simulation timestep (60 Hz) in milliseconds. */
const FIXED_DT_MS = 1000 / 60
/** Active chunk radius for the world render window. */
const CHUNK_RENDER_RADIUS = 5

/** Singleton simulation manager. */
let chunkManager!: ChunkManager

/** Singleton render controller. */
let cameraController!: ReturnType<typeof initRender>

/** Current player state. */
let player!: PlayerState

/** Simulation orchestrator. */
let simulation!: Simulation

/** Entity Renderer for syncing ECS entities to Three.js meshes. */
let entityRenderer!: EntityRenderer

/** Chunk Renderer for terrain meshes. */
let chunkRenderer!: ChunkRenderer

/** Player entity ID in ECS. */
let playerEntity!: Entity

/** HUD Manager for UI overlays. */
let hudManager!: HUDManager

// ---------------------------------------------------------------------------
// Initial state construction
// ---------------------------------------------------------------------------

function createInitialPlayer(): PlayerState {
  return {
    id: 'player-001',
    name: 'Survivor',
    health: 100,
    maxHealth: 100,
    bodyPartHealth: {
      head: 100, torso: 100, leftArm: 100, rightArm: 100, leftLeg: 100, rightLeg: 100,
    },
    bodyPartMaxHealth: {
      head: 100, torso: 100, leftArm: 100, rightArm: 100, leftLeg: 100, rightLeg: 100,
    },
    inventory: { items: [], capacity: 100 },
    transform: {
      position: { x: 100, y: 0, z: 100 },
      rotation: { x: 0, y: 0, z: 0 },
    },
    cameraMode: 'isometric',
  }
}

// ---------------------------------------------------------------------------
// Fixed-step simulation update (60 Hz)
// ---------------------------------------------------------------------------

function updateChunks(): void {
  const pos = player.transform.position
  const center: ChunkCoordinate = {
    x: Math.floor(pos.x / 16),
    y: Math.floor(pos.y / 16),
    z: Math.floor(pos.z / 16),
  }
  chunkManager.updateActiveChunks(center, 4)
}

// ---------------------------------------------------------------------------
// Target tile raycasting (updated every render frame)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

let lastTime = 0;
let accumulator = 0;

function gameLoopTick(now: number): void {
  requestAnimationFrame(gameLoopTick);

  // Convert to milliseconds and compute elapsed
  const elapsed = now - lastTime;
  lastTime = now;

  // Clamp to prevent spiral-of-death after tab switches
  const clamped = Math.min(elapsed, 250)
  accumulator += clamped

  // Drain fixed steps
  while (accumulator >= FIXED_DT_MS) {
    updatePlayerMovement(player, FIXED_DT_MS / 1000)
    snapPlayerToGround(player, chunkManager, FIXED_DT_MS / 1000)
    syncPlayerEntity(simulation, playerEntity, player)
    updateChunks()
    simulation.setChunks(chunkManager.getActiveChunks())
    simulation.update(FIXED_DT_MS / 1000)
    accumulator -= FIXED_DT_MS
  }


  // Sync HUD health display
  hudManager.updateHealth(player.health, player.maxHealth)

  // Update chunk terrain meshes
const chunks = chunkManager.getActiveChunks();
  const maps = chunks.map((ch) => chunkManager.getHeightmap(ch.coordinate)!);
  const neighs = chunks.map((ch) => ({ ...ch.coordinate, y: 0 })).map(getNeighbors);
  chunkRenderer.updateAllChunks(chunks, maps, neighs)

  // Update target tile via raycast
  updateTargetTile(player, chunkManager, selectionBox)

  // Update entity renderer (sync ECS entities to meshes)
  entityRenderer.update()

  // Render every frame with latest state
  renderFrame(player)

}

// ---------------------------------------------------------------------------
// Camera switching
// ---------------------------------------------------------------------------

function initCameraSwitching(): void {
  window.addEventListener('keydown', (e: KeyboardEvent): void => {
    if (e.key === '1') {
      player.cameraMode = 'first-person'
      cameraController.setMode('first-person')
    } else if (e.key === '2') {
      player.cameraMode = 'third-person'
      cameraController.setMode('third-person')
    } else if (e.key === '3') {
      player.cameraMode = 'isometric'
      cameraController.setMode('isometric')
    }
  })
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/** Get all 8 neighbor heightmaps for seamless chunk edges (null when absent). */
function getNeighbors(coord: { x: number; y: number; z: number }) {
  return {
    nw: chunkManager.getNeighborHeightmap(coord, -1, -1) ?? null,
    n:  chunkManager.getNeighborHeightmap(coord, 0, -1) ?? null,
    ne: chunkManager.getNeighborHeightmap(coord, 1, -1) ?? null,
    w:  chunkManager.getNeighborHeightmap(coord, -1, 0) ?? null,
    e:  chunkManager.getNeighborHeightmap(coord, 1, 0) ?? null,
    sw: chunkManager.getNeighborHeightmap(coord, -1, 1) ?? null,
    s:  chunkManager.getNeighborHeightmap(coord, 0, 1) ?? null,
    se: chunkManager.getNeighborHeightmap(coord, 1, 1) ?? null,
  };
}

function init(): void {
  // 1. Simulation - initialise chunk manager and populate starter chunks
  chunkManager = new ChunkManager(42)
  chunkManager.updateActiveChunks({ x: 0, y: 0, z: 0 }, CHUNK_RENDER_RADIUS)

  // 2. Player state
  player = createInitialPlayer()

  // 3. Snap player to terrain surface at start
  snapPlayerToGround(player, chunkManager, FIXED_DT_MS / 1000)

  // 5. Simulation orchestrator (owns EntityManager, SpatialHashGrid, systems)
  simulation = new Simulation(8.0)

  // 6. Create player entity in ECS with Transform component
  playerEntity = createPlayerEntity(simulation, player)

  // 7. Initialize input handling
  initInput()
  initCameraSwitching()

  // 8. Initialize HUD and register event handlers
  hudManager = new HUDManager()
  hudManager.updateHealth(player.health, player.maxHealth)

  simulation.on({
    onItemPickup: (event) => {
      hudManager.showPickupNotification(event.itemId)
    },
    onDeath: (event) => {
      hudManager.showDeathNotification(`Entity ${event.entity}`)
    },
  })

  // 9. Render - mount WebGL canvas into #app
  const app = document.getElementById('app')
  if (app === null) throw new Error('No #app element found in DOM')
  cameraController = initRender(app)
  cameraController.setMode(player.cameraMode)

  // 10. Entity Renderer (uses Simulation's EntityManager)
  entityRenderer = new EntityRenderer(simulation.entityManager, scene)

  // 11. Chunk Renderer - create terrain meshes
  chunkRenderer = new ChunkRenderer(scene)
  const initialChunks = chunkManager.getActiveChunks()
  for (const chunk of initialChunks) {
    chunkRenderer.updateChunkMesh(chunk, chunkManager.getHeightmap(chunk.coordinate)!, getNeighbors({ ...chunk.coordinate, y: 0 }))
  }

  // Add selection box to scene
  scene.add(selectionBox.meshRef)


  // 12. Kick off loop
  lastTime = performance.now()
  requestAnimationFrame(gameLoopTick)
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
