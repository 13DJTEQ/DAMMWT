import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { SourceBackendType } from '../storage/StorageBackend';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'changesRequested';
export type ApprovalDecision = ReviewStatus;

export interface IngestAssetInput {
  assetId: string;
  sourceBackend: SourceBackendType;
  sourceIdentifier: string;
  previewUrl: string;
  projectTag?: string;
  tags?: string[];
  designatedReviewer?: string;
  description?: string;
}

export interface SubmitApprovalInput {
  assetId: string;
  decision: Exclude<ApprovalDecision, 'pending'>;
  reviewedBy: string;
  notes?: string;
}

export interface ReviewQueueRow {
  id: number;
  assetId: string;
  status: ReviewStatus;
  version: number;
  sourceBackend: SourceBackendType;
  sourceIdentifier: string;
  previewUrl: string;
  projectTag: string | null;
  tags: string | null;
  designatedReviewer: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  archiveScheduledAt: string | null;
}

export interface ApprovalHistoryRow {
  id: number;
  reviewQueueId: number;
  version: number;
  decision: ApprovalDecision;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string;
}

export interface QueueStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  changesRequested: number;
}

/**
 * SQLite manager for review queue, approval audit trail, and archive jobs.
 * Uses WAL mode for atomic writes (avoids JSON persistence brittleness).
 */
