/**
 * Core type definitions for the player entity and its components.
 * Bridges simulation state with render layer via the contract layer.
 */

import type { Vector3D } from './world';

/**
 * Camera perspective modes supported by the triple-perspective system.
 */
export type CameraViewMode =
  | 'first-person'
  | 'third-person'
  | 'isometric';

/**
 * A single item instance in the player inventory.
 */
export interface ItemInstance {
  id: string;
  name: string;
  quantity: number;
}

/**
 * The player inventory with capacity tracking.
 * Designed to scale from small personal inventories to large storage containers.
 */
export interface PlayerInventory {
  items: ItemInstance[];
  capacity: number;
}

/**
 * Spatial transform of the player entity.
 */
export interface PlayerTransform {
  position: Vector3D;
  rotation: Vector3D;
}

/**
 * Body part identifiers for localized health pools.
 * Aligns with the 60+ bone humanoid rig and bone-weight transform overrides.
 */
export type BodyPart =
  | 'head'
  | 'torso'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg';

/**
 * Complete dynamic state of the player character.
 * Includes survival stats, body part health, gear, position, and camera mode.
 */
export interface PlayerState {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  bodyPartHealth: Record<BodyPart, number>;
  bodyPartMaxHealth: Record<BodyPart, number>;
  inventory: PlayerInventory;
  transform: PlayerTransform;
  cameraMode: CameraViewMode;
}
