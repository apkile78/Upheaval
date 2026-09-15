/**
 * Distant-terrain LOD shell - ring layout and tile ownership math.
 *
 * The macro shell builds two rings of differently-resolved tiles (see
 * `MacroRing`). This module holds the ring definitions and the pure
 * distance/ownership predicates used to decide which ring materializes a
 * cell; the geometry itself is built by `macroTileBuilder.ts`.
 *
 * Architecture: lives in /src/render/; pure math, no imports.
 */

/**
 * LOD ring layout: the macro shell builds two rings of differently-sized
 * tiles. The near ring fills the gap between the voxel chunks and the far
 * ring; the far ring covers the 3 km+ horizon.
 */
export interface MacroRing {
  /** Tile footprint in meters. */
  tileSize: number;
  /** Grid points per tile side. */
  gridPoints: number;
  /** Ring bounds in meters from the player (center-basis X/Z radii). */
  innerRadius: number;
  outerRadius: number;
  /** Whether tiles crossing the inner boundary belong to the previous ring. */
  exclusiveInner?: boolean;
  /**
   * True when the ring's geometry must be re-baked on every anchor re-base.
   *
   * Invariant: **a clipped ring rebakes; an unclipped ring is baked once.** The
   * near ring clips triangles against a boundary that follows the player, so its
   * clip cannot be translated. The far ring has no clip (it relies on exact
   * grid-cell ownership via `exclusiveInner`), so it is baked once per tile and
   * only re-seated by `MacroTerrainManager.syncAnchor`. Rings must therefore be
   * either clipped+rebaking or unclipped+bake-once, never mixed (see docs/08).
   */
  rebakeOnRebase: boolean;
}

export const NORMAL_TERRAIN_RADIUS = 8000;
export const HORIZON_TERRAIN_RADIUS = 20000;
export const SCOPE_TERRAIN_RADIUS = 35000;

export const MACRO_NEAR_RING: MacroRing = {
  tileSize: 256,
  gridPoints: 33,
  innerRadius: 96,
  outerRadius: 1280,
  rebakeOnRebase: true,
};

export const MACRO_FAR_RING: MacroRing = {
  tileSize: 256,
  gridPoints: 9,
  innerRadius: MACRO_NEAR_RING.outerRadius,
  outerRadius: NORMAL_TERRAIN_RADIUS,
  exclusiveInner: true,
  rebakeOnRebase: false,
};

/**
 * Voxel-chunk half extent (square) in meters that the shell skips around the
 * player. Tiles whose bounds intersect this box keep their voxel depiction.
 */
export const VOXEL_SKIP_HALF = 112;

/** Distance range of a tile bounds in the square render-distance metric. */
export function tileDistanceRange(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  centerWorldX: number,
  centerWorldZ: number,
): { min: number; max: number } {
  const dx = Math.max(minX - centerWorldX, 0, centerWorldX - maxX);
  const dz = Math.max(minZ - centerWorldZ, 0, centerWorldZ - maxZ);
  const min = Math.max(dx, dz);
  const max = Math.max(
    Math.abs(minX - centerWorldX),
    Math.abs(maxX - centerWorldX),
    Math.abs(minZ - centerWorldZ),
    Math.abs(maxZ - centerWorldZ),
  );
  return { min, max };
}

/** True when a macro tile bounds overlaps a render-distance band. */
export function tileOverlapsRing(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  centerWorldX: number,
  centerWorldZ: number,
  ring: MacroRing,
): boolean {
  const distance = tileDistanceRange(minX, maxX, minZ, maxZ, centerWorldX, centerWorldZ);
  // Ownership rule: a cell exactly on the shared inner/outer boundary belongs
  // to the ring that owns by exclusion (`exclusiveInner`). The non-exclusive
  // ring's outer test is therefore strict, so the two predicates partition the
  // shell: every cell is claimed by exactly one ring, never both (docs/08).
  const reachesInnerBoundary = ring.exclusiveInner
    ? distance.min >= ring.innerRadius
    : distance.max >= ring.innerRadius;
  const withinOuter = ring.exclusiveInner
    ? distance.min <= ring.outerRadius
    : distance.min < ring.outerRadius;
  return reachesInnerBoundary && withinOuter;
}

/**
 * Cache tag for a macro tile.
 *
 * A rebaking ring (the near ring, whose clip boundary follows the player)
 * invalidates its geometry on every anchor re-base. A bake-once ring (the far
 * shell) keeps a stable tag, so its geometry is reused and only re-seated by
 * `MacroTerrainManager.syncAnchor` (see docs/08).
 */
export function macroBuildTag(
  ring: MacroRing,
  key: string,
  anchorX: number,
  anchorZ: number,
): string {
  return ring.rebakeOnRebase ? key + '@' + anchorX + ',' + anchorZ : key;
}

/** True when a macro tile AABB intersects the voxel box around the player. */
export function intersectsVoxelBox(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  centerWorldX: number,
  centerWorldZ: number,
): boolean {
  return (
    minX < centerWorldX + VOXEL_SKIP_HALF &&
    maxX > centerWorldX - VOXEL_SKIP_HALF &&
    minZ < centerWorldZ + VOXEL_SKIP_HALF &&
    maxZ > centerWorldZ - VOXEL_SKIP_HALF
  );
}
