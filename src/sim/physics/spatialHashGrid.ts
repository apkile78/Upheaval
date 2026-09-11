/**
 * Spatial Hash Grid for O(1) broad-phase entity queries.
 *
 * Partitions 3D world space into discrete hash buckets (cells).
 * Supports insert, remove, update, and radius queries with minimal allocations.
 *
 * Architecture: lives in /src/sim/physics/; imports only from /src/types/.
 * Zero Three.js, Babylon.js, or DOM imports.
 */

import type { Entity } from '../../types/ecs';
import type { CellCoordinate, SpatialQueryEntry } from '../../types/physics';

/** Entry stored in a grid cell. */
interface CellEntry {
  entity: Entity;
  position: [number, number, number];
}

/**
 * Lightweight spatial hash grid for entity broad-phase queries.
 * Cell size determines the trade-off between memory usage and query precision.
 */
export class SpatialHashGrid {
  private cellSize: number;
  private inverseCellSize: number;
  private cells: Map<string, CellEntry[]> = new Map();
  private entityCell: Map<Entity, string> = new Map();
  private queryResult: SpatialQueryEntry[] = [];
  private seenEntities: Set<Entity> = new Set();

  constructor(cellSize: number = 8.0) {
    this.cellSize = cellSize;
    this.inverseCellSize = 1 / cellSize;
  }

  insert(entity: Entity, position: [number, number, number], radius?: number): void {
    if (radius && radius > 0) {
      this.insertWithRadius(entity, position, radius);
      return;
    }
    const key = this.getKey(position);
    this.addEntry(key, entity, position);
    this.entityCell.set(entity, key);
  }

  remove(entity: Entity): void {
    const key = this.entityCell.get(entity);
    if (key === undefined) return;
    const cell = this.cells.get(key);
    if (cell) {
      const idx = cell.findIndex(e => e.entity === entity);
      if (idx !== -1) {
        cell.splice(idx, 1);
        if (cell.length === 0) this.cells.delete(key);
      }
    }
    this.entityCell.delete(entity);
  }

  update(entity: Entity, oldPos: [number, number, number], newPos: [number, number, number]): void {
    const oldKey = this.getKey(oldPos);
    const newKey = this.getKey(newPos);
    if (oldKey === newKey) {
      const cell = this.cells.get(oldKey);
      if (cell) {
        const entry = cell.find(e => e.entity === entity);
        if (entry) entry.position = newPos;
      }
      return;
    }
    this.remove(entity);
    this.insert(entity, newPos);
  }

  queryRadius(position: [number, number, number], radius: number): SpatialQueryEntry[] {
    const result = this.queryResult;
    result.length = 0;
    this.seenEntities.clear();
    const minCell = this.getCellCoord(position[0] - radius, position[1] - radius, position[2] - radius);
    const maxCell = this.getCellCoord(position[0] + radius, position[1] + radius, position[2] + radius);
    for (let x = minCell.x; x <= maxCell.x; x++) {
      for (let y = minCell.y; y <= maxCell.y; y++) {
        for (let z = minCell.z; z <= maxCell.z; z++) {
          const cell = this.cells.get(this.coordToKey({ x, y, z }));
          if (!cell) continue;
          for (const entry of cell) {
            if (this.seenEntities.has(entry.entity)) continue;
            this.seenEntities.add(entry.entity);
            result.push({ entity: entry.entity, position: entry.position });
          }
        }
      }
    }
    return result;
  }

  clear(): void {
    this.cells.clear();
    this.entityCell.clear();
    this.queryResult.length = 0;
    this.seenEntities.clear();
  }

  getCellSize(): number { return this.cellSize; }
  getCellCount(): number { return this.cells.size; }

  private insertWithRadius(entity: Entity, position: [number, number, number], radius: number): void {
    const minCell = this.getCellCoord(position[0] - radius, position[1] - radius, position[2] - radius);
    const maxCell = this.getCellCoord(position[0] + radius, position[1] + radius, position[2] + radius);
    const primaryKey = this.getKey(position);
    for (let x = minCell.x; x <= maxCell.x; x++) {
      for (let y = minCell.y; y <= maxCell.y; y++) {
        for (let z = minCell.z; z <= maxCell.z; z++) {
          this.addEntry(this.coordToKey({ x, y, z }), entity, position);
        }
      }
    }
    this.entityCell.set(entity, primaryKey);
  }

  private addEntry(key: string, entity: Entity, position: [number, number, number]): void {
    let cell = this.cells.get(key);
    if (!cell) { cell = []; this.cells.set(key, cell); }
    cell.push({ entity, position });
  }

  private getKey(position: [number, number, number]): string {
    return `${Math.floor(position[0] * this.inverseCellSize)},${Math.floor(position[1] * this.inverseCellSize)},${Math.floor(position[2] * this.inverseCellSize)}`;
  }

  private getCellCoord(x: number, y: number, z: number): CellCoordinate {
    return { x: Math.floor(x * this.inverseCellSize), y: Math.floor(y * this.inverseCellSize), z: Math.floor(z * this.inverseCellSize) };
  }

  private coordToKey(coord: CellCoordinate): string {
    return `${coord.x},${coord.y},${coord.z}`;
  }
}
