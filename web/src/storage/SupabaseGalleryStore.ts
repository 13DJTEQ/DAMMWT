import type { GalleryAsset } from '../domain/gallery';
import type { DecideInput, GalleryStore } from './GalleryStore';

/**
 * Cloud store stub — default cloud backend is Supabase (Postgres).
 *
 * Wire-up when ready:
 * 1. Create a `gallery_assets` table matching `GalleryAsset`
 * 2. Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
 * 3. Replace the thrown methods with `@supabase/supabase-js` calls
 *
 * Firebase / other document stores can implement the same `GalleryStore`
 * interface; they are intentionally not defaulted here.
 */
export class SupabaseGalleryStore implements GalleryStore {
  readonly kind = 'supabase' as const;
  private readonly url: string | undefined;
  private readonly anonKey: string | undefined;

  constructor(
    url = import.meta.env.VITE_SUPABASE_URL,
    anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY,
  ) {
    this.url = url;
    this.anonKey = anonKey;
  }

  private notConfigured(): never {
    throw new Error(
      'SupabaseGalleryStore is a stub. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY and implement REST/SDK calls (see docs/WEB-SYNC.md).',
    );
  }

  async list(): Promise<GalleryAsset[]> {
    if (!this.url || !this.anonKey) this.notConfigured();
    this.notConfigured();
  }

  async get(_assetId: string): Promise<GalleryAsset | null> {
    this.notConfigured();
  }

  async upsert(_asset: GalleryAsset): Promise<GalleryAsset> {
    this.notConfigured();
  }

  async decide(_input: DecideInput): Promise<GalleryAsset> {
    this.notConfigured();
  }

  async replaceAll(_assets: GalleryAsset[]): Promise<void> {
    this.notConfigured();
  }

  async healthCheck(): Promise<boolean> {
    return Boolean(this.url && this.anonKey);
  }
}
