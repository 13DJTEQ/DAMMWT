import type { GalleryAsset } from '../domain/gallery';
import type { DecideInput, GalleryStore } from './GalleryStore';

/** Fallback demo rows when `/media/manifest.json` is unavailable. */
function demoSeedAssets(writerId: string): GalleryAsset[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'gq-1',
      assetId: 'demo-wave-01',
      status: 'pending',
      version: 1,
      revision: 1,
      sourceBackend: 'web',
      sourceIdentifier: 'seed/wave-01',
      previewUrl: 'https://picsum.photos/seed/dammwt-wave/640/400',
      projectTag: 'demo',
      tags: ['seed', 'gallery-v1'],
      description: 'Seed asset for web sync preview',
      notes: null,
      reviewedBy: null,
      createdAt: now,
      updatedAt: now,
      lastWriterId: writerId,
      title: 'Demo wave 01',
      partition: 'tattoos',
      parentSourceId: null,
    },
    {
      id: 'gq-2',
      assetId: 'demo-wave-02',
      status: 'pending',
      version: 1,
      revision: 1,
      sourceBackend: 'web',
      sourceIdentifier: 'seed/wave-02',
      previewUrl: 'https://picsum.photos/seed/dammwt-keep/640/400',
      projectTag: 'demo',
      tags: ['seed'],
      description: 'Second seed — try Love / Keep / Reject',
      notes: null,
      reviewedBy: null,
      createdAt: now,
      updatedAt: now,
      lastWriterId: writerId,
      title: 'Demo wave 02',
      partition: 'tattoos',
      parentSourceId: null,
    },
    {
      id: 'gq-3',
      assetId: 'demo-wave-03',
      status: 'love',
      version: 2,
      revision: 2,
      sourceBackend: 'web',
      sourceIdentifier: 'seed/wave-03',
      previewUrl: 'https://picsum.photos/seed/dammwt-love/640/400',
      projectTag: 'demo',
      tags: ['seed', 'loved'],
      description: 'Already loved — shows history-ready state',
      notes: 'Strong steering signal for generation',
      reviewedBy: 'web-preview',
      createdAt: now,
      updatedAt: now,
      lastWriterId: writerId,
      title: 'Demo wave 03',
      partition: 'originals',
      parentSourceId: null,
    },
  ];
}

export class MemoryGalleryStore implements GalleryStore {
  readonly kind = 'memory' as const;
  private rows = new Map<string, GalleryAsset>();

  constructor(writerId = 'memory-seed', seed?: GalleryAsset[]) {
    const initial = seed && seed.length > 0 ? seed : demoSeedAssets(writerId);
    for (const asset of initial) {
      this.rows.set(asset.assetId, asset);
    }
  }

  async list(): Promise<GalleryAsset[]> {
    return [...this.rows.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async get(assetId: string): Promise<GalleryAsset | null> {
    return this.rows.get(assetId) ?? null;
  }

  async upsert(asset: GalleryAsset): Promise<GalleryAsset> {
    this.rows.set(asset.assetId, asset);
    return asset;
  }

  async decide(input: DecideInput): Promise<GalleryAsset> {
    const existing = this.rows.get(input.assetId);
    if (!existing) {
      throw new Error(`Unknown asset: ${input.assetId}`);
    }
    const next: GalleryAsset = {
      ...existing,
      status: input.decision,
      version: existing.version + 1,
      revision: existing.revision + 1,
      notes: input.notes?.trim() ? input.notes.trim() : existing.notes,
      reviewedBy: input.reviewedBy,
      updatedAt: new Date().toISOString(),
      lastWriterId: input.writerId,
    };
    this.rows.set(next.assetId, next);
    return next;
  }

  async replaceAll(assets: GalleryAsset[]): Promise<void> {
    this.rows.clear();
    for (const asset of assets) {
      this.rows.set(asset.assetId, asset);
    }
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
