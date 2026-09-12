/**
 * Upheaval - main entry point.
 *
 * Thin integration glue between simulation (/src/sim/) and rendering
 * (/src/render/). Neither sub-system imports from this file, keeping the
 * architectural boundary intact.
 *
 * Fixed-timestep simulation loop (60 Hz) driving the WebGL render pipeline.
 */

import { CollisionResolver } from './sim/physics/collision'
import { raycastTiles } from './sim/physics/raycast'
import { ChunkManager } from './sim/world/chunkManager'
import { Simulation } from './sim/simulation'
import { EntityRenderer } from './render/entityRenderer'
import { ChunkRenderer } from './render/chunkRenderer'
import { createPlayerEntity, syncPlayerEntity } from './sim/player'
import { initInput, updatePlayerMovement } from './sim/playerController'
import type { Entity } from './types/ecs'
import type { ChunkCoordinate } from './types/world'
import type { PlayerState } from './types/player'
import { initRender, renderFrame, scene } from './render/canvas'
import { selectionBox } from './render/selectionBox'
import { HUDManager } from './render/ui/hudManager'

/** Simulation timestep (60 Hz) in milliseconds. */
const FIXED_DT_MS = 1000 / 60

/** Singleton simulation manager. */
let chunkManager!: ChunkManager

/** Singleton render controller. */
let cameraController!: ReturnType<typeof initRender>

/** Collision resolver for player movement. */
let collisionResolver!: CollisionResolver

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
      position: { x: 8, y: 2, z: 8 },
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
  chunkManager.updateActiveChunks(center, 2)
}

// ---------------------------------------------------------------------------
// Target tile raycasting (updated every render frame)
// ---------------------------------------------------------------------------

const RAYCAST_MAX_DISTANCE = 50;

function updateTargetTile(): void {
  const pos = player.transform.position;
  const rot = player.transform.rotation;

  const yaw = rot.y;
  const pitch = rot.x;
  const dirX = Math.sin(yaw) * Math.cos(pitch);
  const dirY = Math.sin(pitch);
  const dirZ = Math.cos(yaw) * Math.cos(pitch);

  const ray = {
    origin: { x: pos.x, y: pos.y + 1.6, z: pos.z },
    direction: { x: dirX, y: dirY, z: dirZ },
  };

  const hit = raycastTiles(ray, RAYCAST_MAX_DISTANCE, chunkManager);
  if (hit && hit.hit) {
    selectionBox.updateFromWorldPos(hit.point);
    selectionBox.setVisible(true);
  } else {
    selectionBox.setVisible(false);
  }
}

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
    updatePlayerMovement(player, FIXED_DT_MS / 1000, collisionResolver, chunkManager.getActiveChunks())
    syncPlayerEntity(simulation, playerEntity, player)
    updateChunks()
    simulation.setChunks(chunkManager.getActiveChunks())
    simulation.update(FIXED_DT_MS / 1000)
    accumulator -= FIXED_DT_MS
  }

  // Sync HUD health display
  hudManager.updateHealth(player.health, player.maxHealth)

  // Update chunk terrain meshes
  chunkRenderer.updateAllChunks(chunkManager.getActiveChunks())

  // Update target tile via raycast
  updateTargetTile()

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

function init(): void {
  // 1. Simulation - initialise chunk manager and populate starter chunks
  chunkManager = new ChunkManager(42)
  chunkManager.updateActiveChunks({ x: 0, y: 0, z: 0 }, 2)

  // 2. Player state
  player = createInitialPlayer()

  // 3. Collision resolver
  collisionResolver = new CollisionResolver()

  // 4. Simulation orchestrator (owns EntityManager, SpatialHashGrid, systems)
  simulation = new Simulation(8.0)

  // 5. Create player entity in ECS with Transform component
  playerEntity = createPlayerEntity(simulation, player)

  // 6. Initialize input handling
  initInput()
  initCameraSwitching()

  // 7. Initialize HUD and register event handlers
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

  // 8. Render - mount WebGL canvas into #app
  const app = document.getElementById('app')
  if (app === null) throw new Error('No #app element found in DOM')
  cameraController = initRender(app)
  cameraController.setMode(player.cameraMode)

  // 9. Entity Renderer (uses Simulation's EntityManager)
  entityRenderer = new EntityRenderer(simulation.entityManager, scene)

  // 10. Chunk Renderer - create terrain meshes
  chunkRenderer = new ChunkRenderer(scene)
  const initialChunks = chunkManager.getActiveChunks()
  for (const chunk of initialChunks) {
    chunkRenderer.updateChunkMesh(chunk)
  }

  // Add selection box to scene
  scene.add(selectionBox.meshRef)

  // 11. Kick off loop
  lastTime = performance.now()
  requestAnimationFrame(gameLoopTick)
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
