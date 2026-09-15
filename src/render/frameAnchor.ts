/**
 * Shared floating-origin frame anchor.
 *
 * World coordinates on a 1:1 Earth reach ~+-20M meters; Float32 render
 * geometry would quantize vertices to ~2 m steps that far out, smearing
 * hills and distorting the terrain whenever the camera turns. All renderers
 * subtract this anchor from world positions so geometry stays within a few
 * kilometers of the renderer origin, preserving full float32 precision. The
 * anchor snaps to a coarse grid so objects only rebase on infrequent
 * crossings (never per-frame).
 *
 * This is render-space bookkeeping over sim-space data; it never modifies
 * simulation state. The camera subtracts the anchor so the rendered view is
 * identical to absolute coordinates.
 *
 * Architecture: lives in /src/render/; no Three.js imports, no sim imports.
 */

/** Anchor snap step in meters (64 m keeps precision while moving rarely). */
export const ANCHOR_SNAP = 64;

/** Shared mutable anchor {x, z} in world meters. Y stays absolute. */
export const frameAnchor: { x: number; z: number } = { x: 0, z: 0 };

/**
 * Move the anchor toward a world focus (the player). Returns true when the
 * anchor re-based, which requires re-localizing dependent meshes once.
 */
export function updateFrameAnchor(worldX: number, worldZ: number): boolean {
  const nx = Math.round(worldX / ANCHOR_SNAP) * ANCHOR_SNAP;
  const nz = Math.round(worldZ / ANCHOR_SNAP) * ANCHOR_SNAP;
  if (nx === frameAnchor.x && nz === frameAnchor.z) return false;
  frameAnchor.x = nx;
  frameAnchor.z = nz;
  return true;
}

/** World -> render-local X for the current anchor. */
export function toLocalX(worldX: number): number {
  return worldX - frameAnchor.x;
}

/** World -> render-local Z for the current anchor. */
export function toLocalZ(worldZ: number): number {
  return worldZ - frameAnchor.z;
}
