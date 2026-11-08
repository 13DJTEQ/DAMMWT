#!/usr/bin/env node
/**
 * Push one or more media files into DAMMWT's curated store + manifest,
 * then idempotently ingest new ReviewQueue rows (Electron ABI).
 *
 * Designed for Cursor skills / other repos:
 *   cd "$DAMMWT_ROOT" && npm run push:media -- --file /abs/out.png --partition generated
 *   DAMMWT_ROOT=/path/to/DAMMWT node "$DAMMWT_ROOT/scripts/push-media.mjs" \
 *     --file /abs/out.png --partition generated
 *
 * Project sections (isolated trees):
 *   npm run dam:section -- --project my-slug
 *   npm run push:media -- --create-section --project my-slug
 *   npm run push:media -- --file /abs/out.png --partition generated --project my-slug
 *
 * Flags:
 *   --file <path>           Single source file (absolute or relative to cwd)
 *   --dir <path>            Directory of images to push
 *   --partition <name>      originals | tattoos | generated (required unless --create-section)
 *   --project <slug>        Project section; stages under projects/<slug>/<partition>/…
 *   --create-section        Ensure project dirs + manifest.projects entry (no file push)
 *   --asset-id <id>         Explicit assetId (only with --file)
 *   --parent <assetId>      parentSourceId lineage pointer
 *   --tags <a,b,c>          Comma-separated tags
 *   --pipeline <name>       Optional subfolder under the partition
 *   --batch <name>          Batch tag (also added to tags if missing)
 *   --cloud-url <url>       Optional http(s) cloud link
 *   --title <text>          Display title (defaults from filename)
 *   --dry-run               Plan only — no copy, manifest, or ingest
 *   --no-ingest             Skip Electron ReviewQueue seed after staging
 *
 * Env:
 *   DAMMWT_ROOT             Repo root (default: parent of scripts/)
 *   DAM_DB_PATH             Override Electron DB path for ingest
 */
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { spawnSync } from 'child_process';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const PARTITIONS = new Set(['originals', 'tattoos', 'generated']);
const PARTITION_LIST = ['originals', 'tattoos', 'generated'];
const IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.svg',
  '.heic',
  '.tif',
  '.tiff',
]);

/** @typedef {{ slug: string, path: string, partitions: string[], createdAt: string, updatedAt?: string }} ProjectSection */

function printUsage(code = 1) {
  console.log(`Usage:
  npm run push:media -- --file <path> --partition <originals|tattoos|generated> [options]
  npm run push:media -- --dir <path> --partition <…> [options]
  npm run push:media -- --create-section --project <slug>
  npm run dam:section -- --project <slug>

Options:
  --file <path>        Single image (absolute OK from any cwd when DAMMWT_ROOT set)
  --dir <path>         Directory of images
  --partition <name>   originals | tattoos | generated (required for push)
  --project <slug>     Isolate under projects/<slug>/…; tags + projectTag set
  --create-section     Create/ensure project dirs + manifest registry (idempotent)
  --asset-id <id>      Explicit assetId (--file only)
  --parent <assetId>   parentSourceId
  --tags <a,b,c>       Comma-separated tags
  --pipeline <name>    Subfolder under the partition
  --batch <name>       Batch tag
  --cloud-url <url>    Optional cloud URL
  --title <text>       Title (--file only; dirs use filenames)
  --dry-run            Print plan only
  --no-ingest          Skip Electron DB ingest

Env: DAMMWT_ROOT, DAM_DB_PATH, ELECTRON_PATH`);
  process.exit(code);
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      out.help = true;
      continue;
    }
    if (a === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (a === '--no-ingest') {
      out.noIngest = true;
      continue;
    }
    if (a === '--create-section' || a === 'create-section') {
      out.createSection = true;
      continue;
    }
    if (!a.startsWith('--')) {
      throw new Error(`Unexpected argument: ${a}`);
    }
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    out[key] = val;
    i += 1;
  }
  return out;
}

