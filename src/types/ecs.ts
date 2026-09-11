/**
 * Entity Component System (ECS) type definitions.
 *
 * Architecture: lives in /src/types/; never imports from /src/sim/ or /src/render/.
 * Provides component interfaces used by entity manager and systems in /src/sim/ecs/.
 */

import type { Vector3D } from './world';
import type { AABB } from './physics';

/**
 * Entity is a unique numeric identifier.
 * ECS use sequential integer IDs for cache-friendly entity lookup.
 */
export type Entity = number;

/**
 * Component type discriminator string.
 * Used for runtime component lookup without type-erasure.
 */
export type ComponentType =
  | 'Transform'
  | 'Renderable'
  | 'Collision'
  | 'Health';

// ---------------------------------------------------------------------------
// Component interfaces
// ---------------------------------------------------------------------------

/**
 * Transform component: position, rotation (yaw/pitch in radians), and velocity.
 * Used by movement and physics systems.
 */
export interface TransformComponent {
  position: Vector3D;
  rotation: Vector3D; // x = pitch (radians), y = yaw (radians), z unused
  velocity: Vector3D;
}

/**
 * Valid mesh type IDs for renderable entities.
 * Kept in /src/types/ so both sim and render layers share the contract.
 */
export type MeshTypeId =
  | 'enemy'
  | 'resource'
  | 'item'
  | string; // extensible for future types

/**
 * Renderable component: what to draw and how to scale it.
 * MeshTypeId refers to a registered mesh in the render layer.
 */
export interface RenderableComponent {
  meshTypeId: MeshTypeId;
  scale: Vector3D;
  visible: boolean;
}

/**
 * Collision component: bounding box and solidity flag.
 * Used by collision detection systems.
 */
export interface CollisionComponent {
  boundingBox: AABB;
  isSolid: boolean;
}

/**
 * Health component: current and maximum health values.
 * Used by damage systems and rendering (e.g. health bars).
 */
export interface HealthComponent {
  current: number;
  max: number;
}
