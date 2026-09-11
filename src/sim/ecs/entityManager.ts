/**
 * Lightweight Entity Component System (ECS) entity manager.
 *
 * Provides entity creation, destruction, and component storage/lookup.
 * Uses a Map-of-Maps architecture: entityId -> componentType -> component data.
 *
 * Architecture: lives in /src/sim/ecs/; imports only from /src/types/.
 * Zero Three.js, Babylon.js, or DOM imports.
 */

import type { Entity, ComponentType } from '../../types/ecs';

/**
 * Storage key combining entity and component type.
 * Used for concise Map keys without tuple allocation.
 */
type ComponentKey = `${Entity}:${ComponentType}`;

/**
 * The EntityManager tracks all entities and their components.
 * Lightweight, no external dependencies, suitable for small-to-medium entity counts.
 */
export class EntityManager {
  private nextId: Entity = 1;
  private components: Map<ComponentKey, unknown> = new Map();
  private entityCounts: Map<Entity, number> = new Map();

  /**
   * Create a new entity with a unique numeric ID.
   * Returns the entity ID.
   */
  createEntity(): Entity {
    const id = this.nextId++;
    this.entityCounts.set(id, 0);
    return id;
  }

  /**
   * Destroy an entity and remove all its components.
   * Safe to call on already-destroyed entities (no-op).
   */
  destroyEntity(entity: Entity): void {
    if (!this.entityCounts.has(entity)) return;
    // Remove all components for this entity
    for (const [key, _] of this.components) {
      const [entStr] = key.split(':');
      if (entStr === String(entity)) {
        this.components.delete(key);
      }
    }
    this.entityCounts.delete(entity);
  }

  /**
   * Add or update a component on an entity.
   * @param entity The entity ID.
   * @param componentType The component type discriminator string.
   * @param data The component data.
   */
  addComponent<T>(entity: Entity, componentType: ComponentType, data: T): void {
    if (!this.entityCounts.has(entity)) {
      throw new Error(`Entity ${entity} does not exist`);
    }
    const key = `${entity}:${componentType}` as ComponentKey;
    this.components.set(key, data);
    this.entityCounts.set(entity, (this.entityCounts.get(entity) ?? 0) + 1);
  }

  /**
   * Get a component from an entity.
   * @param entity The entity ID.
   * @param componentType The component type discriminator string.
   * @returns The component data, or undefined if not present.
   */
  getComponent<T>(entity: Entity, componentType: ComponentType): T | undefined {
    const key = `${entity}:${componentType}` as ComponentKey;
    return this.components.get(key) as T | undefined;
  }

  /**
   * Query entities that have all of the specified component types.
   * @param componentTypes Array of component type strings to match.
   * @returns Array of entity IDs that have all of the specified components.
   */
  queryEntities(componentTypes: ComponentType[]): Entity[] {
    const result: Entity[] = [];
    const entitySet = new Set<Entity>();

    for (const [key, _] of this.components) {
      const [entStr, compType] = key.split(':') as [string, ComponentType];
      const entity = Number(entStr);
      if (!entitySet.has(entity) && componentTypes.includes(compType)) {
        entitySet.add(entity);
        // Check if entity has ALL required components
        let hasAll = true;
        for (const required of componentTypes) {
          if (!this.components.has(`${entity}:${required}` as ComponentKey)) {
            hasAll = false;
            break;
          }
        }
        if (hasAll) {
          result.push(entity);
        }
      }
    }

    return result;
  }

  /**
   * Get the number of entities currently alive.
   */
  get entityCount(): number {
    return this.entityCounts.size;
  }
}
