/**
 * Elevation tile decoder worker.
 *
 * The main thread fetches a tile PNG (document-relative URLs work there) and
 * transfers the raw bytes here; this worker decodes it via OffscreenCanvas
 * and returns a transferable Int16Array of meters (sea level = 0).
 *
 * Architecture: /src/sim/ layer - pure TypeScript, zero rendering imports.
 */

import { ELEV_OFFSET } from './earthConfig';

interface DecodeRequest {
  id: number;
  row: number;
  col: number;
  buffer: ArrayBuffer;
}

interface DecodeResponse {
  id: number;
  row: number;
  col: number;
  ok: boolean;
  data?: Int16Array;
  error?: string;
}

const workerScope = self as unknown as {
  onmessage: ((e: { data: DecodeRequest }) => void) | null;
  postMessage: (msg: DecodeResponse, transfer?: ArrayBuffer[]) => void;
};

async function decodeTile(request: DecodeRequest): Promise<void> {
  try {
    const blob = new Blob([request.buffer], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('OffscreenCanvas 2d context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const out = new Int16Array(bitmap.width * bitmap.height);
    for (let i = 0; i < out.length; i++) {
      // R = high byte, G = low byte of (elevation + ELEV_OFFSET)
      out[i] = ((image.data[i * 4] << 8) | image.data[i * 4 + 1]) - ELEV_OFFSET;
    }
    bitmap.close();
    workerScope.postMessage({ id: request.id, row: request.row, col: request.col, ok: true, data: out }, [out.buffer]);
  } catch (err) {
    workerScope.postMessage({
      id: request.id,
      row: request.row,
      col: request.col,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

workerScope.onmessage = (e: { data: DecodeRequest }): void => {
  void decodeTile(e.data);
};
