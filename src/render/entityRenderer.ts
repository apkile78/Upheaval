/**
 * Entity Renderer - synchronizes ECS entities with Three.js render meshes.
 *
 * Queries entities with TransformComponent and RenderableComponent from
 * EntityManager, creating/updating/destroying Three.js meshes accordingly.
 *
 * Architecture: lives in /src/render/; imports Three.js.
 * Simulation logic remains unaware of render meshes.
 */

import { BoxGeometry, Mesh, MeshBasicMaterial, Scene, Material } from 'three';

import type { Entity } from '../types/ecs';
import type { TransformComponent, RenderableComponent } from '../types/ecs';
import { EntityManager } from '../sim/ecs/entityManager';
import { frameAnchor } from './frameAnchor';
import { currentLocalEarthFrame, worldToLocalEnu } from './earth/localFrame';

/**
 * Default scale for entities without explicit scale component.
 */
const DEFAULT_SCALE = { x: 1, y: 1, z: 1 };

/**
 * Cache of shared geometries per mesh type ID.
 */
const geometryCache = new Map<string, BoxGeometry>();

/**
 * Cache of shared materials per mesh type ID.
 */
const materialCache = new Map<string, MeshBasicMaterial>();

/**
 * Get or create a cached geometry for a mesh type ID.
 */
function getGeometry(meshTypeId: string): BoxGeometry {
  let geo = geometryCache.get(meshTypeId);
  if (!geo) {
    // Use different colors/sizes for different mesh types to distinguish them
    const size = 0.5;
    geo = new BoxGeometry(size, size, size);
    geometryCache.set(meshTypeId, geo);
  }
  return geo;
}

/**
 * Get or create a cached material for a mesh type ID.
 * Different mesh types get different colors for visual distinction.
 */
function getMaterial(meshTypeId: string): MeshBasicMaterial {
  let mat = materialCache.get(meshTypeId);
  if (!mat) {
    // Use a default color for all mesh types (can be extended later)
    mat = new MeshBasicMaterial({ color: 0x4488cc });
    materialCache.set(meshTypeId, mat);
  }
  return mat;
}

/**
 * EntityRenderer synchronizes ECS entities with Three.js scene.
 *
 * Maintains a map of entity ID to Mesh, updating positions/scales
 * each frame and cleaning up destroyed entities.
 */
export class EntityRenderer {
  private entityManager: EntityManager;
  private scene: Scene;
  /** Map from entity ID to Three.js Mesh */
  private meshes = new Map<Entity, Mesh>();
  /** Reusable set for tracking visible entities (avoid per-frame allocation). */
  private visibleSet = new Set<Entity>();
  /** Swap set for double-buffered visible tracking. */
  private prevVisibleSet = new Set<Entity>();

  constructor(entityManager: EntityManager, scene: Scene) {
    this.entityManager = entityManager;
    this.scene = scene;
  }

  /**
   * Update all renderable entities.
   * Called once per frame from the render loop.
   */
  update(): void {
    // Query entities with both Transform and Renderable components
    const entities = this.entityManager.queryEntities(['Transform', 'Renderable']);

    // Swap visible sets (reuse allocations)
    const current = this.visibleSet;
    current.clear();
    const prev = this.prevVisibleSet;
    this.prevVisibleSet = current;
    this.visibleSet = prev;

    for (const entity of entities) {
      const transform = this.entityManager.getComponent<TransformComponent>(entity, 'Transform');
      const renderable = this.entityManager.getComponent<RenderableComponent>(entity, 'Renderable');

      if (!transform || !renderable) continue;
      if (!renderable.visible) continue;

      current.add(entity);

      // Get or create mesh for this entity
      let mesh = this.meshes.get(entity);

      if (!mesh) {
        mesh = this.createMesh(entity, renderable);
        this.meshes.set(entity, mesh);
        this.scene.add(mesh);
      }

      // Update mesh transform
      // Entity transforms are sim-space; subtract the frame anchor so the mesh
      // rides the shared render-space origin with the terrain.
      if (currentLocalEarthFrame === null) {
        mesh.position.set(transform.position.x - frameAnchor.x, transform.position.y, transform.position.z - frameAnchor.z);
      } else {
        const local = worldToLocalEnu(transform.position.x, transform.position.z, transform.position.y, currentLocalEarthFrame);
        mesh.position.set(local.east, local.up, -local.north);
      }

      // Apply rotation (yaw around Y axis, pitch around X axis)
      mesh.rotation.set(transform.rotation.x || 0, transform.rotation.y || 0, 0);

      // Apply scale
      const scale = renderable.scale || DEFAULT_SCALE;
      mesh.scale.set(scale.x, scale.y, scale.z);
    }

    // Destroy meshes for entities that are no longer visible/renderable
    for (const [entity, mesh] of this.meshes) {
      if (!current.has(entity)) {
        this.destroyMesh(entity, mesh);
      }
    }
  }

  /**
   * Create a Three.js Mesh for an entity.
   */
  private createMesh(entity: Entity, renderable: RenderableComponent): Mesh {
    const geometry = getGeometry(renderable.meshTypeId);
    const material = getMaterial(renderable.meshTypeId);
    const mesh = new Mesh(geometry, material);
    
    // Store entity ID on the mesh for debugging
    (mesh as Mesh & { entityId?: Entity }).entityId = entity;
    
    return mesh;
  }

  /**
   * Destroy a mesh and remove it from the scene.
   */
  private destroyMesh(entity: Entity, mesh: Mesh): void {
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      (mat as Material).dispose();
    }
    this.scene.remove(mesh);
    this.meshes.delete(entity);
  }

  /**
   * Explicitly destroy all meshes (call on shutdown).
   */
  dispose(): void {
    for (const [, mesh] of this.meshes) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        (mat as Material).dispose();
      }
      this.scene.remove(mesh);
    }
    this.meshes.clear();
    this.visibleSet.clear();
    this.prevVisibleSet.clear();
  }

  /**
   * Get the number of active render meshes.
   */
  get meshCount(): number {
    return this.meshes.size;
  }
}

