import type { GalleryAsset } from '../domain/gallery';
import type { SyncTransport } from './SyncClient';
import type { SyncCursor, SyncPullResult, SyncPushResult } from './types';

/**
 * Cloud sync stub targeting Supabase Realtime / PostgREST.
 * Implement with `@supabase/supabase-js` once project credentials exist.
 * Firebase is a documented alternative backend, not the default.
 */
export class SupabaseSyncTransport implements SyncTransport {
  readonly kind = 'supabase' as const;

  constructor(
    private readonly url = import.meta.env.VITE_SUPABASE_URL,
    private readonly anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY,
  ) {}

  private notConfigured(): never {
    throw new Error(
      'SupabaseSyncTransport stub: configure VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (docs/WEB-SYNC.md).',
    );
  }

  async pull(_cursor: SyncCursor): Promise<SyncPullResult> {
    if (!this.url || !this.anonKey) this.notConfigured();
    this.notConfigured();
  }

  async push(_assets: GalleryAsset[], _cursor: SyncCursor): Promise<SyncPushResult> {
    this.notConfigured();
  }
}
