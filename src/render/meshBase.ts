/**
 * Shared mesh-base bookkeeping for the floating-origin render space.
 *
 * Render geometry is baked once, relative to the render origin that was active
 * when the mesh was built (the local Earth frame, or the frame anchor before the
 * frame exists). When that origin later re-bases, a cached mesh only needs its
 * own origin translated by the position of its build origin inside the current
 * frame; the vertices stay valid. This replaces per-rebase geometry regeneration
 * with one position write per mesh.
 *
 * The two origins are related by a translation plus the ENU basis rotation of a
 * single 64 m anchor step (~1e-5 rad), so the translation-only re-seat leaves
 * sub-millimetre error across a near-field mesh and centimetre error across an
 * 8 km macro tile. Geometry is therefore re-baked only when its content changes,
 * or when a clip region moves with the player. See docs/08.
 *
 * Architecture: lives in /src/render/; no Three.js imports (structural origin).
 */

import { frameAnchor } from './frameAnchor';
import {
  currentLocalEarthFrame,
  frameOriginWithin,
  type LocalEarthFrame,
} from './earth/localFrame';

/** Which render origin a cached mesh's vertices were baked against. */
export interface MeshBase {
  /** Build-time local Earth frame (null before the frame exists). */
  frame: LocalEarthFrame | null;
  /** Build-time frame anchor, used when no local frame was active. */
  anchorX: number;
  anchorZ: number;
}

/** Minimal structural contract for a mesh origin that can be re-seated. */
export interface MeshOrigin {
  position: { x: number; y: number; z: number };
}

/** Capture the render origin that is active right now. */
export function captureMeshBase(): MeshBase {
  return {
    frame: currentLocalEarthFrame,
    anchorX: frameAnchor.x,
    anchorZ: frameAnchor.z,
  };
}

/** True when a base still matches the active render origin. */
export function baseIsCurrent(base: MeshBase): boolean {
  return (
    base.frame === currentLocalEarthFrame &&
    base.anchorX === frameAnchor.x &&
    base.anchorZ === frameAnchor.z
  );
}

/**
 * Re-seat a mesh built against `base` onto the active render origin.
 * Returns false when the mesh is already seated, so callers can count real work.
 */
export function applyMeshBase(mesh: MeshOrigin, base: MeshBase): boolean {
  if (baseIsCurrent(base)) return false;

  const current = currentLocalEarthFrame;
  if (base.frame !== null && current !== null) {
    // Vertices are (east, up, -north) relative to the build frame, so the whole
    // mesh moves by the build origin's position inside the current frame.
    const offset = frameOriginWithin(base.frame, current);
    mesh.position.x = offset.east;
    mesh.position.y = offset.up;
    mesh.position.z = -offset.north;
    return true;
  }

  // Anchor-space geometry (absolute height, world x/z minus the build anchor).
  mesh.position.x = base.anchorX - frameAnchor.x;
  mesh.position.y = 0;
  mesh.position.z = base.anchorZ - frameAnchor.z;
  return true;
}