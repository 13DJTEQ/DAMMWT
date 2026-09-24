/**
 * Day 2 acceptance: DB initializes, IPC handlers register + invoke,
 * queue stats work — without needing a display / Electron runtime.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseManager } from '../src/database/DatabaseManager';
import {
  createDamApi,
  IPC_CHANNELS,
  registerIpcHandlers,
  type IpcMainLike,
} from '../src/ipc/handlers';

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

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mwt-dam-day2-'));
  const dbPath = join(dir, 'test.db');

  try {
    const db = new DatabaseManager(dbPath);
    const ipc = new MockIpcMain();
    const registered = registerIpcHandlers(ipc, db);

    if (registered.length !== IPC_CHANNELS.length) {
      throw new Error(
        `Expected ${IPC_CHANNELS.length} channels, got ${registered.length}`
      );
    }
    for (const channel of IPC_CHANNELS) {
      if (!ipc.has(channel)) {
        throw new Error(`Missing IPC handler: ${channel}`);
      }
    }
    console.log('IPC channels ready:', [...registered].join(', '));

    const damApi = createDamApi((channel, ...args) => ipc.invoke(channel, ...args));

    const health = await damApi.healthCheck();
    if (!health.ok || !health.dbReady) {
      throw new Error(`healthCheck failed: ${JSON.stringify(health)}`);
    }
    console.log('healthCheck:', health);

    const ingested = await damApi.ingestAsset({
      assetId: 'day2-asset-1',
      sourceBackend: 'local',
      sourceIdentifier: '/tmp/day2-fixture.mp4',
      previewUrl: 'file:///tmp/day2-fixture.mp4',
      projectTag: 'day2-verify',
    });
    if (ingested.status !== 'pending' || ingested.version !== 1) {
      throw new Error(`Unexpected ingest result: ${JSON.stringify(ingested)}`);
    }

    const statsAfterIngest = await damApi.getQueueStats();
    console.log('getQueueStats:', statsAfterIngest);
    const expectedIngest = {
      total: 1,
      pending: 1,
      approved: 0,
      rejected: 0,
      changesRequested: 0,
    };
    if (JSON.stringify(statsAfterIngest) !== JSON.stringify(expectedIngest)) {
      throw new Error(`Unexpected stats after ingest: ${JSON.stringify(statsAfterIngest)}`);
    }

    const queue = await damApi.getReviewQueue('pending');
    if (queue.length !== 1 || queue[0]?.assetId !== 'day2-asset-1') {
      throw new Error(`Unexpected review queue: ${JSON.stringify(queue)}`);
    }

    await damApi.submitApproval({
      assetId: 'day2-asset-1',
      decision: 'changesRequested',
      reviewedBy: 'verify-day2',
      notes: 'needs tweak',
    });

    const resubmitted = await damApi.resubmitAsset(
      'day2-asset-1',
      '/tmp/day2-fixture-v2.mp4',
      'file:///tmp/day2-fixture-v2.mp4'
    );
    if (resubmitted.version !== 2 || resubmitted.status !== 'pending') {
      throw new Error(`Unexpected resubmit: ${JSON.stringify(resubmitted)}`);
    }

    await damApi.submitApproval({
      assetId: 'day2-asset-1',
      decision: 'approved',
      reviewedBy: 'verify-day2',
    });

    const history = await damApi.getAssetVersionHistory('day2-asset-1');
    if (history.length < 3) {
      throw new Error(`Expected version history length >= 3, got ${history.length}`);
    }

    const finalStats = await damApi.getQueueStats();
    console.log('final stats:', finalStats);
    if (finalStats.approved !== 1 || finalStats.total !== 1) {
      throw new Error(`Unexpected final stats: ${JSON.stringify(finalStats)}`);
    }

    db.close();
    console.log('Day 2 verify OK');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
