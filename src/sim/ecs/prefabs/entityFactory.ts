/**
 * Entity Factory - creates pre-configured game entities (prefabs).
 *
 * Provides helper methods for spawning common entity types with
 * appropriate ECS components attached. All methods return the
 * entity ID for further manipulation.
 *
 * Architecture: lives in /src/sim/ecs/prefabs/; imports only from /src/types/.
 * Zero Three.js, Babylon.js, or DOM imports.
 */

import type { Entity, TransformComponent, RenderableComponent, CollisionComponent, HealthComponent } from '../../../types/ecs';
import type { AABB } from '../../../types/physics';
import { EntityManager } from '../entityManager';

// ---------------------------------------------------------------------------
// Default dimensions for entity types
// ---------------------------------------------------------------------------

/** Default enemy body dimensions (humanoid). */
const ENEMY_HALF_WIDTH = 0.3;
const ENEMY_HALF_HEIGHT = 0.9;
const ENEMY_HALF_DEPTH = 0.3;

/** Default resource node dimensions (crystal/rock). */
const RESOURCE_HALF_WIDTH = 0.4;
const RESOURCE_HALF_HEIGHT = 0.5;
const RESOURCE_HALF_DEPTH = 0.4;

/** Default item drop dimensions (small pickup). */
const ITEM_SCALE = { x: 0.25, y: 0.25, z: 0.25 };
// ---------------------------------------------------------------------------
// Entity Factory
// ---------------------------------------------------------------------------

/**
 * Factory class for creating pre-configured game entities.
 * Wraps EntityManager to provide type-safe prefab instantiation.
 */
export class EntityFactory {
  private entityManager: EntityManager;

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  /**
   * Create an enemy entity at the given position.
   * Attaches Transform, Renderable ('enemy'), Collision, and Health components.
   *
   * @param position - [x, y, z] world position
   * @param health - Optional health value (default: 100)
   * @returns The created entity ID
   */
  createEnemy(position: [number, number, number], health: number = 100): Entity {
    const entity = this.entityManager.createEntity();

    const transform: TransformComponent = {
      position: { x: position[0], y: position[1], z: position[2] },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    };
    this.entityManager.addComponent(entity, 'Transform', transform);

    const renderable: RenderableComponent = {
      meshTypeId: 'enemy',
      scale: { x: ENEMY_HALF_WIDTH * 2, y: ENEMY_HALF_HEIGHT * 2, z: ENEMY_HALF_DEPTH * 2 },
      visible: true,
    };
    this.entityManager.addComponent(entity, 'Renderable', renderable);

    const collision: CollisionComponent = {
      boundingBox: this.createAABB(position, ENEMY_HALF_WIDTH, ENEMY_HALF_HEIGHT, ENEMY_HALF_DEPTH),
      isSolid: true,
    };
    this.entityManager.addComponent(entity, 'Collision', collision);

    const healthComponent: HealthComponent = {
      current: health,
      max: health,
    };
    this.entityManager.addComponent(entity, 'Health', healthComponent);

    return entity;
  }

  /**
   * Create a resource node entity at the given position.
   * Attaches Transform, Renderable ('resource'), and Collision components.
   *
   * @param position - [x, y, z] world position
   * @param resourceType - Type identifier for the resource (e.g., 'crystal', 'wood')
   * @returns The created entity ID
   */
  createResourceNode(position: [number, number, number], _resourceType: string): Entity {
    const entity = this.entityManager.createEntity();

    const transform: TransformComponent = {
      position: { x: position[0], y: position[1], z: position[2] },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    };
    this.entityManager.addComponent(entity, 'Transform', transform);

    const renderable: RenderableComponent = {
      meshTypeId: 'resource',
      scale: { x: RESOURCE_HALF_WIDTH * 2, y: RESOURCE_HALF_HEIGHT * 2, z: RESOURCE_HALF_DEPTH * 2 },
      visible: true,
    };
    this.entityManager.addComponent(entity, 'Renderable', renderable);

    const collision: CollisionComponent = {
      boundingBox: this.createAABB(position, RESOURCE_HALF_WIDTH, RESOURCE_HALF_HEIGHT, RESOURCE_HALF_DEPTH),
      isSolid: true,
    };
    this.entityManager.addComponent(entity, 'Collision', collision);

    return entity;
  }

  /**
   * Create an item drop entity at the given position.
   * Attaches Transform and Renderable ('item') components.
   *
   * @param position - [x, y, z] world position
   * @param itemId - Unique identifier for the item type
   * @returns The created entity ID
   */
  createItemDrop(position: [number, number, number], _itemId: string): Entity {
    const entity = this.entityManager.createEntity();

    const transform: TransformComponent = {
      position: { x: position[0], y: position[1], z: position[2] },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    };
    this.entityManager.addComponent(entity, 'Transform', transform);

    const renderable: RenderableComponent = {
      meshTypeId: 'item',
      scale: { ...ITEM_SCALE },
      visible: true,
    };
    this.entityManager.addComponent(entity, 'Renderable', renderable);

    return entity;
  }

  /**
   * Helper: create an AABB from center position and half-extents.
   */
  private createAABB(
    position: [number, number, number],
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
  ): AABB {
    return {
      min: {
        x: position[0] - halfWidth,
        y: position[1] - halfHeight,
        z: position[2] - halfDepth,
      },
      max: {
        x: position[0] + halfWidth,
        y: position[1] + halfHeight,
        z: position[2] + halfDepth,
      },
    };
  }
}

