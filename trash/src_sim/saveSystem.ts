/**
 * Game state serialization and persistence manager.
 *
 * Serializes ECS entities, player state, and world generation parameters
 * to pure JSON. Deserializes back into a fresh EntityManager.
 *
 * Architecture: /src/sim/ layer — zero imports from rendering engines.
 * All serialized data uses strictly primitive values.
 */

import type { Entity, TransformComponent, RenderableComponent, CollisionComponent, HealthComponent } from '../types/ecs';
import type { PlayerState } from '../types/player';
import { EntityManager } from './ecs/entityManager';

// ---------------------------------------------------------------------------
// Serialized data interfaces (pure primitives only)
// ---------------------------------------------------------------------------

interface SerializedTransform {
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number;
  vx: number; vy: number; vz: number;
}

interface SerializedRenderable {
  mesh: string;
  sx: number; sy: number; sz: number;
  vis: boolean;
}

interface SerializedCollision {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  solid: boolean;
}

interface SerializedHealth {
  cur: number; max: number;
}

interface SerializedEntity {
  id: number;
  t?: SerializedTransform;
  r?: SerializedRenderable;
  c?: SerializedCollision;
  h?: SerializedHealth;
}

interface SerializedPlayer {
  id: string; name: string;
  health: number; maxHealth: number;
  posX: number; posY: number; posZ: number;
  rotX: number; rotY: number; rotZ: number;
  camMode: string;
}

interface SaveData {
  version: number;
  timestamp: number;
  worldSeed: number;
  player: SerializedPlayer;
  entities: SerializedEntity[];
}

const SAVE_VERSION = 1;

// ---------------------------------------------------------------------------
// Save System
// ---------------------------------------------------------------------------

export class SaveSystem {
  private entityManager: EntityManager;
  private getWorldSeed: () => number;

  constructor(entityManager: EntityManager, getWorldSeed: () => number) {
    this.entityManager = entityManager;
    this.getWorldSeed = getWorldSeed;
  }

  saveToJSON(player: PlayerState): string {
    const saveData: SaveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      worldSeed: this.getWorldSeed(),
      player: this.serializePlayer(player),
      entities: this.serializeEntities(),
    };
    return JSON.stringify(saveData);
  }

  loadFromJSON(json: string): PlayerState {
    const saveData: SaveData = JSON.parse(json);
    if (saveData.version !== SAVE_VERSION) {
      throw new Error(`Unsupported save version: ${saveData.version}`);
    }
    this.clearEntities();
    for (const entity of saveData.entities) {
      this.deserializeEntity(entity);
    }
    return this.deserializePlayer(saveData.player);
  }

  saveToLocalStorage(key: string, player: PlayerState): void {
    localStorage.setItem(key, this.saveToJSON(player));
  }

  loadFromLocalStorage(key: string): PlayerState | null {
    const json = localStorage.getItem(key);
    if (json === null) return null;
    return this.loadFromJSON(json);
  }

  private serializePlayer(player: PlayerState): SerializedPlayer {
    return {
      id: player.id,
      name: player.name,
      health: player.health,
      maxHealth: player.maxHealth,
      posX: player.transform.position.x,
      posY: player.transform.position.y,
      posZ: player.transform.position.z,
      rotX: player.transform.rotation.x,
      rotY: player.transform.rotation.y,
      rotZ: player.transform.rotation.z,
      camMode: player.cameraMode,
    };
  }

  private serializeEntities(): SerializedEntity[] {
    const entities = this.entityManager.queryEntities(['Transform']);
    const result: SerializedEntity[] = [];
    for (const entity of entities) {
      const serialized = this.serializeEntity(entity);
      if (serialized) result.push(serialized);
    }
    return result;
  }

  private serializeEntity(entity: Entity): SerializedEntity | null {
    const transform = this.entityManager.getComponent<TransformComponent>(entity, 'Transform');
    if (!transform) return null;

    const serialized: SerializedEntity = {
      id: entity,
      t: {
        px: transform.position.x, py: transform.position.y, pz: transform.position.z,
        rx: transform.rotation.x, ry: transform.rotation.y, rz: transform.rotation.z,
        vx: transform.velocity.x, vy: transform.velocity.y, vz: transform.velocity.z,
      },
    };

    const renderable = this.entityManager.getComponent<RenderableComponent>(entity, 'Renderable');
    if (renderable) {
      serialized.r = {
        mesh: renderable.meshTypeId,
        sx: renderable.scale.x, sy: renderable.scale.y, sz: renderable.scale.z,
        vis: renderable.visible,
      };
    }

    const collision = this.entityManager.getComponent<CollisionComponent>(entity, 'Collision');
    if (collision) {
      serialized.c = {
        minX: collision.boundingBox.min.x, minY: collision.boundingBox.min.y, minZ: collision.boundingBox.min.z,
        maxX: collision.boundingBox.max.x, maxY: collision.boundingBox.max.y, maxZ: collision.boundingBox.max.z,
        solid: collision.isSolid,
      };
    }

    const health = this.entityManager.getComponent<HealthComponent>(entity, 'Health');
    if (health) {
      serialized.h = { cur: health.current, max: health.max };
    }

    return serialized;
  }

  private deserializePlayer(data: SerializedPlayer): PlayerState {
    return {
      id: data.id,
      name: data.name,
      health: data.health,
      maxHealth: data.maxHealth,
      bodyPartHealth: { head: 100, torso: 100, leftArm: 100, rightArm: 100, leftLeg: 100, rightLeg: 100 },
      bodyPartMaxHealth: { head: 100, torso: 100, leftArm: 100, rightArm: 100, leftLeg: 100, rightLeg: 100 },
      inventory: { items: [], capacity: 100 },
      transform: {
        position: { x: data.posX, y: data.posY, z: data.posZ },
        rotation: { x: data.rotX, y: data.rotY, z: data.rotZ },
      },
      cameraMode: data.camMode as PlayerState['cameraMode'],
    };
  }

  private deserializeEntity(data: SerializedEntity): void {
    const entity = this.entityManager.createEntity();

    if (data.t) {
      this.entityManager.addComponent(entity, 'Transform', {
        position: { x: data.t.px, y: data.t.py, z: data.t.pz },
        rotation: { x: data.t.rx, y: data.t.ry, z: data.t.rz },
        velocity: { x: data.t.vx, y: data.t.vy, z: data.t.vz },
      });
    }

    if (data.r) {
      this.entityManager.addComponent(entity, 'Renderable', {
        meshTypeId: data.r.mesh,
        scale: { x: data.r.sx, y: data.r.sy, z: data.r.sz },
        visible: data.r.vis,
      });
    }

    if (data.c) {
      this.entityManager.addComponent(entity, 'Collision', {
        boundingBox: {
          min: { x: data.c.minX, y: data.c.minY, z: data.c.minZ },
          max: { x: data.c.maxX, y: data.c.maxY, z: data.c.maxZ },
        },
        isSolid: data.c.solid,
      });
    }

    if (data.h) {
      this.entityManager.addComponent(entity, 'Health', {
        current: data.h.cur,
        max: data.h.max,
      });
    }
  }

  private clearEntities(): void {
    const entities = this.entityManager.queryEntities(['Transform']);
    for (const entity of entities) {
      this.entityManager.destroyEntity(entity);
    }
  }
}
