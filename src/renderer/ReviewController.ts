/**
 * Gallery V1 review controller — shared by App and verify scripts.
 * Owns queue/stats load + love/keep/reject decisions with notes.
 * Partition / project filters are client-side on the full queue so lineage
 * jumps can resolve parent Source-of-Truth rows.
 */
import {
  collectProjectSlugs,
  resolveProjectSlug,
} from '../media/projectSlug';
import {
  getDamApi,
  type ApprovalHistoryRow,
  type DamApi,
  type MediaPartition,
  type QueueStats,
  type ReviewQueueRow,
  type ReviewStatus,
  type SubmitApprovalInput,
} from './damApi';

export type QueueFilter = ReviewStatus | 'all';
export type PartitionFilter = MediaPartition | 'all';
/** `all` = no project constraint; otherwise match resolveProjectSlug. */
export type ProjectFilter = 'all' | string;
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface ReviewControllerSnapshot {
  loadState: LoadState;
  error: string | null;
  filter: QueueFilter;
  partitionFilter: PartitionFilter;
  projectFilter: ProjectFilter;
  /**
   * Project slugs from manifest.projects[] plus any discovered in the catalog.
   * Empty registered sections still appear so dam:section is visible before push.
   */
  availableProjects: string[];
  queue: ReviewQueueRow[];
  /** Unfiltered catalog for lineage lookups (parent Source of Truth). */
  catalog: ReviewQueueRow[];
  stats: QueueStats | null;
  selectedAssetId: string | null;
  selected: ReviewQueueRow | null;
  parentAsset: ReviewQueueRow | null;
  history: ApprovalHistoryRow[];
  busy: boolean;
  notesDraft: string;
}

type Listener = (snapshot: ReviewControllerSnapshot) => void;

const EMPTY_STATS: QueueStats = {
  total: 0,
  pending: 0,
  love: 0,
  keep: 0,
  reject: 0,
  changesRequested: 0,
};

export class ReviewController {
  private api: DamApi;
  private loadState: LoadState = 'idle';
  private error: string | null = null;
  /** Default `all` so newly pushed / already-reviewed assets are not hidden. */
  private filter: QueueFilter = 'all';
  private partitionFilter: PartitionFilter = 'all';
  private projectFilter: ProjectFilter = 'all';
  private catalog: ReviewQueueRow[] = [];
  private queue: ReviewQueueRow[] = [];
  private registeredProjects: string[] = [];
  private stats: QueueStats | null = null;
  private selectedAssetId: string | null = null;
  private history: ApprovalHistoryRow[] = [];
  private busy = false;
  private notesDraft = '';
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
      this.catalog.find((row) => row.assetId === this.selectedAssetId) ??
      this.queue.find((row) => row.assetId === this.selectedAssetId) ??
      null;
    const parentAsset =
      selected?.parentSourceId != null
        ? this.catalog.find((row) => row.assetId === selected.parentSourceId) ??
          null
        : null;
    return {
      loadState: this.loadState,
      error: this.error,
      filter: this.filter,
      partitionFilter: this.partitionFilter,
      projectFilter: this.projectFilter,
      availableProjects: collectProjectSlugs(
        this.catalog,
        this.registeredProjects
      ),
      queue: this.queue,
      catalog: this.catalog,
      stats: this.stats,
      selectedAssetId: this.selectedAssetId,
      selected,
      parentAsset,
      history: this.history,
      busy: this.busy,
      notesDraft: this.notesDraft,
    };
  }

  setFilter(filter: QueueFilter): Promise<void> {
    this.filter = filter;
    return this.refresh();
  }

  setPartitionFilter(partitionFilter: PartitionFilter): Promise<void> {
    this.partitionFilter = partitionFilter;
    return this.refresh();
  }

  setProjectFilter(projectFilter: ProjectFilter): Promise<void> {
    this.projectFilter = projectFilter;
    // Project nav should show every status in that section by default.
    if (projectFilter !== 'all' && this.filter === 'pending') {
      this.filter = 'all';
    }
    return this.refresh();
  }

  setNotesDraft(notes: string): void {
    this.notesDraft = notes;
    this.emit();
  }

  selectAsset(assetId: string | null): void {
    this.selectedAssetId = assetId;
    this.notesDraft = '';
    this.emit();
    if (assetId) {
      void this.loadHistory(assetId);
    } else {
      this.history = [];
      this.emit();
    }
  }

  /**
   * Jump to a lineage parent (Source of Truth): clear filters and select.
   */
  async revealAsset(assetId: string): Promise<void> {
    this.filter = 'all';
    this.partitionFilter = 'all';
    this.projectFilter = 'all';
    await this.refresh();
    this.selectAsset(assetId);
  }

  async refresh(): Promise<void> {
    this.loadState = 'loading';
    this.error = null;
    this.emit();

    try {
      const projectsPromise = this.api.getMediaProjects
        ? this.api.getMediaProjects()
        : Promise.resolve([] as string[]);
      const [catalog, stats, registered] = await Promise.all([
        this.api.getReviewQueue(),
        this.api.getQueueStats(),
        projectsPromise,
      ]);
      this.catalog = catalog;
      this.stats = stats;
      this.registeredProjects = Array.isArray(registered)
        ? registered.filter((s) => typeof s === 'string' && s.trim())
        : [];
      this.queue = this.applyFilters(catalog);

      if (
        this.selectedAssetId &&
        !catalog.some((row) => row.assetId === this.selectedAssetId)
      ) {
        this.selectedAssetId = this.queue[0]?.assetId ?? null;
        this.notesDraft = '';
      } else if (!this.selectedAssetId && this.queue.length > 0) {
        this.selectedAssetId = this.queue[0].assetId;
        this.notesDraft = '';
      } else if (
        this.selectedAssetId &&
        !this.queue.some((row) => row.assetId === this.selectedAssetId) &&
        this.queue.length > 0
      ) {
        /* Keep selection if it exists in catalog but is filtered out of list;
           only auto-pick when nothing selected. */
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
    input: Omit<SubmitApprovalInput, 'assetId' | 'notes'> & {
      assetId?: string;
      notes?: string;
    }
  ): Promise<ReviewQueueRow> {
    const assetId = input.assetId ?? this.selectedAssetId;
    if (!assetId) {
      throw new Error('No asset selected for approval');
    }

    const notes =
      input.notes !== undefined ? input.notes : this.notesDraft.trim() || undefined;

    this.busy = true;
    this.error = null;
    this.emit();

    try {
      const updated = await this.api.submitApproval({
        assetId,
        decision: input.decision,
        reviewedBy: input.reviewedBy,
        notes,
      });
      this.notesDraft = '';
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

  private applyFilters(rows: ReviewQueueRow[]): ReviewQueueRow[] {
    const known = this.registeredProjects;
    return rows.filter((row) => {
      const statusOk = this.filter === 'all' || row.status === this.filter;
      const partitionOk =
        this.partitionFilter === 'all' ||
        row.partition === this.partitionFilter;
      const projectOk =
        this.projectFilter === 'all' ||
        resolveProjectSlug(row, known) === this.projectFilter;
      return statusOk && partitionOk && projectOk;
    });
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

  static emptyStats(): QueueStats {
    return { ...EMPTY_STATS };
  }
}
