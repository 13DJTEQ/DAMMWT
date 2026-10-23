import type { GalleryStore, GalleryStoreKind } from './GalleryStore';
import { IndexedDbGalleryStore } from './IndexedDbGalleryStore';
import { MemoryGalleryStore } from './MemoryGalleryStore';
import { SupabaseGalleryStore } from './SupabaseGalleryStore';

export function createGalleryStore(kind?: GalleryStoreKind): GalleryStore {
  const resolved =
    kind ??
    (import.meta.env.VITE_GALLERY_STORE as GalleryStoreKind | undefined) ??
    'memory';

  switch (resolved) {
    case 'indexeddb':
      return new IndexedDbGalleryStore();
    case 'supabase':
      return new SupabaseGalleryStore();
    case 'memory':
    default:
      return new MemoryGalleryStore();
  }
}
