import type { GalleryAsset } from '../domain/gallery';
import type { DecideInput, GalleryStore } from './GalleryStore';
import { MemoryGalleryStore } from './MemoryGalleryStore';

const DB_NAME = 'dammwt-gallery';
const STORE_NAME = 'assets';
const DB_VERSION = 1;

/**
 * Local browser persistence via IndexedDB.
 * Falls back to an in-memory seed when IndexedDB is unavailable.
 */
export class IndexedDbGalleryStore implements GalleryStore {
  readonly kind = 'indexeddb' as const;
  private fallback: MemoryGalleryStore | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private useMemory = typeof indexedDB === 'undefined';

  private memory(): MemoryGalleryStore {
    if (!this.fallback) {
      this.fallback = new MemoryGalleryStore('indexeddb-fallback');
    }
    return this.fallback;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.useMemory) {
      return Promise.reject(new Error('IndexedDB unavailable'));
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => {
          this.useMemory = true;
          reject(request.error ?? new Error('IDB open failed'));
        };
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'assetId' });
          }
        };
        request.onsuccess = () => resolve(request.result);
      });
    }
    return this.dbPromise;
  }

  private readAll(db: IDBDatabase): Promise<GalleryAsset[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result as GalleryAsset[]);
    });
  }

  private put(db: IDBDatabase, asset: GalleryAsset): Promise<GalleryAsset> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(asset);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(asset);
    });
  }

  private getOne(db: IDBDatabase, assetId: string): Promise<GalleryAsset | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(assetId);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve((req.result as GalleryAsset | undefined) ?? null);
    });
  }

  private clear(db: IDBDatabase): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  private async ensureSeeded(db: IDBDatabase): Promise<void> {
    const existing = await this.readAll(db);
    if (existing.length > 0) return;
    const seed = new MemoryGalleryStore('indexeddb-seed');
    for (const asset of await seed.list()) {
      await this.put(db, asset);
    }
  }

  async list(): Promise<GalleryAsset[]> {
    if (this.useMemory) return this.memory().list();
    try {
      const db = await this.openDb();
      await this.ensureSeeded(db);
      const rows = await this.readAll(db);
      return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      this.useMemory = true;
      return this.memory().list();
    }
  }

  async get(assetId: string): Promise<GalleryAsset | null> {
    if (this.useMemory) return this.memory().get(assetId);
    try {
      const db = await this.openDb();
      await this.ensureSeeded(db);
      return this.getOne(db, assetId);
    } catch {
      this.useMemory = true;
      return this.memory().get(assetId);
    }
  }

  async upsert(asset: GalleryAsset): Promise<GalleryAsset> {
    if (this.useMemory) return this.memory().upsert(asset);
    try {
      const db = await this.openDb();
      return this.put(db, asset);
    } catch {
      this.useMemory = true;
      return this.memory().upsert(asset);
    }
  }

  async decide(input: DecideInput): Promise<GalleryAsset> {
    if (this.useMemory) return this.memory().decide(input);
    try {
      const db = await this.openDb();
      await this.ensureSeeded(db);
      const existing = await this.getOne(db, input.assetId);
      if (!existing) throw new Error(`Unknown asset: ${input.assetId}`);
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
      return this.put(db, next);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Unknown asset')) throw err;
      this.useMemory = true;
      return this.memory().decide(input);
    }
  }

  async replaceAll(assets: GalleryAsset[]): Promise<void> {
    if (this.useMemory) {
      await this.memory().replaceAll(assets);
      return;
    }
    try {
      const db = await this.openDb();
      await this.clear(db);
      for (const asset of assets) {
        await this.put(db, asset);
      }
    } catch {
      this.useMemory = true;
      await this.memory().replaceAll(assets);
    }
  }

  async healthCheck(): Promise<boolean> {
    if (this.useMemory) return false;
    try {
      await this.openDb();
      return true;
    } catch {
      return false;
    }
  }
}
