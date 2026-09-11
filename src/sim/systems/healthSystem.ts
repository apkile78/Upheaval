/**
 * Health & Damage System - manages entity health state and death lifecycle.
 *
 * Clamps health values between 0 and maxHealth.
 * Processes entity death when health reaches 0.
 *
 * Architecture: lives in /src/sim/systems/; imports from /src/types/ and /src/sim/.
 * Zero Three.js, Babylon.js, or DOM imports.
 */

import type { Entity } from '../../types/ecs';
import type { HealthComponent } from '../../types/ecs';
import { EntityManager } from '../ecs/entityManager';

// ---------------------------------------------------------------------------
// Death events
// ---------------------------------------------------------------------------

/**
 * Represents an entity death event emitted by the health system.
 * Can be consumed by loot drop, particle effects, or scoring systems.
 */
export interface DeathEvent {
  entity: Entity;
  position: { x: number; y: number; z: number } | null;
  lastDamageSource: string;
}

/**
 * Callback type for death events.
 */
export type DeathCallback = (event: DeathEvent) => void;

// ---------------------------------------------------------------------------
// Health System
// ---------------------------------------------------------------------------

/**
 * Manages health state changes and death lifecycle for entities.
 */
export class HealthSystem {
  private entityManager: EntityManager;
  private deathCallbacks: DeathCallback[] = [];

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  /**
   * Register a callback for entity death events.
   * @param callback - Function called when an entity dies
   */
  onDeath(callback: DeathCallback): void {
    this.deathCallbacks.push(callback);
  }

  /**
   * Apply damage to an entity.
   * Clamps resulting health to minimum of 0.
   *
   * @param entity - The entity to damage
   * @param amount - Amount of damage to apply (positive number)
   * @param source - Optional identifier for the damage source
   * @return true if the entity died from this damage
   */
  damage(entity: Entity, amount: number, source: string = 'unknown'): boolean {
    const health = this.entityManager.getComponent<HealthComponent>(entity, 'Health');
    if (!health) return false;

    health.current = Math.max(0, health.current - amount);

    if (health.current <= 0) {
      this.processDeath(entity, source);
      return true;
    }
    return false;
  }

  /**
   * Heal an entity by a given amount.
   * Clamps resulting health to maximum of maxHealth.
   *
   * @param entity - The entity to heal
   * @param amount - Amount of health to restore (positive number)
   */
  heal(entity: Entity, amount: number): void {
    const health = this.entityManager.getComponent<HealthComponent>(entity, 'Health');
    if (!health) return;

    health.current = Math.min(health.max, health.current + amount);
  }

  /**
   * Set an entity's health to a specific value.
   * Clamps between 0 and maxHealth.
   *
   * @param entity - The entity to modify
   * @param value - New health value
   */
  setHealth(entity: Entity, value: number): void {
    const health = this.entityManager.getComponent<HealthComponent>(entity, 'Health');
    if (!health) return;

    health.current = Math.max(0, Math.min(health.max, value));
  }

  /**
   * Check if an entity is alive (health > 0).
   *
   * @param entity - The entity to check
   */
  isAlive(entity: Entity): boolean {
    const health = this.entityManager.getComponent<HealthComponent>(entity, 'Health');
    if (!health) return false;
    return health.current > 0;
  }

  /**
   * Process entity death lifecycle: emit event and destroy entity.
   */
  private processDeath(entity: Entity, damageSource: string): void {
    // Get position before destroying (for event consumers)
    const transform = this.entityManager.getComponent<{ position: { x: number; y: number; z: number } }>(entity, 'Transform');
    const position = transform ? { ...transform.position } : null;

    // Emit death event
    const event: DeathEvent = {
      entity,
      position,
      lastDamageSource: damageSource,
    };

    for (const callback of this.deathCallbacks) {
      callback(event);
    }

    // Destroy the entity via ECS
    this.entityManager.destroyEntity(entity);
  }
}
