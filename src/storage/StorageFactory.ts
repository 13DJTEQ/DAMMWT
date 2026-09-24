import type { StorageBackend, StorageBackendConfig } from './StorageBackend';
import { FalBackend } from './FalBackend';
import { LocalBackend } from './LocalBackend';

/**
 * Factory for pluggable storage backends.
 * New sources register here without changing core review/DB code.
 */
export class StorageFactory {
  static create(config: StorageBackendConfig): StorageBackend {
    switch (config.type) {
      case 'fal.ai':
        return new FalBackend(config);
      case 'local':
        return new LocalBackend(config);
      case 'replit':
      case 'comfyui':
        throw new Error(
          `Storage backend "${config.type}" is stubbed for Days 2–3 and is not implemented yet.`
        );
      default: {
        const exhaustive: never = config;
        throw new Error(`Unknown storage backend: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
}
