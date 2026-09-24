/**
 * Day 5 acceptance: 30-day retention → cold storage + resubmit path.
 *
 * 1) Local backend files → ingest → approve (schedules ArchiveJob)
 * 2) Force scheduledAt into the past → run ArchiveScheduler once
 * 3) Assert ArchiveJob completed with retentionIdentifier + coldstorageUrl
 * 4) changesRequested → resubmitAsset → pending with version bump
 */
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { StorageFactory } from '../src/storage/StorageFactory';
import { ArchiveScheduler } from '../src/archive/ArchiveScheduler';

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mwt-dam-day5-'));
  const dbPath = join(dir, 'test.db');
  const mediaRoot = join(dir, 'media');
  const videoPath = join(mediaRoot, 'clip.mp4');
  const resubmitPath = join(mediaRoot, 'clip-v2.mp4');

  try {
    mkdirSync(mediaRoot, { recursive: true });
    writeFileSync(videoPath, Buffer.from('fake-mp4-day5-v1'));
    writeFileSync(resubmitPath, Buffer.from('fake-mp4-day5-v2'));

    const local = StorageFactory.create({ type: 'local', localPath: mediaRoot });
    if (!(await local.healthCheck())) {
      throw new Error('Local backend health check failed');
    }

    const asset = await local.getAsset(videoPath);
    const db = new DatabaseManager(dbPath);

    // --- Archive path ---
    db.ingestAsset({
      assetId: 'archive-1',
      sourceBackend: 'local',
      sourceIdentifier: asset.sourceIdentifier,
      previewUrl: asset.previewUrl,
    });

    const approved = db.submitApproval({
      assetId: 'archive-1',
      decision: 'approved',
      reviewedBy: 'day5-verify',
      notes: 'schedule archive',
    });
    if (approved.status !== 'approved' || !approved.archiveScheduledAt) {
      throw new Error(`Expected approved + archiveScheduledAt, got ${JSON.stringify(approved)}`);
    }

    const jobs = db.getArchiveJobsForReview(approved.id);
    if (jobs.length !== 1 || jobs[0].status !== 'scheduled') {
      throw new Error(`Expected one scheduled ArchiveJob, got ${JSON.stringify(jobs)}`);
    }

    const past = new Date(Date.now() - 60_000).toISOString();
    db.setArchiveJobScheduledAt(jobs[0].id, past);

    const scheduler = new ArchiveScheduler(db, (row) => {
      if (row.sourceBackend !== 'local') {
        throw new Error(`Unexpected backend in verify: ${row.sourceBackend}`);
      }
      return StorageFactory.create({ type: 'local', localPath: mediaRoot });
    });

    const results = await scheduler.processDueJobs();
    if (results.length !== 1 || !results[0].ok) {
      throw new Error(`Scheduler failed: ${JSON.stringify(results)}`);
    }

    const completed = db.getArchiveJobById(jobs[0].id);
    if (!completed || completed.status !== 'completed') {
      throw new Error(`ArchiveJob not completed: ${JSON.stringify(completed)}`);
    }
    if (!completed.retentionIdentifier || !completed.coldstorageUrl) {
      throw new Error(`Missing retention/cold fields: ${JSON.stringify(completed)}`);
    }
    if (!completed.coldstorageUrl.startsWith('file://')) {
      throw new Error(`Expected file:// cold URL, got ${completed.coldstorageUrl}`);
    }
    const coldPath = completed.coldstorageUrl.replace(/^file:\/\//, '');
    if (!existsSync(coldPath)) {
      throw new Error(`Cold storage file missing: ${coldPath}`);
    }

    console.log('archive:', {
      status: completed.status,
      retentionIdentifier: completed.retentionIdentifier,
      coldstorageUrl: completed.coldstorageUrl,
    });

    // --- Resubmit path ---
    db.ingestAsset({
      assetId: 'resubmit-1',
      sourceBackend: 'local',
      sourceIdentifier: asset.sourceIdentifier,
      previewUrl: asset.previewUrl,
    });

    db.submitApproval({
      assetId: 'resubmit-1',
      decision: 'changesRequested',
      reviewedBy: 'day5-verify',
      notes: 'please revise',
    });

    const resubmitAsset = await local.getAsset(resubmitPath);
    const resubmitted = db.resubmitAsset(
      'resubmit-1',
      resubmitAsset.sourceIdentifier,
      resubmitAsset.previewUrl
    );

    if (resubmitted.status !== 'pending' || resubmitted.version !== 2) {
      throw new Error(
        `Expected pending v2 after resubmit, got status=${resubmitted.status} version=${resubmitted.version}`
      );
    }

    const history = db.getAssetVersionHistory('resubmit-1');
    const decisions = history.map((h) => `${h.version}:${h.decision}`);
    console.log('resubmit:', {
      status: resubmitted.status,
      version: resubmitted.version,
      history: decisions,
    });

    if (!decisions.includes('1:changesRequested') || !decisions.includes('2:pending')) {
      throw new Error(`Unexpected history: ${JSON.stringify(decisions)}`);
    }

    // Confirm public surface still exports the method via DatabaseManager
    if (typeof db.resubmitAsset !== 'function') {
      throw new Error('resubmitAsset is not available on DatabaseManager');
    }

    db.close();
    console.log('Day 5 verify OK');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