function resolveRoot() {
  const fromEnv = process.env.DAMMWT_ROOT?.trim();
  if (fromEnv) {
    const abs = resolve(fromEnv);
    if (!existsSync(join(abs, 'package.json'))) {
      throw new Error(`DAMMWT_ROOT does not look like the repo: ${abs}`);
    }
    return abs;
  }
  return join(__dirname, '..');
}

function slugify(fileBase) {
  return fileBase
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * Normalize a project slug (lowercase kebab). Reject empty / unsafe paths.
 * @param {string} raw
 */
function normalizeProjectSlug(raw) {
  const slug = slugify(raw.trim());
  if (!slug) {
    throw new Error('--project slug is empty after normalization');
  }
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    throw new Error(`Invalid --project slug: ${raw}`);
  }
  return slug;
}

/**
 * @param {string} partition
 * @param {string} destRel
 * @param {string | undefined} pipeline
 * @param {string | null} projectSlug
 */
function makeAssetId(partition, destRel, pipeline, projectSlug) {
  const base = slugify(basename(destRel));
  let id;
  if (partition === 'originals') {
    if (destRel.includes('/base/')) id = `orig-base-${base}`;
    else if (destRel.includes('/esoteric/')) id = `orig-esoteric-${base}`;
    else if (destRel.includes('/scorpions/')) id = `orig-scorpions-${base}`;
    else id = `orig-${base}`;
  } else if (partition === 'generated') {
    const pipe = pipeline ? slugify(pipeline) : 'push';
    id = `gen-${pipe}-${base}`;
  } else if (destRel.includes('/flash/')) {
    id = `tat-flash-${base}`;
  } else if (destRel.includes('/arm-leg/')) {
    id = `tat-arm-leg-${base}`;
  } else if (destRel.includes('/arm-shoulder/')) {
    id = `tat-arm-shoulder-${base}`;
  } else if (destRel.includes('/body-maps/')) {
    id = `tat-body-map-${base}`;
  } else if (destRel.includes('/scorpions/')) {
    id = `tat-scorp-${base}`;
  } else if (pipeline) {
    id = `tat-${slugify(pipeline)}-${base}`;
  } else {
    id = `tat-${base}`;
  }

  if (projectSlug) {
    const prefix = `proj-${projectSlug}-`;
    return id.startsWith(prefix) ? id : `${prefix}${id}`;
  }
  return id;
}

/**
 * Prefer hardlink (cheap when same volume); fall back to copy.
 * @param {string} from
 * @param {string} to
 */
function linkOrCopy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to)) {
    try {
      // Same inode already? overwrite via copy for simplicity
    } catch {
      /* ignore */
    }
  }
  try {
    if (existsSync(to)) {
      copyFileSync(from, to);
      return 'copy';
    }
    linkSync(from, to);
    return 'hardlink';
  } catch {
    copyFileSync(from, to);
    return 'copy';
  }
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function listImages(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listImages(full));
      continue;
    }
    if (ent.isFile() && IMAGE_EXTS.has(extname(ent.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * @param {string} mediaRoot
 */
function loadManifest(mediaRoot) {
  const path = join(mediaRoot, 'manifest.json');
  if (!existsSync(path)) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      mediaRoot: 'assets/media',
      webPublicRoot: 'web/public/media',
      counts: { originals: 0, tattoos: 0, generated: 0 },
      lineageLinks: 0,
      skipped: [],
      projects: [],
      assets: [],
    };
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw || !Array.isArray(raw.assets)) {
    throw new Error(`Invalid manifest at ${path}`);
  }
  if (!Array.isArray(raw.projects)) {
    raw.projects = [];
  }
  return raw;
}

/**
 * @param {object} manifest
 * @param {string} assetsMedia
 * @param {string} webMedia
 */
function writeManifest(manifest, assetsMedia, webMedia) {
  const counts = {
    originals: manifest.assets.filter((a) => a.partition === 'originals').length,
    tattoos: manifest.assets.filter((a) => a.partition === 'tattoos').length,
    generated: manifest.assets.filter((a) => a.partition === 'generated').length,
  };
  const lineageLinks = manifest.assets.filter((a) => a.parentSourceId).length;
  const projects = Array.isArray(manifest.projects) ? manifest.projects : [];
  const next = {
    ...manifest,
    version: manifest.version ?? 1,
    generatedAt: new Date().toISOString(),
    mediaRoot: 'assets/media',
    webPublicRoot: 'web/public/media',
    projectSchema: {
      path: 'projects/<slug>/{originals|tattoos|generated}/…',
      registry: 'manifest.projects[] — slug, path, partitions, createdAt',
      assetFields: [
        'project (slug)',
        'projectTag (Gallery filter; usually same as project)',
        'tags include project:<slug>',
      ],
      assetIdPrefix: 'proj-<slug>-…',
    },
    counts,
    lineageLinks,
    projects,
    assets: manifest.assets,
  };
  const json = `${JSON.stringify(next, null, 2)}\n`;
  for (const dir of [assetsMedia, webMedia]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), json);
  }
  return next;
}

