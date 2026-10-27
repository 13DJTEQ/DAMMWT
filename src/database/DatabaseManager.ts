import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { SourceBackendType } from '../storage/StorageBackend';

/** Gallery V1 decisions + pending / resubmit path from Week 1. */
export type ReviewStatus =
  | 'pending'
  | 'love'
  | 'keep'
  | 'reject'
  | 'changesRequested';

export type ApprovalDecision = ReviewStatus;

/** Tattoo-design media partition (manifest originals | tattoos | generated). */
export type MediaPartition = 'originals' | 'tattoos' | 'generated';

/** Positive gallery decisions that schedule 30-day archive. */
export const ARCHIVE_ON_DECISIONS: ReadonlySet<ApprovalDecision> = new Set([
  'love',
  'keep',
]);

export interface IngestAssetInput {
  assetId: string;
  sourceBackend: SourceBackendType;
  sourceIdentifier: string;
  previewUrl: string;
  /** Absolute or repo-relative filesystem path for Reveal / Open file. */
  localPath?: string | null;
  /** Optional Notion / Drive / Supabase / CDN URL for Open cloud. */
  cloudUrl?: string | null;
  projectTag?: string;
  tags?: string[];
  designatedReviewer?: string;
  description?: string;
  /** originals | tattoos | generated — Source of Truth vs derived work. */
  partition?: MediaPartition | null;
  /** Lineage: generated/tattoo assetId of the parent original when set. */
  parentSourceId?: string | null;
  title?: string | null;
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
  localPath: string | null;
  cloudUrl: string | null;
  projectTag: string | null;
  tags: string | null;
  designatedReviewer: string | null;
  description: string | null;
  partition: MediaPartition | null;
  parentSourceId: string | null;
  title: string | null;
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
  love: number;
  keep: number;
  reject: number;
  changesRequested: number;
}

export type ArchiveJobStatus = 'scheduled' | 'in-progress' | 'completed' | 'failed';

export interface ArchiveJobRow {
  id: number;
  reviewQueueId: number;
  status: ArchiveJobStatus;
  retentionIdentifier: string | null;
  coldstorageUrl: string | null;
  error: string | null;
  scheduledAt: string;
  completedAt: string | null;
}

