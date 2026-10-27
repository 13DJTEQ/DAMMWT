import type { GalleryAsset } from '../domain/gallery';
import { mergeAssetMaps } from './conflict';
import type { SyncTransport } from './SyncClient';
import type { SyncCursor, SyncPullResult, SyncPushResult } from './types';

/**
 * In-memory “cloud” for local preview. Simulates a shared remote that multiple
 * SyncClient instances could attach to in the same browser session.
 */
export class MemorySyncTransport implements SyncTransport {
  readonly kind = 'memory' as const;
  private remote = new Map<string, GalleryAsset>();
  private revisionClock = 0;

  constructor(seed: GalleryAsset[] = []) {
    for (const asset of seed) {
      this.remote.set(asset.assetId, asset);
      this.revisionClock = Math.max(this.revisionClock, asset.revision);
    }
  }

  async pull(cursor: SyncCursor): Promise<SyncPullResult> {
    const since = Number(cursor.since) || 0;
    const assets = [...this.remote.values()].filter((a) => a.revision > since);
    return {
      assets,
      cursor: { since: String(this.revisionClock) },
    };
  }

  async push(assets: GalleryAsset[], _cursor: SyncCursor): Promise<SyncPushResult> {
    const accepted: string[] = [];
    const rejected: Array<{ assetId: string; reason: string }> = [];
    const merged = mergeAssetMaps([...this.remote.values()], assets);
    this.remote.clear();
    for (const asset of merged) {
      this.remote.set(asset.assetId, asset);
      this.revisionClock = Math.max(this.revisionClock, asset.revision);
      if (assets.some((a) => a.assetId === asset.assetId)) {
        accepted.push(asset.assetId);
      }
    }
    for (const asset of assets) {
      if (!accepted.includes(asset.assetId)) {
        rejected.push({ assetId: asset.assetId, reason: 'lost conflict merge' });
      }
    }
    return {
      accepted,
      rejected,
      cursor: { since: String(this.revisionClock) },
    };
  }

  /** Test / demo helper: inspect remote snapshot. */
  snapshot(): GalleryAsset[] {
    return [...this.remote.values()];
  }
}
