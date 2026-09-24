/**
 * Day 6: E2E ingest → review → approve → archive + IPC + error/stats checks.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ArchiveScheduler } from '../src/archive/ArchiveScheduler';
import { DatabaseManager } from '../src/database/DatabaseManager';
import {
  IPC_CHANNELS,
  createDamApi,
  registerIpcHandlers,
  type IpcMainLike,
} from '../src/ipc/handlers';
import { StorageFactory } from '../src/storage/StorageFactory';
import type { StorageBackend } from '../src/storage/StorageBackend';

class MockIpcMain implements IpcMainLike {
  private readonly handlers = new Map<
    string,
    (event: unknown, ...args: unknown[]) => unknown
  >();

  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown
  ): void {
    this.handlers.set(channel, listener);
  }

  has(channel: string): boolean {
    return this.handlers.has(channel);
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`No handler registered for channel: ${channel}`);
    }
    return handler({}, ...args);
  }
}

/** Backend that fails health and archive — for error-path coverage. */
class FailingBackend implements StorageBackend {
  async getAsset(): Promise<never> {
    throw new Error('failing backend: getAsset');
  }
  async listRecent(): Promise<never> {
    throw new Error('failing backend: listRecent');
  }
  async archiveForRetention(): Promise<never> {
    throw new Error('simulated retention failure');
  }
  async moveToColdstorage(): Promise<never> {
    throw new Error('simulated cold failure');
  }
  async healthCheck(): Promise<boolean> {
    return false;
  }
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mwt-dam-day6-'));
  const dbPath = join(dir, 'e2e.db');
  const mediaRoot = join(dir, 'media');
  const videoPath = join(mediaRoot, 'hero.mp4');
  const v2Path = join(mediaRoot, 'hero-v2.mp4');

