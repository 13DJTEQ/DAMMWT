import type { GalleryAsset, SubmitDecision } from '../domain/gallery';

/**
 * Pluggable persistence for gallery assets.
 *
 * - `memory` — in-process stub (default for `npm run web:dev`)
 * - `indexeddb` — local browser persistence
 * - `supabase` — cloud Postgres via Supabase (stub until credentials exist)
 */
export type GalleryStoreKind = 'memory' | 'indexeddb' | 'supabase';

export interface DecideInput {
  assetId: string;
  decision: SubmitDecision;
  notes?: string;
  reviewedBy: string;
  writerId: string;
}

export interface GalleryStore {
  readonly kind: GalleryStoreKind;
  list(): Promise<GalleryAsset[]>;
  get(assetId: string): Promise<GalleryAsset | null>;
  upsert(asset: GalleryAsset): Promise<GalleryAsset>;
  decide(input: DecideInput): Promise<GalleryAsset>;
  /** Replace all local rows with a remote snapshot (used after pull). */
  replaceAll(assets: GalleryAsset[]): Promise<void>;
  healthCheck(): Promise<boolean>;
}
