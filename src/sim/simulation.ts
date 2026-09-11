/**
 * Simulation orchestrator - manages system execution order per tick.
 *
 * Wires together SpatialHashGrid, MovementSystem, InteractionSystem,
 * and HealthSystem in deterministic order. Keeps main.ts thin and
 * ensures /src/sim/ remains pure (no Three.js/DOM).
 *
 * Architecture: lives in /src/sim/; imports only from /src/types/ and /src/sim/.
 */

import type { Entity, TransformComponent } from '../types/ecs';
import type { WorldChunk } from '../types/world';
import { EntityManager } from './ecs/entityManager';
import { SpatialHashGrid } from './physics/spatialHashGrid';
import { MovementSystem } from './ecs/systems/movementSystem';
import { InteractionSystem, ItemPickupEvent } from './systems/interactionSystem';
import { HealthSystem, DeathEvent } from './systems/healthSystem';

/**
 * Callbacks for simulation events.
 */
export interface SimulationEvents {
  onItemPickup?: (event: ItemPickupEvent) => void;
  onDeath?: (event: DeathEvent) => void;
}

/**
 * Simulation class manages all game systems and their update order.
 */
export class Simulation {
  readonly entityManager: EntityManager;
  readonly spatialGrid: SpatialHashGrid;
  readonly interactionSystem: InteractionSystem;
  readonly healthSystem: HealthSystem;
  private movementSystem: MovementSystem;
  private playerEntity: Entity | null = null;
  private chunks: WorldChunk[] = [];

  constructor(cellSize: number = 8.0) {
    this.entityManager = new EntityManager();
    this.spatialGrid = new SpatialHashGrid(cellSize);
    this.movementSystem = new MovementSystem();
    this.interactionSystem = new InteractionSystem(this.entityManager, this.spatialGrid);
    this.healthSystem = new HealthSystem(this.entityManager);
  }

  /**
   * Register event listeners for simulation events.
   */
  on(events: SimulationEvents): void {
    if (events.onItemPickup) {
      this.interactionSystem.onItemPickup(events.onItemPickup);
    }
    if (events.onDeath) {
      this.healthSystem.onDeath(events.onDeath);
    }
  }

  /**
   * Set the player entity for interaction queries.
   */
  setPlayerEntity(entity: Entity): void {
    this.playerEntity = entity;
  }

  /**
   * Get the player entity ID.
   */
  getPlayerEntity(): Entity | null {
    return this.playerEntity;
  }

  /**
   * Update active chunks reference for collision and spatial queries.
   */
  setChunks(chunks: WorldChunk[]): void {
    this.chunks = chunks;
  }

  /**
   * Run one simulation tick. Systems execute in deterministic order:
   * 1. Rebuild spatial grid from current entity positions
   * 2. Run movement/physics
   * 3. Process interactions (item pickups)
   * 4. Process health/damage and death cleanup
   */
  update(dt: number): void {
    this.rebuildSpatialGrid();
    this.runMovement(dt);
    this.runInteractions();
    this.runHealthCleanup();
  }

  /**
   * Clear and re-populate spatial grid with all entities that have transforms.
   */
  private rebuildSpatialGrid(): void {
    this.spatialGrid.clear();

    const entities = this.entityManager.queryEntities(['Transform']);
    for (const entity of entities) {
      const transform = this.entityManager.getComponent<TransformComponent>(entity, 'Transform');
      if (!transform) continue;

      const pos: [number, number, number] = [
        transform.position.x,
        transform.position.y,
        transform.position.z,
      ];

      // Use entity bounding radius if collision component exists
      const collision = this.entityManager.getComponent<{ boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } }>(entity, 'Collision');
      let radius: number | undefined;
      if (collision) {
        const hw = (collision.boundingBox.max.x - collision.boundingBox.min.x) / 2;
        radius = hw;
      }

      this.spatialGrid.insert(entity, pos, radius);
    }
  }

  /**
   * Run movement system for entities with Transform + Collision.
   */
  private runMovement(dt: number): void {
    const entities = this.entityManager.queryEntities(['Transform', 'Collision']);
    const transforms = new Map<Entity, TransformComponent>();
    const collisions = new Map<Entity, { boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }; isSolid: boolean }>();

    for (const entity of entities) {
      const transform = this.entityManager.getComponent<TransformComponent>(entity, 'Transform');
      const collision = this.entityManager.getComponent<{ boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }; isSolid: boolean }>(entity, 'Collision');
      if (transform && collision) {
        transforms.set(entity, transform);
        collisions.set(entity, collision);
      }
    }

    this.movementSystem.update(dt, entities, transforms, collisions, this.chunks);
  }

  /**
   * Run interaction system for player proximity checks.
   */
  private runInteractions(): void {
    if (this.playerEntity !== null) {
      this.interactionSystem.update(this.playerEntity);
    }
  }

  /**
   * Run health system cleanup - process any pending death events.
   * Death is already handled synchronously in HealthSystem.damage(),
   * so this is a no-op hook for future async health processing.
   */
  private runHealthCleanup(): void {
    // Death cleanup is synchronous in HealthSystem.
    // This hook exists for future async health effects (poison, regen).
  }
}