/**
 * Ensure project directory trees + manifest.projects entry (idempotent).
 * @param {string} root
 * @param {string} projectSlug
 * @param {object} manifest
 * @param {boolean} dryRun
 * @returns {{ created: boolean, path: string, project: ProjectSection }}
 */
function ensureProjectSection(root, projectSlug, manifest, dryRun) {
  const relRoot = `projects/${projectSlug}`;
  const assetsMedia = join(root, 'assets', 'media');
  const webMedia = join(root, 'web', 'public', 'media');
  const now = new Date().toISOString();

  /** @type {ProjectSection[]} */
  const projects = Array.isArray(manifest.projects) ? [...manifest.projects] : [];
  const existingIdx = projects.findIndex((p) => p && p.slug === projectSlug);
  const existing = existingIdx >= 0 ? projects[existingIdx] : null;

  if (!dryRun) {
    for (const base of [assetsMedia, webMedia]) {
      for (const part of PARTITION_LIST) {
        mkdirSync(join(base, 'projects', projectSlug, part), { recursive: true });
      }
    }
  }

  /** @type {ProjectSection} */
  const project = existing
    ? {
        ...existing,
        path: existing.path || relRoot,
        partitions: PARTITION_LIST.slice(),
        updatedAt: now,
      }
    : {
        slug: projectSlug,
        path: relRoot,
        partitions: PARTITION_LIST.slice(),
        createdAt: now,
        updatedAt: now,
      };

  if (existingIdx >= 0) {
    projects[existingIdx] = project;
  } else {
    projects.push(project);
  }
  manifest.projects = projects;

  return {
    created: !existing,
    path: relRoot,
    project,
  };
}

/**
 * @param {string} root
 * @param {boolean} dryRun
 */
function ensureDistForIngest(root, dryRun) {
  const distDb = join(root, 'dist', 'database', 'DatabaseManager.js');
  const distSeed = join(root, 'dist', 'media', 'seedMedia.js');
  if (existsSync(distDb) && existsSync(distSeed)) return true;
  if (dryRun) return false;
  console.log('dist/ missing seed modules — running npm run build…');
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (build.status !== 0) {
    throw new Error('npm run build failed; cannot ingest into Electron DB');
  }
  return true;
}

/**
 * @param {string} root
 */
