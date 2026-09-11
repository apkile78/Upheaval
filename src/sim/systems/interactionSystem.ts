/**
 * Interaction System - handles player interaction with nearby entities.
 *
 * Uses SpatialHashGrid for O(1) broad-phase proximity queries.
 * Processes item pickups when player overlaps collectible entities.
 *
 * Architecture: lives in /src/sim/systems/; imports from /src/types/ and /src/sim/.
 * Zero Three.js, Babylon.js, or DOM imports.
 */

import type { Entity } from '../../types/ecs';
import type { TransformComponent, RenderableComponent } from '../../types/ecs';
import { EntityManager } from '../ecs/entityManager';
import { SpatialHashGrid } from '../physics/spatialHashGrid';

// ---------------------------------------------------------------------------
// Interaction events
// ---------------------------------------------------------------------------

/**
 * Represents an item collection event emitted by the interaction system.
 * Can be consumed by inventory, audio, or other game systems.
 */
export interface ItemPickupEvent {
  itemId: string;
  pickerEntity: Entity;
  itemEntity: Entity;
  position: [number, number, number];
}

/**
 * Callback type for item pickup events.
 */
export type ItemPickupCallback = (event: ItemPickupEvent) => void;

// ---------------------------------------------------------------------------
// Interaction System
// ---------------------------------------------------------------------------

/**
 * Default trigger radius for item pickup proximity checks.
 */
const DEFAULT_PICKUP_RADIUS = 1.5;

/**
 * Handles player-entity interactions including item collection.
 */
export class InteractionSystem {
  private entityManager: EntityManager;
  private spatialGrid: SpatialHashGrid;
  private pickupRadius: number;
  private pickupCallbacks: ItemPickupCallback[] = [];

  constructor(
    entityManager: EntityManager,
    spatialGrid: SpatialHashGrid,
    pickupRadius: number = DEFAULT_PICKUP_RADIUS,
  ) {
    this.entityManager = entityManager;
    this.spatialGrid = spatialGrid;
    this.pickupRadius = pickupRadius;
  }

  /**
   * Register a callback for item pickup events.
   * @param callback - Function called when an item is picked up
   */
  onItemPickup(callback: ItemPickupCallback): void {
    this.pickupCallbacks.push(callback);
  }

  /**
   * Process interactions for a given player entity.
   * Queries nearby entities via spatial grid and processes pickups.
   *
   * @param playerEntity - The player entity ID
   */
  update(playerEntity: Entity): void {
    const playerTransform = this.entityManager.getComponent<TransformComponent>(playerEntity, 'Transform');
    if (!playerTransform) return;

    const playerPos: [number, number, number] = [
      playerTransform.position.x,
      playerTransform.position.y,
      playerTransform.position.z,
    ];

    // Query nearby entities using spatial hash grid
    const nearby = this.spatialGrid.queryRadius(playerPos, this.pickupRadius);

    for (const entry of nearby) {
      // Skip the player entity itself
      if (entry.entity === playerEntity) continue;

      // Check if this is a collectible item
      if (this.isCollectibleItem(entry.entity)) {
        this.processItemPickup(playerEntity, entry.entity, entry.position);
      }
    }
  }

  /**
   * Check if an entity is a collectible item (has Renderable with 'item' mesh type).
   */
  private isCollectibleItem(entity: Entity): boolean {
    const renderable = this.entityManager.getComponent<RenderableComponent>(entity, 'Renderable');
    return renderable !== undefined && renderable.meshTypeId === 'item' && renderable.visible;
  }

  /**
   * Process an item pickup: emit event and destroy the item entity.
   */
  private processItemPickup(pickerEntity: Entity, itemEntity: Entity, position: [number, number, number]): void {
    // Get item identifier from entity (using entity ID as fallback)
    const itemId = `item_${itemEntity}`;

    // Emit pickup event to registered callbacks
    const event: ItemPickupEvent = {
      itemId,
      pickerEntity,
      itemEntity,
      position: [...position],
    };

    for (const callback of this.pickupCallbacks) {
      callback(event);
    }

    // Mark item for destruction via ECS
    this.entityManager.destroyEntity(itemEntity);

    // Also remove from spatial grid
    this.spatialGrid.remove(itemEntity);
  }
}
