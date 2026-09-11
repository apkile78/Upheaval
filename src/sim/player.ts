/**
 * Player entity management - bridges PlayerState to ECS.
 *
 * Creates and syncs the player entity's Transform component
 * with the main PlayerState each tick.
 *
 * Architecture: lives in /src/sim/; imports only from /src/types/ and /src/sim/.
 * Zero Three.js, Babylon.js, or DOM imports.
 */

import type { Entity, TransformComponent } from '../types/ecs';
import type { PlayerState } from '../types/player';
import type { Simulation } from './simulation';

/**
 * Create the player entity in ECS with a Transform component.
 */
export function createPlayerEntity(simulation: Simulation, player: PlayerState): Entity {
  const entity = simulation.entityManager.createEntity();
  simulation.entityManager.addComponent(entity, 'Transform', {
    position: {
      x: player.transform.position.x,
      y: player.transform.position.y,
      z: player.transform.position.z,
    },
    rotation: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
  });
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