export class DatabaseManager {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    const schemaPath = this.resolveSchemaPath();
    const ddl = readFileSync(schemaPath, 'utf8');
    this.db.exec(ddl);
  }

  private resolveSchemaPath(): string {
    const candidates = [
      join(__dirname, 'schema.sql'),
      join(__dirname, '..', '..', 'src', 'database', 'schema.sql'),
      join(process.cwd(), 'src', 'database', 'schema.sql'),
      join(process.cwd(), 'dist', 'database', 'schema.sql'),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    throw new Error('schema.sql not found; run npm run build to copy schema into dist/');
  }

  /**
   * Add an asset to the review queue at version 1 (pending).
   */
  ingestAsset(input: IngestAssetInput): ReviewQueueRow {
    const insert = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO ReviewQueue (
            assetId, status, version, sourceBackend, sourceIdentifier,
            previewUrl, projectTag, tags, designatedReviewer, description
          ) VALUES (
            @assetId, 'pending', 1, @sourceBackend, @sourceIdentifier,
            @previewUrl, @projectTag, @tags, @designatedReviewer, @description
          )`
        )
        .run({
          assetId: input.assetId,
          sourceBackend: input.sourceBackend,
          sourceIdentifier: input.sourceIdentifier,
          previewUrl: input.previewUrl,
          projectTag: input.projectTag ?? null,
          tags: input.tags ? JSON.stringify(input.tags) : null,
          designatedReviewer: input.designatedReviewer ?? null,
          description: input.description ?? null,
        });

      const reviewQueueId = Number(result.lastInsertRowid);
      this.db
        .prepare(
          `INSERT INTO ApprovalHistory (
            reviewQueueId, version, decision, notes, reviewedBy
          ) VALUES (?, 1, 'pending', NULL, NULL)`
        )
        .run(reviewQueueId);

      const created = this.getByAssetId(input.assetId);
      if (!created) {
        throw new Error(`Failed to load ingested asset: ${input.assetId}`);
      }
      return created;
    });

    return insert();
  }

  /**
   * Transactional approval: update queue status + write history row.
   * Approvals schedule a 30-day archive job.
   * changesRequested leaves the asset awaiting resubmit (version stays until resubmit).
   */
  submitApproval(input: SubmitApprovalInput): ReviewQueueRow {
    const run = this.db.transaction(() => {
      const row = this.getByAssetId(input.assetId);
      if (!row) {
        throw new Error(`Unknown assetId: ${input.assetId}`);
      }
      if (row.status !== 'pending' && row.status !== 'changesRequested') {
        throw new Error(
          `Cannot submit approval for asset ${input.assetId} in status ${row.status}`
        );
      }

      const archiveScheduledAt =
        input.decision === 'approved'
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null;

      this.db
        .prepare(
          `UPDATE ReviewQueue
           SET status = @status,
               updatedAt = datetime('now'),
               archiveScheduledAt = @archiveScheduledAt
           WHERE assetId = @assetId`
        )
        .run({
          status: input.decision,
          archiveScheduledAt,
          assetId: input.assetId,
        });

      this.db
        .prepare(
          `INSERT INTO ApprovalHistory (
            reviewQueueId, version, decision, notes, reviewedBy
          ) VALUES (@reviewQueueId, @version, @decision, @notes, @reviewedBy)`
        )
        .run({
          reviewQueueId: row.id,
          version: row.version,
          decision: input.decision,
          notes: input.notes ?? null,
          reviewedBy: input.reviewedBy,
        });

      if (input.decision === 'approved' && archiveScheduledAt) {
        this.db
          .prepare(
            `INSERT INTO ArchiveJob (
              reviewQueueId, status, scheduledAt
            ) VALUES (?, 'scheduled', ?)`
          )
          .run(row.id, archiveScheduledAt);
      }

      return this.getByAssetId(input.assetId)!;
    });

    return run();
  }

  /**
   * Resubmit after changesRequested: bump version, reset to pending.
   */
  resubmitAsset(
    assetId: string,
    newSourceIdentifier: string,
    previewUrl: string
  ): ReviewQueueRow {
    const run = this.db.transaction(() => {
      const row = this.getByAssetId(assetId);
      if (!row) {
        throw new Error(`Unknown assetId: ${assetId}`);
      }
      if (row.status !== 'changesRequested') {
        throw new Error(`Asset ${assetId} is not awaiting changes (status=${row.status})`);
      }

      const nextVersion = row.version + 1;
      this.db
        .prepare(
          `UPDATE ReviewQueue
           SET status = 'pending',
               version = @version,
               sourceIdentifier = @sourceIdentifier,
               previewUrl = @previewUrl,
               updatedAt = datetime('now'),
               archiveScheduledAt = NULL
           WHERE assetId = @assetId`
        )
        .run({
          version: nextVersion,
          sourceIdentifier: newSourceIdentifier,
          previewUrl,
          assetId,
        });

      this.db
        .prepare(
          `INSERT INTO ApprovalHistory (
            reviewQueueId, version, decision, notes, reviewedBy
          ) VALUES (?, ?, 'pending', NULL, NULL)`
        )
        .run(row.id, nextVersion);

      return this.getByAssetId(assetId)!;
    });

    return run();
  }

  getReviewQueue(status?: ReviewStatus): ReviewQueueRow[] {
    if (status) {
      return this.db
        .prepare(
          `SELECT * FROM ReviewQueue WHERE status = ? ORDER BY updatedAt DESC`
        )
        .all(status) as ReviewQueueRow[];
    }
    return this.db
      .prepare(`SELECT * FROM ReviewQueue ORDER BY updatedAt DESC`)
      .all() as ReviewQueueRow[];
  }

  getQueueStats(): QueueStats {
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) AS count FROM ReviewQueue GROUP BY status`
      )
      .all() as Array<{ status: ReviewStatus; count: number }>;

    const stats: QueueStats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      changesRequested: 0,
    };

    for (const row of rows) {
      stats.total += row.count;
      stats[row.status] = row.count;
    }
    return stats;
  }

  getAssetVersionHistory(assetId: string): ApprovalHistoryRow[] {
    const row = this.getByAssetId(assetId);
    if (!row) {
      return [];
    }
    return this.db
      .prepare(
        `SELECT * FROM ApprovalHistory
         WHERE reviewQueueId = ?
         ORDER BY version ASC, reviewedAt ASC, id ASC`
      )
      .all(row.id) as ApprovalHistoryRow[];
  }

  getByAssetId(assetId: string): ReviewQueueRow | undefined {
    return this.db
      .prepare(`SELECT * FROM ReviewQueue WHERE assetId = ?`)
      .get(assetId) as ReviewQueueRow | undefined;
  }

  close(): void {
    this.db.close();
  }
}