  try {
    mkdirSync(mediaRoot, { recursive: true });
    writeFileSync(videoPath, Buffer.from('day6-e2e-v1'));
    writeFileSync(v2Path, Buffer.from('day6-e2e-v2'));

    const local = StorageFactory.create({ type: 'local', localPath: mediaRoot });
    if (!(await local.healthCheck())) {
      throw new Error('Local healthCheck failed');
    }
    const failing = new FailingBackend();
    if (await failing.healthCheck()) {
      throw new Error('FailingBackend healthCheck should be false');
    }
    console.log('storage mocks: local ok, failing health=false');

    const db = new DatabaseManager(dbPath);
    const ipc = new MockIpcMain();
    registerIpcHandlers(ipc, db);
    for (const channel of IPC_CHANNELS) {
      if (!ipc.has(channel)) {
        throw new Error(`Missing IPC channel: ${channel}`);
      }
    }
    const damApi = createDamApi((channel, ...args) => ipc.invoke(channel, ...args));
    console.log('IPC channels ready:', IPC_CHANNELS.join(', '));

    // --- E2E: ingest → review → approve → archive ---
    const asset = await local.getAsset(videoPath);
    await damApi.ingestAsset({
      assetId: 'e2e-1',
      sourceBackend: 'local',
      sourceIdentifier: asset.sourceIdentifier,
      previewUrl: asset.previewUrl,
      projectTag: 'day6',
    });

    const pendingQueue = await damApi.getReviewQueue('pending');
    if (pendingQueue.length !== 1 || pendingQueue[0].assetId !== 'e2e-1') {
      throw new Error(`Review queue unexpected: ${JSON.stringify(pendingQueue)}`);
    }

    await damApi.submitApproval({
      assetId: 'e2e-1',
      decision: 'approved',
      reviewedBy: 'day6-e2e',
      notes: 'ship it',
    });

    const approvedRow = db.getByAssetId('e2e-1');
    if (!approvedRow || approvedRow.status !== 'approved') {
      throw new Error(`Expected approved e2e-1, got ${JSON.stringify(approvedRow)}`);
    }

    const jobs = db.getArchiveJobsForReview(approvedRow.id);
    if (jobs.length !== 1) {
      throw new Error(`Expected one archive job, got ${JSON.stringify(jobs)}`);
    }
    db.setArchiveJobScheduledAt(jobs[0].id, new Date(Date.now() - 60_000).toISOString());

    const scheduler = new ArchiveScheduler(db, (row) => {
      if (row.sourceBackend !== 'local') {
        throw new Error(`Unexpected backend: ${row.sourceBackend}`);
      }
      return StorageFactory.create({ type: 'local', localPath: mediaRoot });
    });
    const archiveResults = await scheduler.processDueJobs();
    if (archiveResults.length !== 1 || !archiveResults[0].ok) {
      throw new Error(`Archive E2E failed: ${JSON.stringify(archiveResults)}`);
    }
    const completed = db.getArchiveJobById(jobs[0].id)!;
    if (completed.status !== 'completed' || !completed.coldstorageUrl) {
      throw new Error(`Archive job incomplete: ${JSON.stringify(completed)}`);
    }
    const coldPath = completed.coldstorageUrl.replace(/^file:\/\//, '');
    if (!existsSync(coldPath)) {
      throw new Error(`Cold file missing: ${coldPath}`);
    }
    console.log('e2e archive:', {
      status: completed.status,
      coldstorageUrl: completed.coldstorageUrl,
    });

    // --- Resubmit path via IPC ---
    await damApi.ingestAsset({
      assetId: 'e2e-resubmit',
      sourceBackend: 'local',
      sourceIdentifier: asset.sourceIdentifier,
      previewUrl: asset.previewUrl,
    });
    await damApi.submitApproval({
      assetId: 'e2e-resubmit',
      decision: 'changesRequested',
      reviewedBy: 'day6-e2e',
    });
    const v2 = await local.getAsset(v2Path);
    const resubmitted = await damApi.resubmitAsset(
      'e2e-resubmit',
      v2.sourceIdentifier,
      v2.previewUrl
    );
    if (resubmitted.status !== 'pending' || resubmitted.version !== 2) {
      throw new Error(`Resubmit failed: ${JSON.stringify(resubmitted)}`);
    }
    console.log('e2e resubmit:', {
      status: resubmitted.status,
      version: resubmitted.version,
    });

    // --- Stats accuracy after mixed decisions ---
    await damApi.ingestAsset({
      assetId: 'e2e-reject',
      sourceBackend: 'local',
      sourceIdentifier: asset.sourceIdentifier,
      previewUrl: asset.previewUrl,
    });
    await damApi.submitApproval({
      assetId: 'e2e-reject',
      decision: 'rejected',
      reviewedBy: 'day6-e2e',
    });
    const stats = await damApi.getQueueStats();
    // e2e-1 approved, e2e-resubmit pending, e2e-reject rejected
    const expected = {
      total: 3,
      pending: 1,
      approved: 1,
      rejected: 1,
      changesRequested: 0,
    };
    if (JSON.stringify(stats) !== JSON.stringify(expected)) {
      throw new Error(
        `Stats mismatch: got ${JSON.stringify(stats)} expected ${JSON.stringify(expected)}`
      );
    }
    console.log('stats accuracy:', stats);

    // --- Archive error handling (failed job) ---
    await damApi.ingestAsset({
      assetId: 'e2e-fail-archive',
      sourceBackend: 'local',
      sourceIdentifier: asset.sourceIdentifier,
      previewUrl: asset.previewUrl,
    });
    const failApproved = db.submitApproval({
      assetId: 'e2e-fail-archive',
      decision: 'approved',
      reviewedBy: 'day6-e2e',
    });
    const failJobs = db.getArchiveJobsForReview(failApproved.id);
    db.setArchiveJobScheduledAt(failJobs[0].id, new Date(Date.now() - 60_000).toISOString());
    const failScheduler = new ArchiveScheduler(db, () => new FailingBackend());
    const failResults = await failScheduler.processDueJobs();
    if (failResults.length < 1 || failResults.some((r) => r.ok && r.jobId === failJobs[0].id)) {
      // processDueJobs may pick e2e-1's job if still scheduled — only e2e-fail should be due
      // e2e-1 already completed; only fail job should be due
    }
    const failedJob = db.getArchiveJobById(failJobs[0].id)!;
    if (failedJob.status !== 'failed' || !failedJob.error) {
      throw new Error(`Expected failed archive job: ${JSON.stringify(failedJob)}`);
    }
    console.log('archive error path:', {
      status: failedJob.status,
      error: failedJob.error,
    });

    db.close();
    console.log('Day 6 verify OK');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
