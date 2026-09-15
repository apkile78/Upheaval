/**
 * Player input controller - handles keyboard input and movement.
 *
 * Captures key state and applies movement/look to PlayerState.
 * Bridges raw input to the simulation without render dependencies.
 *
 * Architecture: lives in /src/sim/; imports only from /src/types/.
 * Zero Three.js, Babylon.js, or DOM imports (window events are browser APIs, not render).
 */

import type { PlayerState } from '../types/player';
import { latLonToWorld } from './world/earth/earthProjection';
import {
  HIGH_ELEVATION_TEST_HEIGHT,
  HIGH_ELEVATION_TEST_LAT,
  HIGH_ELEVATION_TEST_LON,
} from './world/earth/earthConfig';

// ---------------------------------------------------------------------------
// Input state
// ---------------------------------------------------------------------------

const keys = new Set<string>();
let controlledPlayer: PlayerState | null = null;
let terrainTeleportPending = false;

/** Movement speed in world units per second. */
const MOVE_SPEED = 8;

/** Look rotation speed in radians per second. */
const LOOK_SPEED = Math.PI;

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

/**
 * Initialize keyboard input listeners.
 */
export function initInput(player: PlayerState): void {
  controlledPlayer = player;
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
}

function handleKeyDown(e: KeyboardEvent): void {
  keys.add(e.key.toLowerCase());

  // Camera view switching: 1 = first-person, 2 = third-person
  if (e.key === '1' || e.key === '2') {
    e.preventDefault();
  }

  if (e.key.toLowerCase() === 't' && controlledPlayer !== null) {
    teleportToHighElevation(controlledPlayer);
    e.preventDefault();
  }

  // Prevent scrolling with arrow keys
  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
  }
}

/** Move the player to the shipped high-elevation Earth test location. */
export function teleportToHighElevation(player: PlayerState): void {
  const destination = latLonToWorld(HIGH_ELEVATION_TEST_LAT, HIGH_ELEVATION_TEST_LON);
  player.transform.position.x = destination.x;
  player.transform.position.y = HIGH_ELEVATION_TEST_HEIGHT + 0.9;
  player.transform.position.z = destination.z;
  terrainTeleportPending = true;
}

export function consumeTerrainTeleportPending(): boolean {
  const pending = terrainTeleportPending;
  terrainTeleportPending = false;
  return pending;
}

function handleKeyUp(e: KeyboardEvent): void {
  keys.delete(e.key.toLowerCase());
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/**
 * Update player movement based on current key state.
 */
export function updatePlayerMovement(
  player: PlayerState,
  dt: number,
): void {
  const forward = keys.has('w') || keys.has('arrowup');
  const backward = keys.has('s') || keys.has('arrowdown');
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  const lookLeft = keys.has('q');
  const lookRight = keys.has('e');
  const jump = keys.has(' ');
  const crouch = keys.has('shift');

  // Rotation
  if (lookLeft) player.transform.rotation.y += LOOK_SPEED * dt;
  if (lookRight) player.transform.rotation.y -= LOOK_SPEED * dt;

  // Movement direction from yaw
  const yaw = player.transform.rotation.y;
  let dx = 0;
  let dz = 0;
  if (forward) { dx += Math.sin(yaw); dz += Math.cos(yaw); }
  if (backward) { dx -= Math.sin(yaw); dz -= Math.cos(yaw); }
  if (left) { dx += Math.cos(yaw); dz -= Math.sin(yaw); }
  if (right) { dx -= Math.cos(yaw); dz += Math.sin(yaw); }

  // Apply movement directly (terrain following handles surface contact)
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0) {
    player.transform.position.x += (dx / len) * MOVE_SPEED * dt;
    player.transform.position.z += (dz / len) * MOVE_SPEED * dt;
  }

  // Vertical
  if (jump && !crouch) player.transform.position.y += MOVE_SPEED * dt;
  if (crouch) player.transform.position.y -= MOVE_SPEED * dt;
}
