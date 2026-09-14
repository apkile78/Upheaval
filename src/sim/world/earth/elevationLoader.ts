/**
 * Boot-time loader for the real-Earth elevation asset set.
 *
 * Fetches meta.json, spins up the decoder worker, and produces an
 * ElevationSource whose tile loads fetch PNG bytes on the main thread
 * (document-relative URLs) and decode them in the worker.
 *
 * Architecture: /src/sim/ layer - no rendering imports.
 */

import type { EarthElevationSource, EarthElevMeta } from '../../../types/world';
import { latLonToWorld } from './earthProjection';
import { ASSET_META_URL, tileAssetUrl, TILES_Y, TILES_X } from './earthConfig';
import { ElevationSource } from './elevationGrid';

interface WorkerResponse {
  id: number;
  ok: boolean;
  row: number;
  col: number;
  data?: Int16Array;
  error?: string;
}

interface PendingRequest {
  resolve: (data: Int16Array) => void;
  reject: (err: Error) => void;
}

/** Create the Earth elevation source backed by the tiled PNG assets. */
export async function createEarthElevationSource(): Promise<ElevationSource> {
  const metaRes = await fetch(ASSET_META_URL);
  if (!metaRes.ok) throw new Error(`Earth elevation meta load failed: HTTP ${metaRes.status}`);
  const meta = (await metaRes.json()) as EarthElevMeta;

  const worker = new Worker(new URL('./elevationWorker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, PendingRequest>();
  let nextId = 1;

  worker.onmessage = (e: MessageEvent<WorkerResponse>): void => {
    const req = pending.get(e.data.id);
    if (req === undefined) return;
    pending.delete(e.data.id);
    if (e.data.ok && e.data.data !== undefined) req.resolve(e.data.data);
    else req.reject(new Error(e.data.error ?? 'tile decode failed'));
  };

  const loader = (row: number, col: number): Promise<Int16Array> => {
    return new Promise<Int16Array>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      fetch(tileAssetUrl(row, col))
        .then((res) => {
          if (!res.ok) throw new Error(`tile HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((buffer) => {
          worker.postMessage({ id, row, col, buffer }, [buffer]);
        })
        .catch((err: Error) => {
          pending.delete(id);
          reject(err);
        });
    });
  };

  return new ElevationSource(loader, undefined, meta);
}

/** Warm the source around a latitude/longitude and await the first tiles. */
export async function warmupAround(source: EarthElevationSource, lat: number, lon: number): Promise<void> {
  const p = latLonToWorld(lat, lon);
  const pad = 2;
  source.requestArea(p.x - pad, p.z - pad, p.x + pad, p.z + pad);
  await source.waitForArea();
}

/** Tile grid sanity helper used by tests and boot diagnostics. */
export function tileGridDimensions(): { x: number; y: number } {
  return { x: TILES_X, y: TILES_Y };
}
