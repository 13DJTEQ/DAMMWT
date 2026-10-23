/**
 * Gallery V1 acceptance: love / keep / reject + notes via DB/IPC + App chrome.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { DatabaseManager } from '../src/database/DatabaseManager';
import {
  createDamApi,
  IPC_CHANNELS,
  registerIpcHandlers,
  type IpcMainLike,
} from '../src/ipc/handlers';
import { createDamApiFromDb, setDamApi } from '../src/renderer/damApi';
import { ReviewController } from '../src/renderer/ReviewController';
import { App } from '../src/renderer/App';

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

function collectText(node: TestRenderer.ReactTestRendererJSON | string | null): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  const kids = node.children ?? [];
  return kids
    .map((child) => collectText(child as TestRenderer.ReactTestRendererJSON | string))
    .join('');
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mwt-dam-gallery-'));
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

    const viaIpc = createDamApi((channel, ...args) => ipc.invoke(channel, ...args));

    await viaIpc.ingestAsset({
      assetId: 'gal-a',
      sourceBackend: 'local',
      sourceIdentifier: '/media/gal-a.mp4',
      previewUrl: 'file:///media/gal-a.jpg',
      projectTag: 'v1',
    });
    await viaIpc.ingestAsset({
      assetId: 'gal-b',
      sourceBackend: 'local',
      sourceIdentifier: '/media/gal-b.mp4',
      previewUrl: 'file:///media/gal-b.jpg',
    });
    await viaIpc.ingestAsset({
      assetId: 'gal-c',
      sourceBackend: 'local',
      sourceIdentifier: '/media/gal-c.mp4',
      previewUrl: 'file:///media/gal-c.jpg',
    });

    await viaIpc.submitApproval({
      assetId: 'gal-a',
      decision: 'love',
      reviewedBy: 'verify-gallery',
      notes: 'Hero composition — steer toward',
    });
    await viaIpc.submitApproval({
      assetId: 'gal-b',
      decision: 'keep',
      reviewedBy: 'verify-gallery',
      notes: 'Meets brief',
    });
    await viaIpc.submitApproval({
      assetId: 'gal-c',
      decision: 'reject',
      reviewedBy: 'verify-gallery',
      notes: 'Artifacts in corners',
    });

    const stats = await viaIpc.getQueueStats();
    const expected = {
      total: 3,
      pending: 0,
      love: 1,
      keep: 1,
      reject: 1,
      changesRequested: 0,
    };
    if (JSON.stringify(stats) !== JSON.stringify(expected)) {
      throw new Error(`Stats mismatch: ${JSON.stringify(stats)}`);
    }

    const loveHistory = await viaIpc.getAssetVersionHistory('gal-a');
    const loveDecision = loveHistory.find((h) => h.decision === 'love');
    if (!loveDecision || loveDecision.notes !== 'Hero composition — steer toward') {
      throw new Error(`Love notes missing: ${JSON.stringify(loveHistory)}`);
    }

    const loved = db.getByAssetId('gal-a');
    if (!loved?.archiveScheduledAt) {
      throw new Error('love should schedule archive like keep');
    }

    const api = createDamApiFromDb(db);
    setDamApi(api);
    const controller = new ReviewController(api);
    await controller.setFilter('all');
    let snap = controller.getSnapshot();
    if (snap.queue.length !== 3) {
      throw new Error(`Expected 3 gallery assets, got ${snap.queue.length}`);
    }

    await viaIpc.ingestAsset({
      assetId: 'gal-d',
      sourceBackend: 'local',
      sourceIdentifier: '/media/gal-d.mp4',
      previewUrl: 'file:///media/gal-d.jpg',
    });
    await controller.setFilter('pending');
    controller.selectAsset('gal-d');
    controller.setNotesDraft(' borderline keep ');
    await controller.submitApproval({
      decision: 'keep',
      reviewedBy: 'verify@mwt.com',
    });
    snap = controller.getSnapshot();
    if (!snap.stats || snap.stats.keep !== 2) {
      throw new Error(`Controller keep stats: ${JSON.stringify(snap.stats)}`);
    }
    const dHistory = await api.getAssetVersionHistory('gal-d');
    const dKeep = dHistory.find((h) => h.decision === 'keep');
    if (!dKeep || dKeep.notes !== 'borderline keep') {
      throw new Error(`Notes draft not persisted: ${JSON.stringify(dHistory)}`);
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(App, { controller, reviewedBy: 'verify@mwt.com' })
      );
      await controller.refresh();
    });

    await viaIpc.ingestAsset({
      assetId: 'orig-lineage',
      sourceBackend: 'local',
      sourceIdentifier: '/media/orig.jpg',
      previewUrl: 'file:///media/orig.jpg',
      partition: 'originals',
      title: 'Lineage original',
    });
    await viaIpc.ingestAsset({
      assetId: 'tat-lineage',
      sourceBackend: 'local',
      sourceIdentifier: '/media/tat.jpg',
      previewUrl: 'file:///media/tat.jpg',
      partition: 'tattoos',
      parentSourceId: 'orig-lineage',
      title: 'Lineage tattoo',
    });
    await controller.setPartitionFilter('tattoos');
    await controller.setFilter('all');
    controller.selectAsset('tat-lineage');
    snap = controller.getSnapshot();
    if (snap.queue.length < 1 || !snap.parentAsset) {
      throw new Error(
        `Expected tattoo partition + parent lineage, got queue=${snap.queue.length} parent=${snap.parentAsset?.assetId}`
      );
    }
    if (snap.parentAsset.assetId !== 'orig-lineage') {
      throw new Error(`Parent mismatch: ${snap.parentAsset.assetId}`);
    }
    await controller.revealAsset('orig-lineage');
    snap = controller.getSnapshot();
    if (snap.selectedAssetId !== 'orig-lineage' || snap.partitionFilter !== 'all') {
      throw new Error('revealAsset should clear filters and select parent');
    }

    await act(async () => {
      await controller.refresh();
    });

    const text = collectText(renderer!.toJSON());
    if (!text.includes('MWT DAM')) {
      throw new Error('App render missing brand name MWT DAM');
    }
    if (!text.includes('Gallery')) {
      throw new Error('App render missing Gallery title');
    }
    if (!text.includes('Love') || !text.includes('Keep') || !text.includes('Reject')) {
      throw new Error('App render missing Gallery decision chrome');
    }
    if (!text.includes('Source of Truth')) {
      throw new Error('App render missing Originals / Source of Truth partition chrome');
    }

    console.log(
      JSON.stringify(
        {
          stats: await viaIpc.getQueueStats(),
          channels: [...registered],
        },
        null,
        2
      )
    );
    console.log('Gallery V1 verify OK');
    db.close();
  } finally {
    setDamApi(null);
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
