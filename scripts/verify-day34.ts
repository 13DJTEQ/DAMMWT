/**
 * Day 3–4 acceptance: ReviewController + mock damApi update queue/stats
 * without Electron. Also smoke-renders App via react-test-renderer.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { createDamApiFromDb, setDamApi } from '../src/renderer/damApi';
import { ReviewController } from '../src/renderer/ReviewController';
import { App } from '../src/renderer/App';

function collectText(node: TestRenderer.ReactTestRendererJSON | string | null): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  const kids = node.children ?? [];
  return kids.map((child) => collectText(child as TestRenderer.ReactTestRendererJSON | string)).join('');
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mwt-dam-day34-'));
  const dbPath = join(dir, 'test.db');

  try {
    const db = new DatabaseManager(dbPath);
    const api = createDamApiFromDb(db);
    setDamApi(api);

    await api.ingestAsset({
      assetId: 'clip-a',
      sourceBackend: 'local',
      sourceIdentifier: '/media/clip-a.mp4',
      previewUrl: 'file:///media/clip-a.jpg',
      projectTag: 'week1',
      description: 'Hero plate for review UI verify',
    });
    await api.ingestAsset({
      assetId: 'clip-b',
      sourceBackend: 'local',
      sourceIdentifier: '/media/clip-b.mp4',
      previewUrl: 'file:///media/clip-b.jpg',
    });

    const controller = new ReviewController(api);
    await controller.refresh();

    let snap = controller.getSnapshot();
    if (snap.queue.length !== 2) {
      throw new Error(`Expected 2 pending, got ${snap.queue.length}`);
    }
    if (!snap.stats || snap.stats.pending !== 2 || snap.stats.total !== 2) {
      throw new Error(`Unexpected stats after ingest: ${JSON.stringify(snap.stats)}`);
    }
    console.log('queue after ingest:', snap.queue.map((r) => r.assetId));
    console.log('stats after ingest:', snap.stats);

    controller.selectAsset('clip-a');
    await controller.submitApproval({
      decision: 'approved',
      reviewedBy: 'verify@mwt.com',
      notes: 'Looks good',
    });

    snap = controller.getSnapshot();
    if (!snap.stats || snap.stats.approved !== 1 || snap.stats.pending !== 1) {
      throw new Error(`Stats after approve mismatch: ${JSON.stringify(snap.stats)}`);
    }
    if (snap.queue.some((row) => row.assetId === 'clip-a')) {
      throw new Error('Approved asset still listed under pending filter');
    }
    console.log('stats after approve:', snap.stats);

    controller.selectAsset('clip-b');
    await controller.submitApproval({
      decision: 'changesRequested',
      reviewedBy: 'verify@mwt.com',
      notes: 'Need louder grade',
    });

    await controller.setFilter('changesRequested');
    snap = controller.getSnapshot();
    if (snap.queue.length !== 1 || snap.queue[0].assetId !== 'clip-b') {
      throw new Error('changesRequested filter should list clip-b');
    }

    await controller.resubmitSelected(
      '/media/clip-b-v2.mp4',
      'file:///media/clip-b-v2.jpg'
    );
    snap = controller.getSnapshot();
    if (!snap.stats || snap.stats.pending !== 1 || snap.stats.changesRequested !== 0) {
      throw new Error(`Stats after resubmit: ${JSON.stringify(snap.stats)}`);
    }

    const history = await api.getAssetVersionHistory('clip-b');
    if (history.length < 3) {
      throw new Error(`Expected resubmit chain (≥3 history rows), got ${history.length}`);
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(App, { controller, reviewedBy: 'verify@mwt.com' })
      );
      await controller.refresh();
    });

    const text = collectText(renderer!.toJSON());
    if (!text.includes('MWT DAM')) {
      throw new Error('App render missing brand name MWT DAM');
    }
    if (!text.includes('Review workspace')) {
      throw new Error('App render missing workspace title');
    }

    console.log(
      JSON.stringify(
        {
          stats: snap.stats,
          pendingQueue: (await api.getReviewQueue('pending')).map((r) => r.assetId),
          clipBHistoryVersions: history.map((h) => ({
            version: h.version,
            decision: h.decision,
          })),
        },
        null,
        2
      )
    );
    console.log('Day 3-4 verify OK');
    db.close();
  } finally {
    setDamApi(null);
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
