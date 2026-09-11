/**
 * Persistent storage type definitions.
 * Defines the save/load contract between the simulation layer and
 * the localForage (IndexedDB) backed persistence system.
 */

import type { PlayerState } from './player';
import type { WorldChunk } from './world';

/**
 * Metadata describing a single save file.
 */
export interface SaveMetadata {
  id: string;
  createdAt: number;
  updatedAt: number;
  playerName: string;
  gameTime: number;
  version: string;
}

/**
 * Complete serializable game state payload for persistence.
 * Contains all data needed to restore a running simulation from disk.
 */
export interface SaveGameStatePayload {
  metadata: SaveMetadata;
  playerState: PlayerState;
  worldChunks: WorldChunk[];
}

/**
 * Interface for the save controller system.
 * Wraps localForage IndexedDB with async load/save and
 * compressed JSON/JSON export/import utilities.
 */
export interface ISaveController {
  saveGame(payload: SaveGameStatePayload): Promise<void>;
  loadGame(id: string): Promise<SaveGameStatePayload | null>;
  exportSaveToJSON(id: string): Promise<ArrayBuffer>;
  importSaveFromJSON(data: ArrayBuffer): Promise<SaveGameStatePayload>;
  autoSave(state: SaveGameStatePayload): Promise<void>;
}
