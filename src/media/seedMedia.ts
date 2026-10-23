/**
 * Ingest tattoo-design manifest assets into ReviewQueue with local file:// previews.
 * Used on first Electron launch and by `npm run seed:media`.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import { pathToFileURL } from 'url';
import type {
  DatabaseManager,
  MediaPartition,
} from '../database/DatabaseManager';

export interface ManifestAsset {
  id?: string;
  assetId: string;
  title?: string | null;
  partition: MediaPartition;
  previewPath: string;
  previewUrl?: string;
  /** Repo-relative or absolute path (e.g. assets/media/tattoos/…). */
  localPath?: string | null;
  /** Optional Notion / Drive / Supabase / CDN URL. */
  cloudUrl?: string | null;
  sourcePath?: string | null;
  /** Canonical lineage pointer (preferred). */
  parentSourceId?: string | null;
  derivedFrom?: string | null;
  parentId?: string | null;
  batch?: string | null;
  report?: string | null;
  tags?: string[];
  description?: string | null;
}

export interface MediaManifest {
  version: number;
  generatedAt?: string;
  counts?: Partial<Record<MediaPartition, number>>;
  lineageLinks?: number;
  assets: ManifestAsset[];
}

export interface SeedMediaResult {
  mediaRoot: string;
  manifestPath: string;
  inserted: number;
  skipped: number;
  missingFiles: string[];
  total: number;
}

const PARTITIONS: ReadonlySet<string> = new Set([
  'originals',
  'tattoos',
  'generated',
]);

/**
 * Resolve assets/media next to the repo root (dev) or beside dist/.
 */
export function resolveMediaRoot(cwd: string = process.cwd()): string | null {
  const candidates = [
    join(cwd, 'assets', 'media'),
    join(dirname(__dirname), '..', 'assets', 'media'),
    join(__dirname, '..', '..', 'assets', 'media'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'manifest.json'))) {
      return candidate;
    }
  }
  return null;
}

export function loadMediaManifest(mediaRoot: string): MediaManifest {
  const manifestPath = join(mediaRoot, 'manifest.json');
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as MediaManifest;
  if (!raw || !Array.isArray(raw.assets)) {
    throw new Error(`Invalid media manifest at ${manifestPath}`);
  }
  return raw;
}

function previewFileUrl(mediaRoot: string, previewPath: string): string {
  const absolute = isAbsolute(previewPath)
    ? previewPath
    : join(mediaRoot, previewPath);
  return pathToFileURL(absolute).href;
}

/**
 * Seed ReviewQueue from assets/media/manifest.json.
 * Idempotent — existing assetIds are left unchanged.
 */
export function seedMediaFromManifest(
  db: DatabaseManager,
  options: { mediaRoot?: string; forceEmptyOnly?: boolean } = {}
): SeedMediaResult {
  const mediaRoot = options.mediaRoot ?? resolveMediaRoot();
  if (!mediaRoot) {
    throw new Error(
      'assets/media/manifest.json not found. Run: node scripts/curate-media.mjs'
    );
  }

  if (options.forceEmptyOnly && !db.isEmpty()) {
    const manifestPath = join(mediaRoot, 'manifest.json');
    return {
      mediaRoot,
      manifestPath,
      inserted: 0,
      skipped: 0,
      missingFiles: [],
      total: 0,
    };
  }

  const manifest = loadMediaManifest(mediaRoot);
  const manifestPath = join(mediaRoot, 'manifest.json');
  let inserted = 0;
  let skipped = 0;
  const missingFiles: string[] = [];

  for (const asset of manifest.assets) {
    const assetId = asset.assetId || asset.id;
    if (!assetId) {
      skipped += 1;
      continue;
    }
    if (!PARTITIONS.has(asset.partition)) {
      skipped += 1;
      continue;
    }

    const previewPath = asset.previewPath;
    const absolutePreview = join(mediaRoot, previewPath);
    if (!existsSync(absolutePreview)) {
      missingFiles.push(previewPath);
      skipped += 1;
      continue;
    }

    const parentSourceId =
      asset.parentSourceId ?? asset.parentId ?? asset.derivedFrom ?? null;
    const tags = Array.isArray(asset.tags) ? [...asset.tags] : [];
    if (asset.batch && !tags.includes(asset.batch)) {
      tags.push(asset.batch);
    }
    if (asset.partition === 'originals' && !tags.includes('source-of-truth')) {
      tags.push('source-of-truth');
    }

    // Prefer absolute disk path for Electron Reveal / Open file.
    const localPath = isAbsolute(asset.localPath ?? '')
      ? (asset.localPath as string)
      : absolutePreview;
    const cloudUrl = asset.cloudUrl?.trim() ? asset.cloudUrl.trim() : null;

    const result = db.ingestAssetIfAbsent({
      assetId,
      sourceBackend: 'local',
      sourceIdentifier: absolutePreview,
      previewUrl: previewFileUrl(mediaRoot, previewPath),
      localPath,
      cloudUrl,
      projectTag: asset.batch ?? asset.partition,
      tags,
      description: asset.description ?? undefined,
      partition: asset.partition,
      parentSourceId,
      title: asset.title ?? assetId,
    });

    if (result.inserted) {
      inserted += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    mediaRoot,
    manifestPath,
    inserted,
    skipped,
    missingFiles,
    total: manifest.assets.length,
  };
}
