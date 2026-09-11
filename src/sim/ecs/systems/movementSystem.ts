/**
 * Movement system for entities with TransformComponent and CollisionComponent.
 *
 * Applies velocity vectors to entity transforms, running them through the
 * CollisionResolver for collision detection and response.
 *
 * Architecture: lives in /src/sim/ecs/systems/; imports only from /src/types/
 * and /src/sim/physics/. Zero Three.js, Babylon.js, or DOM imports.
 */

import type { Entity, TransformComponent, CollisionComponent } from '../../../types/ecs';
import type { Vector3D, WorldChunk } from '../../../types/world';
import { CollisionResolver } from '../../../sim/physics/collision';

/**
 * Movement system updates entity transforms based on velocity and collision state.
 * Iterates entities with both TransformComponent and CollisionComponent.
 */
export class MovementSystem {
  private resolver: CollisionResolver;

  constructor() {
    this.resolver = new CollisionResolver();
  }

  /**
   * Update all entities with TransformComponent and CollisionComponent.
   * Applies velocity to position and resolves collisions.
   *
   * @param dt Delta time in seconds.
   * @param entities Array of entity IDs to update.
   * @param transforms Map of entity ID to TransformComponent.
   * @param collisions Map of entity ID to CollisionComponent.
   * @param chunks Active world chunks for collision detection.
   */
  update(
    dt: number,
    entities: Entity[],
    transforms: Map<Entity, TransformComponent>,
    collisions: Map<Entity, CollisionComponent>,
    chunks: WorldChunk[],
  ): void {
    for (const entity of entities) {
      const transform = transforms.get(entity);
      const collision = collisions.get(entity);

      if (!transform || !collision) continue;
      if (!collision.isSolid) continue;

      // Calculate movement delta from velocity
      const delta: Vector3D = {
        x: transform.velocity.x * dt,
        y: transform.velocity.y * dt,
        z: transform.velocity.z * dt,
      };

      // Skip if no movement
      if (delta.x === 0 && delta.y === 0 && delta.z === 0) continue;

      // Resolve movement through collision system
      const resolved = this.resolver.resolveMovement(transform.position, delta, chunks);

      // Apply resolved position
      transform.position = resolved;
    }
  }
}
