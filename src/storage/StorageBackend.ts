/**
 * Pluggable storage backend contract for DAM Phase 1.
 * All backends return a normalized Asset; no UI or DB coupling.
 */

export type SourceBackendType = 'fal.ai' | 'local' | 'replit' | 'comfyui';

export interface Asset {
  /** Stable asset id within the backend (path, job id, or URL key). */
  id: string;
  sourceBackend: SourceBackendType;
  sourceIdentifier: string;
  previewUrl: string;
  /** Optional display / workflow metadata */
  projectTag?: string;
  tags?: string[];
  description?: string;
  mimeType?: string;
  byteSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StorageBackend {
  /** Fetch a single asset by backend-native source id. */
  getAsset(sourceId: string): Promise<Asset>;

  /** List most recently seen assets (newest first). */
  listRecent(limit: number): Promise<Asset[]>;

  /**
   * Copy/mark asset into the 30-day retention tier.
   * @returns retention identifier used later for cold storage.
   */
  archiveForRetention(sourceId: string): Promise<string>;

  /**
   * Move a retention object into cold storage.
   * @returns cold-storage URL / locator.
   */
  moveToColdstorage(retentionId: string): Promise<string>;

  /** Cheap connectivity / path sanity check. */
  healthCheck(): Promise<boolean>;
}

export interface FalBackendConfig {
  type: 'fal.ai';
  /** fal.ai API key; falls back to process.env.FAL_KEY when omitted. */
  apiKey?: string;
  /** Base API URL (default https://api.fal.ai). */
  baseUrl?: string;
}

export interface LocalBackendConfig {
  type: 'local';
  /** Root directory scanned for assets. */
  localPath: string;
}

export interface StubBackendConfig {
  type: 'replit' | 'comfyui';
}

export type StorageBackendConfig =
  | FalBackendConfig
  | LocalBackendConfig
  | StubBackendConfig;
