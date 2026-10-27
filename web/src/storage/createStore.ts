import { loadManifestSeed } from '../media/manifest';
import type { GalleryStore, GalleryStoreKind } from './GalleryStore';
import { IndexedDbGalleryStore } from './IndexedDbGalleryStore';
import { MemoryGalleryStore } from './MemoryGalleryStore';
import { SupabaseGalleryStore } from './SupabaseGalleryStore';

function resolveKind(kind?: GalleryStoreKind): GalleryStoreKind {
  return (
    kind ??
    (import.meta.env.VITE_GALLERY_STORE as GalleryStoreKind | undefined) ??
    'memory'
  );
}

/**
 * Create a gallery store seeded from `/media/manifest.json` when available.
 * Falls back to demo picsum rows only if the manifest is missing.
 */
export async function createGalleryStore(
  kind?: GalleryStoreKind,
): Promise<GalleryStore> {
  const resolved = resolveKind(kind);
  const seed = await loadManifestSeed(`seed-${resolved}`);

  switch (resolved) {
    case 'indexeddb': {
      const store = new IndexedDbGalleryStore(seed);
      // Ensure IDB is populated when empty (seed passed for memory fallback too).
      await store.list();
      return store;
    }
    case 'supabase':
      return new SupabaseGalleryStore();
    case 'memory':
    default:
      return new MemoryGalleryStore('memory-seed', seed);
  }
}
