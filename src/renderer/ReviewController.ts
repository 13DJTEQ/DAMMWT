/**
 * Headless review workspace controller — shared by App and verify-day34.
 * Owns queue/stats load + decision refresh so UI and tests share one data path.
 */
import {
  getDamApi,
  type ApprovalHistoryRow,
  type DamApi,
  type QueueStats,
  type ReviewQueueRow,
  type ReviewStatus,
  type SubmitApprovalInput,
} from './damApi';

export type QueueFilter = ReviewStatus | 'all';
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface ReviewControllerSnapshot {
  loadState: LoadState;
  error: string | null;
  filter: QueueFilter;
  queue: ReviewQueueRow[];
  stats: QueueStats | null;
  selectedAssetId: string | null;
  selected: ReviewQueueRow | null;
  history: ApprovalHistoryRow[];
  busy: boolean;
}

type Listener = (snapshot: ReviewControllerSnapshot) => void;

const EMPTY_STATS: QueueStats = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  changesRequested: 0,
};

export class ReviewController {
  private api: DamApi;
  private loadState: LoadState = 'idle';
  private error: string | null = null;
  private filter: QueueFilter = 'pending';
  private queue: ReviewQueueRow[] = [];
  private stats: QueueStats | null = null;
  private selectedAssetId: string | null = null;
  private history: ApprovalHistoryRow[] = [];
  private busy = false;
  private listeners = new Set<Listener>();

  constructor(api?: DamApi) {
    this.api = api ?? getDamApi();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): ReviewControllerSnapshot {
    const selected =
      this.queue.find((row) => row.assetId === this.selectedAssetId) ?? null;
    return {
      loadState: this.loadState,
      error: this.error,
      filter: this.filter,
      queue: this.queue,
      stats: this.stats,
      selectedAssetId: this.selectedAssetId,
      selected,
      history: this.history,
      busy: this.busy,
    };
  }

  setFilter(filter: QueueFilter): Promise<void> {
    this.filter = filter;
    return this.refresh();
  }

  selectAsset(assetId: string | null): void {
    this.selectedAssetId = assetId;
    this.emit();
    if (assetId) {
      void this.loadHistory(assetId);
    } else {
      this.history = [];
      this.emit();
    }
  }

  async refresh(): Promise<void> {
    this.loadState = 'loading';
    this.error = null;
    this.emit();

    try {
      const status = this.filter === 'all' ? undefined : this.filter;
      const [queue, stats] = await Promise.all([
        this.api.getReviewQueue(status),
        this.api.getQueueStats(),
      ]);
      this.queue = queue;
      this.stats = stats;

      if (
        this.selectedAssetId &&
        !queue.some((row) => row.assetId === this.selectedAssetId)
      ) {
        this.selectedAssetId = queue[0]?.assetId ?? null;
      } else if (!this.selectedAssetId && queue.length > 0) {
        this.selectedAssetId = queue[0].assetId;
      }

      if (this.selectedAssetId) {
        this.history = await this.api.getAssetVersionHistory(this.selectedAssetId);
      } else {
        this.history = [];
      }

      this.loadState = 'ready';
      this.emit();
    } catch (err) {
      this.loadState = 'error';
      this.error = err instanceof Error ? err.message : String(err);
      this.emit();
      throw err;
    }
  }

  async submitApproval(
    input: Omit<SubmitApprovalInput, 'assetId'> & { assetId?: string }
  ): Promise<ReviewQueueRow> {
    const assetId = input.assetId ?? this.selectedAssetId;
    if (!assetId) {
      throw new Error('No asset selected for approval');
    }

    this.busy = true;
    this.error = null;
    this.emit();

    try {
      const updated = await this.api.submitApproval({
        assetId,
        decision: input.decision,
        reviewedBy: input.reviewedBy,
        notes: input.notes,
      });
      await this.refresh();
      return updated;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.emit();
      throw err;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async resubmitSelected(
    newSourceIdentifier: string,
    previewUrl: string
  ): Promise<ReviewQueueRow> {
    if (!this.selectedAssetId) {
      throw new Error('No asset selected for resubmit');
    }

    this.busy = true;
    this.error = null;
    this.emit();

    try {
      const updated = await this.api.resubmitAsset(
        this.selectedAssetId,
        newSourceIdentifier,
        previewUrl
      );
      await this.refresh();
      return updated;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.emit();
      throw err;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  private async loadHistory(assetId: string): Promise<void> {
    try {
      this.history = await this.api.getAssetVersionHistory(assetId);
      this.emit();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.emit();
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  /** Convenience for tests when stats have not loaded yet. */
  static emptyStats(): QueueStats {
    return { ...EMPTY_STATS };
  }
}
