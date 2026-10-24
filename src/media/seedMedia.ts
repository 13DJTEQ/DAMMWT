/**
 * Ingest tattoo-design manifest assets into ReviewQueue with local file:// previews.
 * Used on Electron launch, Refresh / manifest watch, and `npm run seed:media`.
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
  /** Project section slug (`projects/<slug>/…` / manifest.projects). */
  project?: string | null;
  /** Gallery filter; usually same as `project`. */
  projectTag?: string | null;
  tags?: string[];
  description?: string | null;
}

/** Registry entry from `manifest.projects[]` (may have zero assets yet). */
export interface MediaProject {
  slug: string;
  path?: string;
  partitions?: string[];
  createdAt?: string;
}

export interface MediaManifest {
  version: number;
  generatedAt?: string;
  counts?: Partial<Record<MediaPartition, number>>;
  lineageLinks?: number;
  assets: ManifestAsset[];
  /** Project sections from dam:section / push:media --project. */
  projects?: MediaProject[];
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
 * Resolve assets/media for watch / seed.
 * Prefer paths relative to this module (dist/media → repo/assets/media) so a
 * wrong process.cwd() (packaged launch, IDE run config) cannot miss the tree.
 */
export function resolveMediaRoot(cwd: string = process.cwd()): string | null {
  const moduleRepoRoot = join(__dirname, '..', '..');
  const candidates = [
    // dist/media/seedMedia.js → <repo>/assets/media
    join(moduleRepoRoot, 'assets', 'media'),
    join(dirname(__dirname), '..', 'assets', 'media'),
    join(cwd, 'assets', 'media'),
    // Extra fallbacks when cwd is dist/ or scripts/
    join(cwd, '..', 'assets', 'media'),
    join(cwd, '..', '..', 'assets', 'media'),
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
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
  if (!Array.isArray(raw.projects)) {
    raw.projects = [];
  }
  return raw;
}

/**
 * Project section slugs registered in manifest.projects[] (including empty).
 */
export function listMediaProjects(
  mediaRoot?: string | null
): MediaProject[] {
  const root = mediaRoot ?? resolveMediaRoot();
  if (!root) return [];
  try {
    const manifest = loadMediaManifest(root);
    const projects = Array.isArray(manifest.projects) ? manifest.projects : [];
    return projects
      .filter(
        (p): p is MediaProject =>
          !!p && typeof p.slug === 'string' && p.slug.trim().length > 0
      )
      .map((p) => ({
        slug: p.slug.trim(),
        path: p.path,
        partitions: p.partitions,
        createdAt: p.createdAt,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  } catch {
    return [];
  }
}

/** Sorted unique slugs from manifest.projects[]. */
export function listMediaProjectSlugs(mediaRoot?: string | null): string[] {
  return listMediaProjects(mediaRoot).map((p) => p.slug);
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
      projectTag:
        asset.projectTag ?? asset.project ?? asset.batch ?? asset.partition,
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
