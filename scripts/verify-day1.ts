/**
 * Day 1 acceptance check from the Notion scaffold page.
 * Expected: { total: 1, pending: 1, approved: 0, rejected: 0, changesRequested: 0 }
 */
import { DatabaseManager } from '../src/database/DatabaseManager';
import { StorageFactory } from '../src/storage/StorageFactory';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mwt-dam-day1-'));
  const dbPath = join(dir, 'test.db');
  const mediaPath = join(dir, 'media');
  const videoPath = join(dir, 'video.mp4');

  try {
    mkdirSync(mediaPath, { recursive: true });
    writeFileSync(videoPath, Buffer.from('fake-mp4-bytes'));

    const local = StorageFactory.create({ type: 'local', localPath: dir });
    const fal = StorageFactory.create({ type: 'fal.ai' });
    const localOk = await local.healthCheck();
    const falOk = await fal.healthCheck();
    if (!localOk || !falOk) {
      throw new Error(`Health check failed local=${localOk} fal=${falOk}`);
    }

    const asset = await local.getAsset(videoPath);
    const db = new DatabaseManager(dbPath);
    db.ingestAsset({
      assetId: 'test-1',
      sourceBackend: 'local',
      sourceIdentifier: asset.sourceIdentifier,
      previewUrl: asset.previewUrl,
    });

    const stats = db.getQueueStats();
    console.log(stats);
    db.close();

    const expected = {
      total: 1,
      pending: 1,
      approved: 0,
      rejected: 0,
      changesRequested: 0,
    };
    if (JSON.stringify(stats) !== JSON.stringify(expected)) {
      throw new Error(`Unexpected stats: ${JSON.stringify(stats)}`);
    }
    console.log('Day 1 verify OK');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
