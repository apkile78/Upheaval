/**
 * Persistent save controller for the Upheaval game engine.
 * Implemented per ISaveController contract defined in src/types/storage.ts.
 *
 * Architecture: /src/sim/ layer — zero imports from rendering engines
 * (Babylon.js/Three.js). Uses localForage wrapping IndexedDB for async
 * non-blocking persistence.
 */

import localforage from 'localforage';
import type { ISaveController, SaveGameStatePayload } from '../../types/storage';

/** IndexedDB store name for game save data. */
const STORE_NAME = 'upheaval-save-data';

/** Key prefix to namespace save entries within the store. */
const SAVE_KEY_PREFIX = 'save_';

/** Minimum interval (ms) between automatic save writes. */
const AUTO_SAVE_THROTTLE_MS = 5000;

/**
 * Concrete implementation of the ISaveController interface.
 * Wraps a dedicated localForage (IndexedDB) instance.
 */
export class SaveSystem implements ISaveController {
  private readonly store: LocalForage;
  private lastAutoSaveTime: number = 0;

  constructor() {
    this.store = localforage.createInstance({
      name: STORE_NAME,
      storeName: STORE_NAME,
    });
  }

  /** Persist a full game state payload to IndexedDB. */
  async saveGame(payload: SaveGameStatePayload): Promise<void> {
    const key = SAVE_KEY_PREFIX + payload.metadata.id;
    await this.store.setItem(key, payload);
  }

  /** Retrieve a saved game state from IndexedDB by its save ID. */
  async loadGame(id: string): Promise<SaveGameStatePayload | null> {
    const key = SAVE_KEY_PREFIX + id;
    return await this.store.getItem<SaveGameStatePayload>(key);
  }

  /** Export a saved game as a JSON-encoded ArrayBuffer. */
  async exportSaveToJSON(id: string): Promise<ArrayBuffer> {
    const payload = await this.loadGame(id);
    if (payload === null) {
      throw new Error('Save game with id "' + id + '" not found.');
    }
    const jsonString = JSON.stringify(payload);
    const encoded = new TextEncoder().encode(jsonString);
    const buffer = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(buffer).set(encoded);
    return buffer;
  }

  /** Import a game state from a JSON-encoded ArrayBuffer and persist it. */
  async importSaveFromJSON(data: ArrayBuffer): Promise<SaveGameStatePayload> {
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(data);
    const payload = JSON.parse(jsonString) as SaveGameStatePayload;
    await this.saveGame(payload);
    return payload;
  }

  /**
   * Throttled auto-save: skips writes within a cooldown window.
   * @param state - Current game state to persist.
   */
  async autoSave(state: SaveGameStatePayload): Promise<void> {
    const now = Date.now();
    if (now - this.lastAutoSaveTime < AUTO_SAVE_THROTTLE_MS) {
      return;
    }
    this.lastAutoSaveTime = now;
    await this.saveGame(state);
  }
}

/** Pre-configured singleton instance using default localForage store. */
export const saveSystem: ISaveController = new SaveSystem();
