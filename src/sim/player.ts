/**
 * Player entity management - bridges PlayerState to ECS.
 *
 * Creates and syncs the player entity's Transform component
 * with the main PlayerState each tick.
 *
 * Architecture: lives in /src/sim/; imports only from /src/types/ and /src/sim/.
 * Zero Three.js, Babylon.js, or DOM imports.
 */

import type { Entity, TransformComponent, RenderableComponent } from '../types/ecs';
import type { PlayerState } from '../types/player';
import type { Simulation } from './simulation';
import { EARTH_SPAWN } from './world/earth/earthConfig';

/** Body parts with full health (shared by the initial state factory). */
const FULL_HEALTH_PARTS = {
  head: 100, torso: 100, leftArm: 100, rightArm: 100, leftLeg: 100, rightLeg: 100,
};

/**
 * Create the initial player state, spawned at the configured Earth location
 * (real-world latitude/longitude, 1 game unit = 1 meter). Y is resolved by
 * the terrain-follow physics on the first tick.
 */
export function createInitialPlayer(): PlayerState {
  return {
    id: 'player-001',
    name: 'Survivor',
    health: 100,
    maxHealth: 100,
    bodyPartHealth: { ...FULL_HEALTH_PARTS },
    bodyPartMaxHealth: { ...FULL_HEALTH_PARTS },
    inventory: { items: [], capacity: 100 },
    transform: {
      position: { x: EARTH_SPAWN.x, y: 0, z: EARTH_SPAWN.z },
      rotation: { x: 0, y: 0, z: 0 },
    },
    cameraMode: 'third-person',
  };
}

/**
 * Create the player entity in ECS with Transform + Renderable components.
 */
export function createPlayerEntity(simulation: Simulation, player: PlayerState): Entity {
  const entity = simulation.entityManager.createEntity();
  
  const transform: TransformComponent = {
    position: {
      x: player.transform.position.x,
      y: player.transform.position.y,
      z: player.transform.position.z,
    },
    rotation: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
  };
  simulation.entityManager.addComponent(entity, 'Transform', transform);
  
  const renderable: RenderableComponent = {
    meshTypeId: 'enemy',
    scale: { x: 0.6, y: 1.8, z: 0.6 },
    visible: true,
  };
  simulation.entityManager.addComponent(entity, 'Renderable', renderable);
  
  simulation.setPlayerEntity(entity);
  return entity;
}

/**
 * Sync player ECS transform from player state.
 */
export function syncPlayerEntity(simulation: Simulation, playerEntity: Entity, player: PlayerState): void {
  const transform = simulation.entityManager.getComponent<TransformComponent>(playerEntity, 'Transform');
  if (transform) {
    transform.position.x = player.transform.position.x;
    transform.position.y = player.transform.position.y;
    transform.position.z = player.transform.position.z;
    transform.rotation.y = player.transform.rotation.y;
    transform.rotation.x = player.transform.rotation.x;
  }
}
