/**
 * Gallery V1 decision model — mirrors Electron `src/database/DatabaseManager.ts`
 * and renderer `GalleryDecision`. Keep this file free of Node/Electron imports
 * so the web app can share the same vocabulary without pulling better-sqlite3.
 */

export type GalleryDecision =
  | 'pending'
  | 'love'
  | 'keep'
  | 'reject'
  | 'changesRequested';

/** Decisions the reviewer can submit from the web UI. */
export type SubmitDecision = Exclude<GalleryDecision, 'pending'>;

export type SourceBackendType = 'fal.ai' | 'local' | 'replit' | 'comfyui' | 'web';

/** Curated media partitions (manifest + gallery sections). */
export type MediaPartition = 'originals' | 'tattoos' | 'generated';

/**
 * Syncable gallery record. `revision` increments on every local mutation and is
 * the primary ordering key for conflict resolution (see sync/conflict.ts).
 */
export interface GalleryAsset {
  id: string;
  assetId: string;
  status: GalleryDecision;
  version: number;
  revision: number;
  sourceBackend: SourceBackendType;
  sourceIdentifier: string;
  previewUrl: string;
  /** Repo-relative or absolute path for copy-path UI (browser cannot open Finder). */
  localPath?: string | null;
  /** Optional Notion / Drive / Supabase / CDN URL. */
  cloudUrl?: string | null;
  projectTag: string | null;
  /** Project section slug when known (manifest.project / projects/<slug>/). */
  project?: string | null;
  tags: string[];
  description: string | null;
  notes: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Client that last wrote this record (device / browser tab id). */
  lastWriterId: string;
  /** Human title from curated manifest (optional for legacy/demo rows). */
  title?: string | null;
  /** Gallery section: Originals / SoT, Tattoos, or Generated. */
  partition?: MediaPartition;
  /**
   * Parent asset in generation history. Trace toward Source of Truth by
   * walking this id until null (original / seed).
   */
  parentSourceId?: string | null;
  batch?: string | null;
  report?: string | null;
}

export interface GalleryStats {
  total: number;
  pending: number;
  love: number;
  keep: number;
  reject: number;
  changesRequested: number;
}

export function computeStats(assets: readonly GalleryAsset[]): GalleryStats {
  const stats: GalleryStats = {
    total: assets.length,
    pending: 0,
    love: 0,
    keep: 0,
    reject: 0,
    changesRequested: 0,
  };
  for (const asset of assets) {
    stats[asset.status] += 1;
  }
  return stats;
}

export function decisionLabel(decision: GalleryDecision): string {
  switch (decision) {
    case 'love':
      return 'Love';
    case 'keep':
      return 'Keep';
    case 'reject':
      return 'Reject';
    case 'changesRequested':
      return 'Changes requested';
    case 'pending':
      return 'Pending';
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
}