/**
 * SQLite manager for review queue, gallery decisions, and archive jobs.
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
    // Legacy DBs may lack additive columns referenced by schema indexes;
    // apply table DDL, add columns, then re-apply so indexes succeed.
    try {
      this.db.exec(ddl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/no such column/i.test(msg)) {
        throw err;
      }
    }
    this.migrateLegacyApproved();
    this.ensureMediaLineageColumns();
    this.db.exec(ddl);
  }

  /**
   * Additive columns for tattoo-design SoT / lineage / file links (safe on existing DBs).
   */
  private ensureMediaLineageColumns(): void {
    const cols = this.db
      .prepare(`PRAGMA table_info(ReviewQueue)`)
      .all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('partition')) {
      this.db.exec(`ALTER TABLE ReviewQueue ADD COLUMN partition TEXT`);
    }
    if (!names.has('parentSourceId')) {
      this.db.exec(`ALTER TABLE ReviewQueue ADD COLUMN parentSourceId TEXT`);
    }
    if (!names.has('title')) {
      this.db.exec(`ALTER TABLE ReviewQueue ADD COLUMN title TEXT`);
    }
    if (!names.has('localPath')) {
      this.db.exec(`ALTER TABLE ReviewQueue ADD COLUMN localPath TEXT`);
    }
    if (!names.has('cloudUrl')) {
      this.db.exec(`ALTER TABLE ReviewQueue ADD COLUMN cloudUrl TEXT`);
    }
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_review_queue_partition ON ReviewQueue(partition)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_review_queue_parent ON ReviewQueue(parentSourceId)`
    );
  }

  /**
   * Week 1 used `approved`; Gallery V1 uses `keep` (and distinct `love`).
   * Safe no-op on fresh Gallery schemas.
   */
  private migrateLegacyApproved(): void {
    const queueSql = (
      this.db
        .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='ReviewQueue'`)
        .get() as { sql: string } | undefined
    )?.sql;
    if (queueSql && queueSql.includes("'approved'") && !queueSql.includes("'love'")) {
      this.rebuildQueueTablesForGallery();
      return;
    }
    try {
      this.db.exec(`UPDATE ReviewQueue SET status = 'keep' WHERE status = 'approved'`);
      this.db.exec(
        `UPDATE ApprovalHistory SET decision = 'keep' WHERE decision = 'approved'`
      );
    } catch {
      /* CHECK may already exclude approved */
    }
  }

  private rebuildQueueTablesForGallery(): void {
    this.db.exec(`PRAGMA foreign_keys = OFF`);
    this.db.exec(`
      CREATE TABLE ReviewQueue_v1 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assetId TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (
          status IN ('pending', 'love', 'keep', 'reject', 'changesRequested')
        ) DEFAULT 'pending',
        version INTEGER NOT NULL DEFAULT 1,
        sourceBackend TEXT NOT NULL CHECK (
          sourceBackend IN ('local', 'fal.ai', 'replit', 'comfyui')
        ),
        sourceIdentifier TEXT NOT NULL,
        previewUrl TEXT NOT NULL,
        projectTag TEXT,
        tags TEXT,
        designatedReviewer TEXT,
        description TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        archiveScheduledAt TEXT
      );

      INSERT INTO ReviewQueue_v1 (
        id, assetId, status, version, sourceBackend, sourceIdentifier, previewUrl,
        projectTag, tags, designatedReviewer, description, createdAt, updatedAt,
        archiveScheduledAt
      )
      SELECT
        id, assetId,
        CASE status WHEN 'approved' THEN 'keep' WHEN 'rejected' THEN 'reject' ELSE status END,
        version, sourceBackend, sourceIdentifier, previewUrl,
        projectTag, tags, designatedReviewer, description, createdAt, updatedAt,
        archiveScheduledAt
      FROM ReviewQueue;

      CREATE TABLE ApprovalHistory_v1 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reviewQueueId INTEGER NOT NULL,
        version INTEGER NOT NULL,
        decision TEXT NOT NULL CHECK (
          decision IN ('pending', 'love', 'keep', 'reject', 'changesRequested')
        ),
        notes TEXT,
        reviewedBy TEXT,
        reviewedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (reviewQueueId) REFERENCES ReviewQueue_v1(id) ON DELETE CASCADE
      );

      INSERT INTO ApprovalHistory_v1 (
        id, reviewQueueId, version, decision, notes, reviewedBy, reviewedAt
      )
      SELECT
        id, reviewQueueId, version,
        CASE decision WHEN 'approved' THEN 'keep' WHEN 'rejected' THEN 'reject' ELSE decision END,
        notes, reviewedBy, reviewedAt
      FROM ApprovalHistory;

      DROP TABLE ApprovalHistory;
      DROP TABLE ReviewQueue;
      ALTER TABLE ReviewQueue_v1 RENAME TO ReviewQueue;
      ALTER TABLE ApprovalHistory_v1 RENAME TO ApprovalHistory;

      CREATE INDEX IF NOT EXISTS idx_review_queue_status ON ReviewQueue(status);
      CREATE INDEX IF NOT EXISTS idx_review_queue_reviewer ON ReviewQueue(designatedReviewer);
      CREATE INDEX IF NOT EXISTS idx_review_queue_archive ON ReviewQueue(archiveScheduledAt);
      CREATE INDEX IF NOT EXISTS idx_approval_history_queue ON ApprovalHistory(reviewQueueId);
      CREATE INDEX IF NOT EXISTS idx_approval_history_version ON ApprovalHistory(reviewQueueId, version);
    `);
    this.db.exec(`PRAGMA foreign_keys = ON`);
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
            previewUrl, localPath, cloudUrl, projectTag, tags, designatedReviewer, description,
            partition, parentSourceId, title
          ) VALUES (
            @assetId, 'pending', 1, @sourceBackend, @sourceIdentifier,
            @previewUrl, @localPath, @cloudUrl, @projectTag, @tags, @designatedReviewer, @description,
            @partition, @parentSourceId, @title
          )`
        )
        .run({
          assetId: input.assetId,
          sourceBackend: input.sourceBackend,
          sourceIdentifier: input.sourceIdentifier,
          previewUrl: input.previewUrl,
          localPath: input.localPath ?? null,
          cloudUrl: input.cloudUrl ?? null,
          projectTag: input.projectTag ?? null,
          tags: input.tags ? JSON.stringify(input.tags) : null,
          designatedReviewer: input.designatedReviewer ?? null,
          description: input.description ?? null,
          partition: input.partition ?? null,
          parentSourceId: input.parentSourceId ?? null,
          title: input.title ?? null,
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
   * Transactional gallery/formal decision: update queue status + write history.
   * love/keep schedule a 30-day archive job.
   * changesRequested leaves the asset awaiting resubmit.
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

      const archiveScheduledAt = ARCHIVE_ON_DECISIONS.has(input.decision)
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

      if (archiveScheduledAt) {
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
      .all() as Array<{ status: string; count: number }>;

    const stats: QueueStats = {
      total: 0,
      pending: 0,
      love: 0,
      keep: 0,
      reject: 0,
      changesRequested: 0,
    };

    for (const row of rows) {
      stats.total += row.count;
      const key =
        row.status === 'approved'
          ? 'keep'
          : row.status === 'rejected'
            ? 'reject'
            : row.status;
      if (key in stats && key !== 'total') {
        stats[key as keyof Omit<QueueStats, 'total'>] += row.count;
      }
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

  /**
   * Lineage for an asset: walk parentSourceId to SoT (null parent), plus
   * siblings that share the same parentSourceId (excludes self).
   */
  getLineage(assetId: string): {
    asset: ReviewQueueRow;
    chain: ReviewQueueRow[];
    siblings: ReviewQueueRow[];
  } | null {
    const asset = this.getByAssetId(assetId);
    if (!asset) {
      return null;
    }

    const chain: ReviewQueueRow[] = [asset];
    const seen = new Set<string>([asset.assetId]);
    let cursor: string | null = asset.parentSourceId;
    while (cursor && !seen.has(cursor)) {
      const parent = this.getByAssetId(cursor);
      if (!parent) break;
      chain.push(parent);
      seen.add(parent.assetId);
      cursor = parent.parentSourceId;
    }

    let siblings: ReviewQueueRow[] = [];
    if (asset.parentSourceId) {
      siblings = (
        this.db
          .prepare(
            `SELECT * FROM ReviewQueue
             WHERE parentSourceId = ? AND assetId != ?
             ORDER BY updatedAt DESC`
          )
          .all(asset.parentSourceId, asset.assetId) as ReviewQueueRow[]
      );
    }

    return { asset, chain, siblings };
  }

  /** True when the review queue has no rows (first-launch seed gate). */
  isEmpty(): boolean {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM ReviewQueue`)
      .get() as { count: number };
    return row.count === 0;
  }

  /**
   * Idempotent ingest: skip when assetId already exists.
   * Backfills localPath / cloudUrl when the row is missing those links.
   * @returns the row and whether it was newly inserted
   */
  ingestAssetIfAbsent(
    input: IngestAssetInput
  ): { row: ReviewQueueRow; inserted: boolean } {
    const existing = this.getByAssetId(input.assetId);
    if (existing) {
      const needsLocal =
        input.localPath &&
        (!existing.localPath || existing.localPath !== input.localPath);
      const needsCloud =
        input.cloudUrl !== undefined &&
        input.cloudUrl !== null &&
        existing.cloudUrl !== input.cloudUrl;
      if (needsLocal || needsCloud) {
        this.db
          .prepare(
            `UPDATE ReviewQueue
             SET localPath = COALESCE(@localPath, localPath),
                 cloudUrl = COALESCE(@cloudUrl, cloudUrl),
                 updatedAt = datetime('now')
             WHERE assetId = @assetId`
          )
          .run({
            assetId: input.assetId,
            localPath: input.localPath ?? null,
            cloudUrl: input.cloudUrl ?? null,
          });
        return { row: this.getByAssetId(input.assetId)!, inserted: false };
      }
      return { row: existing, inserted: false };
    }
    return { row: this.ingestAsset(input), inserted: true };
  }

  getReviewQueueById(id: number): ReviewQueueRow | undefined {
    return this.db
      .prepare(`SELECT * FROM ReviewQueue WHERE id = ?`)
      .get(id) as ReviewQueueRow | undefined;
  }

  listDueArchiveJobs(nowIso: string = new Date().toISOString()): ArchiveJobRow[] {
    return this.db
      .prepare(
        `SELECT * FROM ArchiveJob
         WHERE status = 'scheduled' AND scheduledAt <= ?
         ORDER BY scheduledAt ASC, id ASC`
      )
      .all(nowIso) as ArchiveJobRow[];
  }

  getArchiveJobById(id: number): ArchiveJobRow | undefined {
    return this.db
      .prepare(`SELECT * FROM ArchiveJob WHERE id = ?`)
      .get(id) as ArchiveJobRow | undefined;
  }

  getArchiveJobsForReview(reviewQueueId: number): ArchiveJobRow[] {
    return this.db
      .prepare(
        `SELECT * FROM ArchiveJob WHERE reviewQueueId = ? ORDER BY id ASC`
      )
      .all(reviewQueueId) as ArchiveJobRow[];
  }

  setArchiveJobScheduledAt(jobId: number, scheduledAt: string): ArchiveJobRow {
    const run = this.db.transaction(() => {
      const existing = this.getArchiveJobById(jobId);
      if (!existing) {
        throw new Error(`Unknown ArchiveJob id: ${jobId}`);
      }
      this.db
        .prepare(`UPDATE ArchiveJob SET scheduledAt = ? WHERE id = ?`)
        .run(scheduledAt, jobId);
      return this.getArchiveJobById(jobId)!;
    });
    return run();
  }

  updateArchiveJob(
    jobId: number,
    patch: {
      status: ArchiveJobStatus;
      retentionIdentifier?: string | null;
      coldstorageUrl?: string | null;
      error?: string | null;
      completedAt?: string | null;
    }
  ): ArchiveJobRow {
    const run = this.db.transaction(() => {
      const existing = this.getArchiveJobById(jobId);
      if (!existing) {
        throw new Error(`Unknown ArchiveJob id: ${jobId}`);
      }

      const completedAt =
        patch.completedAt !== undefined
          ? patch.completedAt
          : patch.status === 'completed' || patch.status === 'failed'
            ? new Date().toISOString()
            : existing.completedAt;

      this.db
        .prepare(
          `UPDATE ArchiveJob
           SET status = @status,
               retentionIdentifier = @retentionIdentifier,
               coldstorageUrl = @coldstorageUrl,
               error = @error,
               completedAt = @completedAt
           WHERE id = @id`
        )
        .run({
          id: jobId,
          status: patch.status,
          retentionIdentifier:
            patch.retentionIdentifier !== undefined
              ? patch.retentionIdentifier
              : existing.retentionIdentifier,
          coldstorageUrl:
            patch.coldstorageUrl !== undefined
              ? patch.coldstorageUrl
              : existing.coldstorageUrl,
          error: patch.error !== undefined ? patch.error : existing.error,
          completedAt,
        });

      return this.getArchiveJobById(jobId)!;
    });

    return run();
  }

  close(): void {
    this.db.close();
  }
}
