import type { Asset, FalBackendConfig, StorageBackend } from './StorageBackend';

interface FalJobResponse {
  request_id?: string;
  status?: string;
  images?: Array<{ url: string; content_type?: string }>;
  video?: { url: string; content_type?: string };
  output?: { url?: string };
  created_at?: string;
}

/**
 * fal.ai storage adapter — fetch generated assets by job/request id.
 * Handles ephemeral CDN URLs returned by the fal HTTP API.
 */
export class FalBackend implements StorageBackend {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly cache = new Map<string, Asset>();

  constructor(config: FalBackendConfig) {
    this.apiKey = config.apiKey ?? process.env.FAL_KEY ?? '';
    this.baseUrl = (config.baseUrl ?? 'https://api.fal.ai').replace(/\/$/, '');
  }

  async getAsset(sourceId: string): Promise<Asset> {
    const cached = this.cache.get(sourceId);
    if (cached) {
      return cached;
    }

    if (!this.apiKey) {
      // Offline / mock path for Day 1 scaffold verification without credentials.
      const mock = this.mockAsset(sourceId);
      this.cache.set(sourceId, mock);
      return mock;
    }

    const response = await fetch(`${this.baseUrl}/requests/${encodeURIComponent(sourceId)}`, {
      headers: {
        Authorization: `Key ${this.apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`fal.ai getAsset failed (${response.status}): ${sourceId}`);
    }

    const payload = (await response.json()) as FalJobResponse;
    const previewUrl = this.extractPreviewUrl(payload, sourceId);
    const now = new Date().toISOString();
    const asset: Asset = {
      id: sourceId,
      sourceBackend: 'fal.ai',
      sourceIdentifier: sourceId,
      previewUrl,
      mimeType: this.extractMime(payload),
      createdAt: payload.created_at ?? now,
      updatedAt: now,
    };
    this.cache.set(sourceId, asset);
    return asset;
  }

  async listRecent(limit: number): Promise<Asset[]> {
    const items = Array.from(this.cache.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
    return items.slice(0, Math.max(0, limit));
  }

  async archiveForRetention(sourceId: string): Promise<string> {
    const asset = await this.getAsset(sourceId);
    const retentionId = `fal-retention:${asset.id}:${Date.now()}`;
    return retentionId;
  }

  async moveToColdstorage(retentionId: string): Promise<string> {
    if (!retentionId.startsWith('fal-retention:')) {
      throw new Error(`Invalid fal retention id: ${retentionId}`);
    }
    return `cold://fal.ai/${encodeURIComponent(retentionId)}`;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) {
      // Scaffold health: API key optional; backend still constructible.
      return true;
    }
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'HEAD',
        headers: { Authorization: `Key ${this.apiKey}` },
      });
      return response.ok || response.status === 404 || response.status === 405;
    } catch {
      return false;
    }
  }

  private extractPreviewUrl(payload: FalJobResponse, sourceId: string): string {
    if (payload.images?.[0]?.url) return payload.images[0].url;
    if (payload.video?.url) return payload.video.url;
    if (payload.output?.url) return payload.output.url;
    // Ephemeral fallback so ingest can proceed when payload shape varies.
    return `https://fal.media/files/${encodeURIComponent(sourceId)}`;
  }

  private extractMime(payload: FalJobResponse): string | undefined {
    return (
      payload.images?.[0]?.content_type ??
      payload.video?.content_type ??
      undefined
    );
  }

  private mockAsset(sourceId: string): Asset {
    const now = new Date().toISOString();
    return {
      id: sourceId,
      sourceBackend: 'fal.ai',
      sourceIdentifier: sourceId,
      previewUrl: `https://fal.media/files/${encodeURIComponent(sourceId)}`,
      description: 'Mock fal.ai asset (no FAL_KEY configured)',
      createdAt: now,
      updatedAt: now,
    };
  }
}
