import { worldToLatLon } from '../../sim/world/earth/earthProjection';
import {
  geodeticToEnu,
  type GeodeticCoordinate,
  type EnuVector,
} from './wgs84';
import { ANCHOR_SNAP } from '../frameAnchor';

/** Geographic origin used by one local render frame. */
export interface LocalEarthFrame {
  origin: GeodeticCoordinate;
  worldX: number;
  worldZ: number;
}

export let currentLocalEarthFrame: LocalEarthFrame | null = null;

/** Create a local Earth frame from the existing simulation world coordinates. */
export function createLocalEarthFrame(
  worldX: number,
  worldZ: number,
  originHeight: number,
): LocalEarthFrame {
  const { lat, lon } = worldToLatLon(worldX, worldZ);
  return { origin: { lat, lon, height: originHeight }, worldX, worldZ };
}

export function updateLocalEarthFrame(worldX: number, worldZ: number, originHeight: number): boolean {
  const snappedX = Math.round(worldX / ANCHOR_SNAP) * ANCHOR_SNAP;
  const snappedZ = Math.round(worldZ / ANCHOR_SNAP) * ANCHOR_SNAP;
  if (currentLocalEarthFrame?.worldX === snappedX && currentLocalEarthFrame.worldZ === snappedZ) return false;
  currentLocalEarthFrame = createLocalEarthFrame(snappedX, snappedZ, originHeight);
  return true;
}

/** Convert an existing world x/z/elevation sample into local ENU meters. */
export function worldToLocalEnu(
  worldX: number,
  worldZ: number,
  elevation: number,
  frame: LocalEarthFrame,
): EnuVector {
  const { lat, lon } = worldToLatLon(worldX, worldZ);
  return geodeticToEnu({ lat, lon, height: elevation }, frame.origin);
}
/**
 * ENU position of one frame's origin measured inside another frame.
 *
 * Geometry baked in `frame` is re-seated onto `current` by translating its mesh
 * with this vector (Three.js coordinates: east, up, -north). The two frames are
 * rigidly related up to the ENU basis rotation of one anchor step, so geometry
 * can be baked once and translated instead of regenerated (see docs/08).
 */
export function frameOriginWithin(frame: LocalEarthFrame, current: LocalEarthFrame): EnuVector {
  return geodeticToEnu(frame.origin, current.origin);
}
