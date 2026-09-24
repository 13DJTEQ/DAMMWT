import { createReadStream, existsSync, promises as fs, readdirSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { createHash } from 'crypto';
import type { Asset, LocalBackendConfig, StorageBackend } from './StorageBackend';

const MEDIA_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.mkv',
  '.webm',
  '.avi',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.tif',
  '.tiff',
  '.wav',
  '.mp3',
  '.aac',
  '.flac',
  '.pdf',
]);

/**
 * Local filesystem storage adapter — directory scan + file:// preview URLs.
 */
export class LocalBackend implements StorageBackend {
  private readonly root: string;

  constructor(config: LocalBackendConfig) {
    this.root = config.localPath;
  }

  async getAsset(sourceId: string): Promise<Asset> {
    const absolute = this.resolvePath(sourceId);
    const stats = await fs.stat(absolute);
    if (!stats.isFile()) {
      throw new Error(`Local asset is not a file: ${sourceId}`);
    }
    return this.toAsset(absolute, stats);
  }

  async listRecent(limit: number): Promise<Asset[]> {
    if (!existsSync(this.root)) {
      return [];
    }
    const files = this.walk(this.root);
    const assets = await Promise.all(
      files.map(async (filePath) => {
        const stats = await fs.stat(filePath);
        return this.toAsset(filePath, stats);
      })
    );
    return assets
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(0, limit));
  }

  async archiveForRetention(sourceId: string): Promise<string> {
    const absolute = this.resolvePath(sourceId);
    const retentionDir = join(this.root, '.retention');
    await fs.mkdir(retentionDir, { recursive: true });
    const hash = await this.sha256(absolute);
    const dest = join(retentionDir, `${hash}${extname(absolute)}`);
    await fs.copyFile(absolute, dest);
    return dest;
  }

  async moveToColdstorage(retentionId: string): Promise<string> {
    if (!existsSync(retentionId)) {
      throw new Error(`Retention object missing: ${retentionId}`);
    }
    const coldDir = join(this.root, '.coldstorage');
    await fs.mkdir(coldDir, { recursive: true });
    const dest = join(coldDir, basename(retentionId));
    await fs.rename(retentionId, dest);
    return `file://${dest}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await fs.access(this.root);
      const stats = await fs.stat(this.root);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private resolvePath(sourceId: string): string {
    const absolute = sourceId.startsWith('/') ? sourceId : join(this.root, sourceId);
    if (!existsSync(absolute)) {
      throw new Error(`Local asset not found: ${sourceId}`);
    }
    return absolute;
  }

  private walk(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.walk(full));
      } else if (MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
    return results;
  }

  private toAsset(
    absolute: string,
    stats: { size: number; mtime: Date; birthtime: Date }
  ): Asset {
    const rel = relative(this.root, absolute) || basename(absolute);
    return {
      id: rel,
      sourceBackend: 'local',
      sourceIdentifier: absolute,
      previewUrl: `file://${absolute}`,
      mimeType: this.guessMime(absolute),
      byteSize: stats.size,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
    };
  }

  private guessMime(filePath: string): string | undefined {
    const ext = extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.pdf': 'application/pdf',
    };
    return map[ext];
  }

  private sha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }
}
