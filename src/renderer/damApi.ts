/**
 * Typed DAM API contract for the renderer.
 * Day 2 preload exposes these on `window.damApi`; verify/tests inject a mock.
 */
import type {
  ApprovalHistoryRow,
  IngestAssetInput,
  QueueStats,
  ReviewQueueRow,
  ReviewStatus,
  SubmitApprovalInput,
} from '../database/DatabaseManager';

export type {
  ApprovalHistoryRow,
  IngestAssetInput,
  QueueStats,
  ReviewQueueRow,
  ReviewStatus,
  SubmitApprovalInput,
};

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
  };
}
