import type { GalleryStore } from '../storage/GalleryStore';
import { SyncClient, type SyncTransport } from './SyncClient';
import { MemorySyncTransport } from './MemorySyncTransport';
import { SupabaseSyncTransport } from './SupabaseSyncTransport';
import type { SyncBackendKind } from './types';

export function createSyncTransport(kind?: SyncBackendKind): SyncTransport {
  const resolved =
    kind ??
    (import.meta.env.VITE_SYNC_BACKEND as SyncBackendKind | undefined) ??
    'memory';

  switch (resolved) {
    case 'supabase':
      return new SupabaseSyncTransport();
    case 'memory':
    default:
      return new MemorySyncTransport();
  }
}

export function createSyncClient(store: GalleryStore, kind?: SyncBackendKind): SyncClient {
  return new SyncClient(store, createSyncTransport(kind));
}
