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
import type { ChunkCoordinate } from './types/world'
import type { PlayerState } from './types/player'
import { initRender, renderFrame } from './render/canvas'

/** Simulation timestep (60 Hz). */
const FIXED_DT = 1 / 60

/** Player movement speed (world units per second). */
const MOVE_SPEED = 8

/** Player yaw rotation speed (radians per second). */
const LOOK_SPEED = Math.PI

/** Held keys (lowercase). */
const keys = new Set<string>()

/** Singleton simulation manager. */
let chunkManager!: ChunkManager

/** Singleton render controller. */
let cameraController!: ReturnType<typeof initRender>

/** Current player state. */
let player!: PlayerState

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
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    },
    cameraMode: 'first-person',
  }
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

window.addEventListener('keydown', (e: KeyboardEvent): void => {
  keys.add(e.key.toLowerCase())

  // Camera view switching: 1 = first-person, 2 = third-person, 3 = isometric
  if (e.key === '1') {
    player.cameraMode = 'first-person'
    cameraController.setMode('first-person')
    e.preventDefault()
  } else if (e.key === '2') {
    player.cameraMode = 'third-person'
    cameraController.setMode('third-person')
    e.preventDefault()
  } else if (e.key === '3') {
    player.cameraMode = 'isometric'
    cameraController.setMode('isometric')
    e.preventDefault()
  }

  // Prevent scrolling with arrow keys
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault()
  }
})

window.addEventListener('keyup', (e: KeyboardEvent): void => {
  keys.delete(e.key.toLowerCase())
})

// ---------------------------------------------------------------------------
// Fixed-step simulation update (60 Hz)
// ---------------------------------------------------------------------------

function updatePlayer(dt: number): void {
  const yaw = player.transform.rotation.y
  const speed = MOVE_SPEED * dt
  const sinY = Math.sin(yaw)
  const cosY = Math.cos(yaw)

  // WASD / Arrow keys for forward/backward/strafe
  if (keys.has('w') || keys.has('arrowup')) {
    player.transform.position.x += sinY * speed
    player.transform.position.z += cosY * speed
  }
  if (keys.has('s') || keys.has('arrowdown')) {
    player.transform.position.x -= sinY * speed
    player.transform.position.z -= cosY * speed
  }
  if (keys.has('a') || keys.has('arrowleft')) {
    player.transform.position.x -= cosY * speed
    player.transform.position.z += sinY * speed
  }
  if (keys.has('d') || keys.has('arrowright')) {
    player.transform.position.x += cosY * speed
    player.transform.position.z -= sinY * speed
  }

  // Q / E for yaw
  if (keys.has('q')) player.transform.rotation.y -= LOOK_SPEED * dt
  if (keys.has('e')) player.transform.rotation.y += LOOK_SPEED * dt
}

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
// Fixed-timestep game loop
// ---------------------------------------------------------------------------

let accumulator = 0
let lastTime = 0

function gameLoopTick(nowMs: number): void {
  const nowSec = nowMs / 1000
  const elapsed = nowSec - lastTime
  lastTime = nowSec

  // Clamp to prevent spiral-of-death after tab switches
  const clamped = Math.min(elapsed, 0.25)
  accumulator += clamped

  // Drain fixed steps
  while (accumulator >= FIXED_DT) {
    updatePlayer(FIXED_DT)
    updateChunks()
    accumulator -= FIXED_DT
  }

  // Render every frame with latest state
  renderFrame(player)

  requestAnimationFrame(gameLoopTick)
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

  // 3. Render - mount WebGL canvas into #app
  const app = document.getElementById('app')
  if (app === null) throw new Error('No #app element found in DOM')
  cameraController = initRender(app)
  cameraController.setMode(player.cameraMode)

  // 4. Kick off loop
  lastTime = performance.now()
  requestAnimationFrame(gameLoopTick)
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
