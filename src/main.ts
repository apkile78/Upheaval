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
import { createInitialPlayer, createPlayerEntity, syncPlayerEntity } from './sim/player'
import { initInput, updatePlayerMovement } from './sim/playerController'
import { snapPlayerToGround } from './sim/terrainFollow'
import { createEarthElevationSource, warmupAround } from './sim/world/earth/elevationLoader'
import { EARTH_SPAWN, EARTH_SPAWN_LAT, EARTH_SPAWN_LON } from './sim/world/earth/earthConfig'
import { WaterPlane } from './render/waterPlane'
import { MacroTerrainManager } from './render/macroTerrain'
import { buildInitialChunkMeshes, chunkCoordAt, syncChunkMeshes } from './render/terrainView'
import { updateFrameAnchor } from './render/frameAnchor'
import type { Entity } from './types/ecs'
import type { PlayerState } from './types/player'
import { initRender, renderFrame, scene } from './render/canvas'
import { initCameraSwitching } from './render/cameraSwitching'
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

/** Macro terrain manager for the distance LOD shell. */
let macroTerrain!: MacroTerrainManager

/** Sea-level water plane (oceans over real bathymetry). */
let waterPlane!: WaterPlane

/** Player entity ID in ECS. */
let playerEntity!: Entity

/** HUD Manager for UI overlays. */
let hudManager!: HUDManager

// ---------------------------------------------------------------------------
// Fixed-step simulation update (60 Hz)
// ---------------------------------------------------------------------------

function updateChunks(): void {
  const pos = player.transform.position
  chunkManager.updateActiveChunks(chunkCoordAt(pos.x, pos.y, pos.z), VOXEL_RENDER_RADIUS)
}

/** Sim-chunk render radius (voxel layers stay close; the macro shell covers distance). */
const VOXEL_RENDER_RADIUS = 6

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

  // Rebase the shared render-space frame anchor to the player before any
  // anchor-relative mesh updates below.
  updateFrameAnchor(player.transform.position.x, player.transform.position.z)

  // Update chunk terrain meshes, then re-seat them on the current anchor.
  syncChunkMeshes(chunkManager, chunkRenderer)
  chunkRenderer.syncAnchor()

  // Update the distant-terrain LOD shell around the player (fills everything
  // outside the voxel box out to ~3.6 km).
  macroTerrain.update(player.transform.position.x, player.transform.position.z)

  // Update target tile via raycast
  updateTargetTile(player, chunkManager, selectionBox)

  // Sea-level water plane follows the player
  const surfaceUnderPlayer = chunkManager.getHeightAt(player.transform.position.x, player.transform.position.z)
  waterPlane.update(player.transform.position.x, player.transform.position.z, surfaceUnderPlayer <= 3)

  // Update entity renderer (sync ECS entities to meshes)
  entityRenderer.update()

  // Render every frame with latest state
  renderFrame(player)

}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  // 1. Real-Earth elevation source (tiled ETOPO 2022 assets, worker-decoded)
  const earthSource = await createEarthElevationSource()
  await warmupAround(earthSource, EARTH_SPAWN_LAT, EARTH_SPAWN_LON)

  // 2. Simulation - chunk manager over real terrain, starter chunks at spawn
  chunkManager = new ChunkManager(earthSource)
  chunkManager.updateActiveChunks(chunkCoordAt(EARTH_SPAWN.x, 0, EARTH_SPAWN.z), CHUNK_RENDER_RADIUS)

  // 3. Player state
  player = createInitialPlayer()

  // The frame anchor starts at spawn so the initial meshes below already sit
  // in correct render-space coordinates.
  updateFrameAnchor(player.transform.position.x, player.transform.position.z)

  // 4. Snap player to terrain surface at start
  snapPlayerToGround(player, chunkManager, FIXED_DT_MS / 1000)

  // 5. Simulation orchestrator (owns EntityManager, SpatialHashGrid, systems)
  simulation = new Simulation(8.0)

  // 6. Create player entity in ECS with Transform component
  playerEntity = createPlayerEntity(simulation, player)

  // 7. Initialize input handling
  initInput()

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
  // Camera key bindings need the controller instance to exist, so bind after
  // initRender assigns it.
  initCameraSwitching(cameraController, player)

  // 10. Entity Renderer (uses Simulation's EntityManager)
  entityRenderer = new EntityRenderer(simulation.entityManager, scene)

  // 11. Chunk Renderer - create terrain meshes for the starter chunks
  chunkRenderer = new ChunkRenderer(scene)
  buildInitialChunkMeshes(chunkManager, chunkRenderer)

  // 11b. Distant-terrain LOD shell (anchor-relative macro tiles out to ~3.5 km)
  macroTerrain = new MacroTerrainManager(scene, earthSource)

  // 11b. Sea-level water plane
  waterPlane = new WaterPlane(scene)

  // Add selection box to scene
  scene.add(selectionBox.meshRef)


  // 12. Kick off loop
  lastTime = performance.now()
  requestAnimationFrame(gameLoopTick)
}

// Boot when DOM ready. Elevation assets load asynchronously before the world
// initializes; failures surface in the console.
function boot(): void {
  void init().catch((err: Error) => {
    console.error('Earth terrain init failed:', err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
