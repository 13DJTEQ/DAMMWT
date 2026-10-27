import type { GalleryAsset } from '../domain/gallery';

export type SyncBackendKind = 'memory' | 'supabase';

export type SyncPhase = 'idle' | 'pulling' | 'pushing' | 'error';

export interface SyncCursor {
  /** Opaque watermark from the remote (revision / updatedAt / server token). */
  since: string;
}

export interface SyncPullResult {
  assets: GalleryAsset[];
  cursor: SyncCursor;
}

export interface SyncPushResult {
  accepted: string[];
  rejected: Array<{ assetId: string; reason: string }>;
  cursor: SyncCursor;
}

export interface SyncStatusSnapshot {
  phase: SyncPhase;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
  lastError: string | null;
  pendingPushCount: number;
  backend: SyncBackendKind;
}
