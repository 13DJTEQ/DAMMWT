import type { GalleryAsset } from '../domain/gallery';
import type { GalleryStore } from '../storage/GalleryStore';
import { mergeAssetMaps } from './conflict';
import type {
  SyncBackendKind,
  SyncCursor,
  SyncPhase,
  SyncPullResult,
  SyncPushResult,
  SyncStatusSnapshot,
} from './types';

export interface SyncTransport {
  readonly kind: SyncBackendKind;
  pull(cursor: SyncCursor): Promise<SyncPullResult>;
  push(assets: GalleryAsset[], cursor: SyncCursor): Promise<SyncPushResult>;
}

/**
 * Thin sync orchestrator: pull → merge (CRDT-lite) → write store → push dirty.
 * Transport is pluggable (memory stub today; Supabase later).
 */
export class SyncClient {
  private phase: SyncPhase = 'idle';
  private lastPulledAt: string | null = null;
  private lastPushedAt: string | null = null;
  private lastError: string | null = null;
  private cursor: SyncCursor;
  private dirty = new Set<string>();
  private listeners = new Set<(status: SyncStatusSnapshot) => void>();

  constructor(
    private readonly store: GalleryStore,
    private readonly transport: SyncTransport,
    initialCursor: SyncCursor = { since: '0' },
  ) {
    this.cursor = initialCursor;
  }

  getStatus(): SyncStatusSnapshot {
    return {
      phase: this.phase,
      lastPulledAt: this.lastPulledAt,
      lastPushedAt: this.lastPushedAt,
      lastError: this.lastError,
      pendingPushCount: this.dirty.size,
      backend: this.transport.kind,
    };
  }

  subscribe(listener: (status: SyncStatusSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  markDirty(assetId: string): void {
    this.dirty.add(assetId);
    this.emit();
  }

  async sync(): Promise<GalleryAsset[]> {
    await this.pull();
    return this.push();
  }

  async pull(): Promise<GalleryAsset[]> {
    this.setPhase('pulling');
    try {
      const result = await this.transport.pull(this.cursor);
      const local = await this.store.list();
      const merged = mergeAssetMaps(local, result.assets);
      await this.store.replaceAll(merged);
      this.cursor = result.cursor;
      this.lastPulledAt = new Date().toISOString();
      this.lastError = null;
      this.setPhase('idle');
      return merged;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.setPhase('error');
      throw err;
    }
  }

  async push(): Promise<GalleryAsset[]> {
    this.setPhase('pushing');
    try {
      const local = await this.store.list();
      const payload =
        this.dirty.size === 0
          ? local
          : local.filter((row) => this.dirty.has(row.assetId));
      const result = await this.transport.push(payload, this.cursor);
      for (const id of result.accepted) {
        this.dirty.delete(id);
      }
      this.cursor = result.cursor;
      this.lastPushedAt = new Date().toISOString();
      this.lastError = null;
      this.setPhase('idle');
      return this.store.list();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.setPhase('error');
      throw err;
    }
  }

  private setPhase(phase: SyncPhase): void {
    this.phase = phase;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getStatus();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