function runElectronIngest(root) {
  const entry = join(root, 'scripts', 'seed-media-electron.js');
  const electron =
    process.env.ELECTRON_PATH ||
    require('electron'); /* path string when required from Node */

  if (typeof electron !== 'string') {
    throw new Error('Could not resolve electron binary path.');
  }

  console.log('Ingesting new rows via Electron (seedMediaFromManifest)…');
  const result = spawnSync(electron, [entry], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Electron media ingest failed (exit ${result.status ?? 1})`);
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    printUsage(1);
    return;
  }

  if (args.help) {
    printUsage(0);
    return;
  }

  const root = resolveRoot();
  const dryRun = Boolean(args.dryRun);
  const noIngest = Boolean(args.noIngest);
  const createSection = Boolean(args.createSection);

  let projectSlug = null;
  if (typeof args.project === 'string' && args.project.trim()) {
    try {
      projectSlug = normalizeProjectSlug(args.project);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  if (createSection && !projectSlug) {
    console.error('--create-section requires --project <slug>');
    printUsage(1);
    return;
  }

  const assetsMedia = join(root, 'assets', 'media');
  const webMedia = join(root, 'web', 'public', 'media');
  const manifest = loadManifest(assetsMedia);

  // --- create-section only -------------------------------------------------
  if (createSection && !args.file && !args.dir) {
    console.log(`DAMMWT root: ${root}`);
    console.log(`Project:     ${projectSlug}${dryRun ? ' (dry-run)' : ''}`);
    const result = ensureProjectSection(root, projectSlug, manifest, dryRun);
    if (dryRun) {
      console.log(
        `Dry-run: would ${result.created ? 'create' : 'ensure'} ${result.path}/{originals,tattoos,generated}/ (+ web mirror)`,
      );
      return;
    }
    writeManifest(manifest, assetsMedia, webMedia);
    console.log(
      result.created
        ? `Created project section: ${result.path}/`
        : `Ensured project section: ${result.path}/ (already registered)`,
    );
    console.log(
      `  assets/media/${result.path}/{originals,tattoos,generated}/`,
    );
    console.log(
      `  web/public/media/${result.path}/{originals,tattoos,generated}/`,
    );
    return;
  }

  const partition = typeof args.partition === 'string' ? args.partition : '';
  if (!PARTITIONS.has(partition)) {
    console.error('--partition is required (originals|tattoos|generated)');
    printUsage(1);
    return;
  }

  const fileArg = typeof args.file === 'string' ? args.file : null;
  const dirArg = typeof args.dir === 'string' ? args.dir : null;
  if (!fileArg && !dirArg) {
    console.error('Provide --file or --dir (or --create-section --project)');
    printUsage(1);
    return;
  }
  if (fileArg && dirArg) {
    console.error('Use either --file or --dir, not both');
    process.exit(1);
  }

  const assetIdOpt = typeof args['asset-id'] === 'string' ? args['asset-id'] : null;
  if (assetIdOpt && dirArg) {
    console.error('--asset-id is only valid with --file');
    process.exit(1);
  }

  const pipeline =
    typeof args.pipeline === 'string' && args.pipeline.trim()
      ? args.pipeline.trim().replace(/^\/+|\/+$/g, '')
      : null;
  const parent =
    typeof args.parent === 'string' && args.parent.trim()
      ? args.parent.trim()
      : null;
  const batch =
    typeof args.batch === 'string' && args.batch.trim()
      ? args.batch.trim()
      : null;
  const cloudUrl =
    typeof args['cloud-url'] === 'string' && args['cloud-url'].trim()
      ? args['cloud-url'].trim()
      : null;
  const titleOpt = typeof args.title === 'string' ? args.title : null;
  const tagsRaw = typeof args.tags === 'string' ? args.tags : '';
  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  /** @type {string[]} */
  let sources = [];
  if (fileArg) {
    const abs = isAbsolute(fileArg) ? fileArg : resolve(process.cwd(), fileArg);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      console.error(`Source file not found: ${abs}`);
      process.exit(1);
    }
    sources = [abs];
  } else if (dirArg) {
    const abs = isAbsolute(dirArg) ? dirArg : resolve(process.cwd(), dirArg);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      console.error(`Source directory not found: ${abs}`);
      process.exit(1);
    }
    sources = listImages(abs);
    if (!sources.length) {
      console.error(`No images found under: ${abs}`);
      process.exit(1);
    }
  }

  // Ensure project tree + registry when pushing into a project
  if (projectSlug) {
    const ensured = ensureProjectSection(root, projectSlug, manifest, dryRun);
    if (!dryRun) {
      console.log(
        ensured.created
          ? `Created project section: ${ensured.path}/`
          : `Using project section: ${ensured.path}/`,
      );
    }
  }

  /** @type {Array<{ source: string, destRel: string, assetId: string, mode?: string }>} */
  const planned = [];

  for (const source of sources) {
    const name = basename(source);
    const underPartition = pipeline
      ? join(partition, pipeline, name).replace(/\\/g, '/')
      : join(partition, name).replace(/\\/g, '/');
    const destRel = projectSlug
      ? `projects/${projectSlug}/${underPartition}`
      : underPartition;
    let assetId =
      sources.length === 1 && assetIdOpt
        ? assetIdOpt
        : makeAssetId(partition, destRel, pipeline ?? undefined, projectSlug);
    if (
      projectSlug &&
      sources.length === 1 &&
      assetIdOpt &&
      !assetIdOpt.startsWith(`proj-${projectSlug}-`)
    ) {
      // Keep explicit ids as-is when caller set them; only auto-ids get prefix.
      assetId = assetIdOpt;
    }
    planned.push({ source, destRel, assetId });
  }

  console.log(`DAMMWT root: ${root}`);
  console.log(
    `Partition:   ${partition}${pipeline ? ` / ${pipeline}` : ''}${
      projectSlug ? ` (project: ${projectSlug})` : ''
    }`,
  );
  console.log(`Files:       ${planned.length}${dryRun ? ' (dry-run)' : ''}`);

  for (const item of planned) {
    const title =
      sources.length === 1 && titleOpt
        ? titleOpt
        : slugify(basename(item.destRel)).replace(/-/g, ' ');

    const recordTags = [...tags];
    if (batch && !recordTags.includes(batch)) recordTags.push(batch);
    if (partition === 'originals' && !recordTags.includes('source-of-truth')) {
      recordTags.push('source-of-truth');
    }
    if (projectSlug) {
      const projectTagToken = `project:${projectSlug}`;
      if (!recordTags.includes(projectTagToken)) {
        recordTags.push(projectTagToken);
      }
      if (!recordTags.includes(projectSlug)) {
        recordTags.push(projectSlug);
      }
    }

    const parentSourceId = parent;
    /** @type {object} */
    const record = {
      id: item.assetId,
      assetId: item.assetId,
      title,
      partition,
      previewPath: item.destRel,
      previewUrl: `/media/${item.destRel}`,
      localPath: `assets/media/${item.destRel}`,
      cloudUrl,
      sourcePath: relative(root, item.source).startsWith('..')
        ? item.source
        : relative(root, item.source),
      parentSourceId,
      parentId: parentSourceId,
      derivedFrom: parentSourceId,
      batch,
      report: null,
      project: projectSlug,
      projectTag: projectSlug,
      tags: recordTags,
      description: null,
    };

    console.log(
      `  ${dryRun ? 'PLAN' : 'PUSH'} ${item.assetId} ← ${item.source} → ${item.destRel}`,
    );

    if (!dryRun) {
      const assetDest = join(assetsMedia, item.destRel);
      const webDest = join(webMedia, item.destRel);
      const modeA = linkOrCopy(item.source, assetDest);
      const modeW = linkOrCopy(item.source, webDest);
      item.mode = `${modeA}+${modeW}`;

      const idx = manifest.assets.findIndex(
        (a) => a.assetId === item.assetId || a.previewPath === item.destRel,
      );
      if (idx >= 0) {
        // Preserve description / report if caller omitted them
        const prev = manifest.assets[idx];
        manifest.assets[idx] = {
          ...prev,
          ...record,
          description: record.description ?? prev.description ?? null,
          report: record.report ?? prev.report ?? null,
          tags: recordTags.length ? recordTags : prev.tags ?? [],
        };
      } else {
        manifest.assets.push(record);
      }
    }
  }

  if (dryRun) {
    console.log('Dry-run complete — no files or manifest written.');
    return;
  }

  const written = writeManifest(manifest, assetsMedia, webMedia);
  console.log(
    `Manifest upserted (${written.counts.originals} originals, ${written.counts.tattoos} tattoos, ${written.counts.generated} generated${
      written.projects?.length ? `, ${written.projects.length} project(s)` : ''
    })`,
  );

  if (noIngest) {
    console.log('Skipped Electron ingest (--no-ingest). Run: npm run seed:media');
    return;
  }

  ensureDistForIngest(root, false);
  runElectronIngest(root);
  console.log('push:media complete');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
