-- DAM MVP Phase 1 Day 1 schema
-- SQLite + WAL; transactional review queue, audit trail, archive jobs.

PRAGMA foreign_keys = ON;

-- Main review workflow queue
CREATE TABLE IF NOT EXISTS ReviewQueue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assetId TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'approved', 'rejected', 'changesRequested')
  ) DEFAULT 'pending',
  version INTEGER NOT NULL DEFAULT 1,
  sourceBackend TEXT NOT NULL CHECK (
    sourceBackend IN ('local', 'fal.ai', 'replit', 'comfyui')
  ),
  sourceIdentifier TEXT NOT NULL,
  previewUrl TEXT NOT NULL,
  projectTag TEXT,
  tags TEXT, -- JSON array
  designatedReviewer TEXT,
  description TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  archiveScheduledAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status ON ReviewQueue(status);
CREATE INDEX IF NOT EXISTS idx_review_queue_reviewer ON ReviewQueue(designatedReviewer);
CREATE INDEX IF NOT EXISTS idx_review_queue_archive ON ReviewQueue(archiveScheduledAt);

-- Immutable-ish audit trail; one row per decision / version event
CREATE TABLE IF NOT EXISTS ApprovalHistory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reviewQueueId INTEGER NOT NULL,
  version INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (
    decision IN ('pending', 'approved', 'rejected', 'changesRequested')
  ),
  notes TEXT,
  reviewedBy TEXT,
  reviewedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (reviewQueueId) REFERENCES ReviewQueue(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_approval_history_queue ON ApprovalHistory(reviewQueueId);
CREATE INDEX IF NOT EXISTS idx_approval_history_version ON ApprovalHistory(reviewQueueId, version);

-- Background 30-day retention → cold storage jobs
CREATE TABLE IF NOT EXISTS ArchiveJob (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reviewQueueId INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('scheduled', 'in-progress', 'completed', 'failed')
  ) DEFAULT 'scheduled',
  retentionIdentifier TEXT,
  coldstorageUrl TEXT,
  error TEXT,
  scheduledAt TEXT NOT NULL,
  completedAt TEXT,
  FOREIGN KEY (reviewQueueId) REFERENCES ReviewQueue(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_archive_job_status ON ArchiveJob(status);
CREATE INDEX IF NOT EXISTS idx_archive_job_scheduled ON ArchiveJob(scheduledAt);
