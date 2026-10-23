import type { GalleryAsset, MediaPartition } from '../domain/gallery';

/** Raw row from curated `media/manifest.json` (or MANIFEST.json). */
export interface ManifestAssetRow {
  id?: string;
  assetId: string;
  title?: string | null;
  partition: MediaPartition;
  previewPath?: string;
  previewUrl: string;
  /** Repo-relative path (assets/media/…) for copy-path UI. */
  localPath?: string | null;
  /** Optional Notion / Drive / Supabase / CDN URL. */
  cloudUrl?: string | null;
  sourcePath?: string | null;
  /** Preferred lineage pointer in newer manifests. */
  parentSourceId?: string | null;
  parentId?: string | null;
  derivedFrom?: string | null;
  batch?: string | null;
  report?: string | null;
  /** Project section slug (`projects/<slug>/…` / manifest.projects). */
  project?: string | null;
  /** Gallery filter; usually same as `project`. */
  projectTag?: string | null;
  tags?: string[];
  description?: string | null;
}

export interface MediaManifest {
  version?: number | string;
  generatedAt?: string;
  counts?: Partial<Record<MediaPartition, number>>;
  lineageLinks?: number;
  assets: ManifestAssetRow[];
}

const MANIFEST_CANDIDATES = [
  '/media/manifest.json',
  '/media/MANIFEST.json',
] as const;

function resolveParentId(row: ManifestAssetRow): string | null {
  return row.parentSourceId ?? row.parentId ?? row.derivedFrom ?? null;
}

export function manifestRowToGalleryAsset(
  row: ManifestAssetRow,
  writerId: string,
  now = new Date().toISOString(),
): GalleryAsset {
  const parentSourceId = resolveParentId(row);
  const localPath =
    row.localPath?.trim() ||
    (row.previewPath ? `assets/media/${row.previewPath}` : null);

  return {
    id: row.id ?? row.assetId,
    assetId: row.assetId,
    status: 'pending',
    version: 1,
    revision: 1,
    sourceBackend: 'web',
    sourceIdentifier: row.sourcePath ?? row.previewPath ?? row.assetId,
    previewUrl: row.previewUrl,
    localPath,
    cloudUrl: row.cloudUrl?.trim() ? row.cloudUrl.trim() : null,
    projectTag: row.projectTag ?? row.project ?? row.batch ?? row.partition,
    project: row.project ?? null,
    tags: row.tags ?? [row.partition],
    description: row.description ?? null,
    notes: null,
    reviewedBy: null,
    createdAt: now,
    updatedAt: now,
    lastWriterId: writerId,
    title: row.title ?? null,
    partition: row.partition,
    parentSourceId,
    batch: row.batch ?? null,
    report: row.report ?? null,
  };
}

export async function fetchMediaManifest(): Promise<MediaManifest | null> {
  for (const url of MANIFEST_CANDIDATES) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as MediaManifest;
      if (Array.isArray(data.assets) && data.assets.length > 0) {
        return data;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function loadManifestSeed(
  writerId = 'manifest-seed',
): Promise<GalleryAsset[]> {
  const manifest = await fetchMediaManifest();
  if (!manifest) return [];
  const now = new Date().toISOString();
  return manifest.assets.map((row) =>
    manifestRowToGalleryAsset(row, writerId, now),
  );
}

/**
 * Walk parentSourceId toward Source of Truth. Returns chain from the asset
 * itself outward to the root original (inclusive of `asset`).
 */
export function buildLineageChain(
  asset: GalleryAsset,
  byId: Map<string, GalleryAsset>,
): GalleryAsset[] {
  const chain: GalleryAsset[] = [asset];
  const seen = new Set<string>([asset.assetId]);
  let cursor: string | null = asset.parentSourceId ?? null;
  while (cursor && !seen.has(cursor)) {
    const parent = byId.get(cursor);
    if (!parent) break;
    chain.push(parent);
    seen.add(parent.assetId);
    cursor = parent.parentSourceId ?? null;
  }
  return chain;
}

export function partitionLabel(partition: MediaPartition): string {
  switch (partition) {
    case 'originals':
      return 'Originals / Source of Truth';
    case 'tattoos':
      return 'Tattoos';
    case 'generated':
      return 'Generated';
    default: {
      const _exhaustive: never = partition;
      return _exhaustive;
    }
  }
}

export function displayTitle(asset: GalleryAsset): string {
  return asset.title?.trim() || asset.assetId;
}
