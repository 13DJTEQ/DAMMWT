/**
 * Typed DAM API contract for the renderer.
 * Preload exposes these on `window.damApi`; verify/tests inject a mock.
 */
import type {
  ApprovalHistoryRow,
  IngestAssetInput,
  MediaPartition,
  QueueStats,
  ReviewQueueRow,
  ReviewStatus,
  SubmitApprovalInput,
} from '../database/DatabaseManager';
import type { ShellActionResult } from '../ipc/shellSafe';

export type {
  ApprovalHistoryRow,
  IngestAssetInput,
  MediaPartition,
  QueueStats,
  ReviewQueueRow,
  ReviewStatus,
  SubmitApprovalInput,
};
export type { ShellActionResult };

export interface RefreshMediaResult {
  inserted: number;
  skipped: number;
  total: number;
}

/** Renderer-facing API — always async so IPC and in-memory mocks share one shape. */
export interface DamApi {
  ingestAsset(input: IngestAssetInput): Promise<ReviewQueueRow>;
  getReviewQueue(status?: ReviewStatus): Promise<ReviewQueueRow[]>;
  submitApproval(input: SubmitApprovalInput): Promise<ReviewQueueRow>;
  getQueueStats(): Promise<QueueStats>;
  getAssetVersionHistory(assetId: string): Promise<ApprovalHistoryRow[]>;
  resubmitAsset(
    assetId: string,
    newSourceIdentifier: string,
    previewUrl: string
  ): Promise<ReviewQueueRow>;
  revealInFolder?(localPath: string): Promise<ShellActionResult>;
  openLocalPath?(localPath: string): Promise<ShellActionResult>;
  openCloudUrl?(cloudUrl: string): Promise<ShellActionResult>;
  /** Main-process re-seed from manifest (optional — Electron only). */
  refreshMedia?(): Promise<RefreshMediaResult>;
  /** Registered project slugs from manifest.projects[] (optional — Electron). */
  getMediaProjects?(): Promise<string[]>;
  /** Subscribe to `media:updated` from main (optional — Electron only). */
  onMediaUpdated?(callback: () => void): () => void;
}

declare global {
  interface Window {
    damApi?: DamApi;
  }
}

let injectedApi: DamApi | null = null;

/** Inject a mock (verify scripts) or clear to fall back to `window.damApi`. */
export function setDamApi(api: DamApi | null): void {
  injectedApi = api;
}

export function getDamApi(): DamApi {
  if (injectedApi) {
    return injectedApi;
  }
  if (typeof window !== 'undefined' && window.damApi) {
    return window.damApi;
  }
  throw new Error(
    'damApi is not available. Expose window.damApi from preload or call setDamApi().'
  );
}

const SHELL_STUB = async (): Promise<ShellActionResult> => ({
  ok: false,
  error: 'Shell actions are not available in this context',
});

/** Wrap a sync DatabaseManager (or compatible) as DamApi. */
export function createDamApiFromDb(db: {
  ingestAsset(input: IngestAssetInput): ReviewQueueRow;
  getReviewQueue(status?: ReviewStatus): ReviewQueueRow[];
  submitApproval(input: SubmitApprovalInput): ReviewQueueRow;
  getQueueStats(): QueueStats;
  getAssetVersionHistory(assetId: string): ApprovalHistoryRow[];
  resubmitAsset(
    assetId: string,
    newSourceIdentifier: string,
    previewUrl: string
  ): ReviewQueueRow;
}): DamApi {
  return {
    ingestAsset: async (input) => db.ingestAsset(input),
    getReviewQueue: async (status) => db.getReviewQueue(status),
    submitApproval: async (input) => db.submitApproval(input),
    getQueueStats: async () => db.getQueueStats(),
    getAssetVersionHistory: async (assetId) => db.getAssetVersionHistory(assetId),
    resubmitAsset: async (assetId, newSourceIdentifier, previewUrl) =>
      db.resubmitAsset(assetId, newSourceIdentifier, previewUrl),
    revealInFolder: SHELL_STUB,
    openLocalPath: SHELL_STUB,
    openCloudUrl: SHELL_STUB,
  };
}
