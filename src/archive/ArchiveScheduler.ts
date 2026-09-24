import type { StorageBackend } from '../storage/StorageBackend';
import type {
  ArchiveJobRow,
  DatabaseManager,
  ReviewQueueRow,
} from '../database/DatabaseManager';

export interface ArchiveJobResult {
  jobId: number;
  assetId?: string;
  ok: boolean;
  retentionIdentifier?: string;
  coldstorageUrl?: string;
  error?: string;
}

export type BackendResolver = (row: ReviewQueueRow) => StorageBackend;

/**
 * Processes due ArchiveJob rows: retention tier → cold storage → job update.
 * Call processDueJobs() on a timer or once from verify scripts.
 */
export class ArchiveScheduler {
  constructor(
    private readonly db: DatabaseManager,
    private readonly resolveBackend: BackendResolver
  ) {}

  /**
   * Poll and process all jobs with status=scheduled and scheduledAt <= now.
   */
  async processDueJobs(now: Date = new Date()): Promise<ArchiveJobResult[]> {
    const due = this.db.listDueArchiveJobs(now.toISOString());
    const results: ArchiveJobResult[] = [];
    for (const job of due) {
      results.push(await this.processJob(job));
    }
    return results;
  }

  private async processJob(job: ArchiveJobRow): Promise<ArchiveJobResult> {
    this.db.updateArchiveJob(job.id, { status: 'in-progress', error: null });

    try {
      const review = this.db.getReviewQueueById(job.reviewQueueId);
      if (!review) {
        throw new Error(`ReviewQueue row missing for job ${job.id}`);
      }

      const backend = this.resolveBackend(review);
      const retentionIdentifier = await backend.archiveForRetention(
        review.sourceIdentifier
      );
      const coldstorageUrl = await backend.moveToColdstorage(retentionIdentifier);

      this.db.updateArchiveJob(job.id, {
        status: 'completed',
        retentionIdentifier,
        coldstorageUrl,
        error: null,
      });

      return {
        jobId: job.id,
        assetId: review.assetId,
        ok: true,
        retentionIdentifier,
        coldstorageUrl,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.db.updateArchiveJob(job.id, {
        status: 'failed',
        error: message,
      });
      return {
        jobId: job.id,
        ok: false,
        error: message,
      };
    }
  }
}
