# Media inventory — Tattoo Designs + Source of Truth

Curated subset of MWTDAM tattoo-design graphics staged into DAMMWT so **web** and **Electron** can load real previews (not picsum placeholders).

## Media roots

| Role | Path |
|------|------|
| **Canonical repo store** | `assets/media/` |
| **Vite / web static** | `web/public/media/` → URLs under `/media/…` |
| **Manifest** | `assets/media/manifest.json` (web also accepts `/media/MANIFEST.json`; on case-insensitive volumes these are the same file) |

### Layout

```
assets/media/
  originals/          # Source of Truth — seeds & reference art
    base/             # dragon / body-canvas masters
    esoteric/         # compass, seals, filigree refs
    scorpions/        # Durango species photos
  tattoos/            # Placement & flash designs
    flash/
    arm-leg/
    arm-shoulder/
    body-maps/        # (+ arms/, legs/)
    scorpions/
  generated/          # Optional non-tattoo gens (empty in default curated set)
  manifest.json
  MANIFEST.json
```

`web/public/media/` mirrors the same tree for the browser gallery.

## Counts (default curated plan)

| Partition | Count | Notes |
|-----------|------:|-------|
| **originals** | 17 | SoT seeds / refs (`parentSourceId` = null) |
| **tattoos** | 43 | Flash, limb placements, body-maps, scorpion styles |
| **generated** | 0 | Reserved; not in default plan |
| **Total** | **60** | ~21 MB binaries (git-friendly curated subset) |
| Lineage links | 36 | Tattoos that point at a parent original or earlier gen |

Exact counts are always in `manifest.json` → `counts` / `lineageLinks`.

## Preview URL resolution

### Web (Vite)

1. Boot loads `/media/manifest.json` (fallback: `/media/MANIFEST.json`).
2. Each row’s `previewUrl` is `/media/<previewPath>` (e.g. `/media/tattoos/flash/01-wave-dragon-irezumi.jpg`).
3. Files are served from `web/public/media/`.
4. `MemoryGalleryStore` / IndexedDB seed via `web/src/media/manifest.ts` → `loadManifestSeed()`.

### Electron

1. On empty DB (or `npm run seed:media`), `src/media/seedMedia.ts` reads `assets/media/manifest.json`.
2. `previewUrl` is stored as `file://…/assets/media/<previewPath>`.
3. `sourceIdentifier` is the absolute filesystem path to the same file.
4. Resolve media root: `resolveMediaRoot()` → `assets/media` next to the repo (dev) or relative to `dist/`.

## File links (`localPath` / `cloudUrl`)

Each manifest / ReviewQueue row can carry:

| Field | Meaning |
|-------|---------|
| `previewUrl` | Display-only preview (web `/media/…` or Electron `file://`). |
| `localPath` | Path to the asset on disk. Manifest stores **repo-relative** `assets/media/<previewPath>`; Electron seed writes the **absolute** path under `assets/media/`. |
| `cloudUrl` | Optional `http(s)` Notion / Drive / Supabase / CDN URL. **Null** in the default curated set — per-plate cloud links are not in the MWTDAM tattoo plan yet (brand Notion links live in `docs/BRAND-ASSETS.md`). |

### Electron Gallery

- **Reveal in Finder / Show file** → `shell.showItemInFolder(localPath)` via IPC `revealInFolder`
- **Open file** → `shell.openPath(localPath)` via IPC `openLocalPath`
- **Open cloud** → `shell.openExternal(cloudUrl)` via IPC `openCloudUrl` (only when `cloudUrl` is set)

Paths must resolve under allowed media roots (`assets/media`, `web/public/media`). External opens are limited to `http:` / `https:`.

### Web Gallery

Browsers cannot open Finder. The decision panel offers:

- **Copy local path** (clipboard + note)
- **Download /media** (served static URL)
- **Open cloud** (external `<a>` when `cloudUrl` is set)

## Lineage schema (siblings / generation history)

| Field | Meaning |
|-------|---------|
| `parentSourceId` | **Canonical.** `assetId` of the immediate parent. `null` = Source-of-Truth original. |
| `parentId` | Alias of `parentSourceId` (compat). |
| `derivedFrom` | Alias of `parentSourceId` (compat / generation-report wording). |
| `batch` | Generation batch tag when known (`flash`, `arm-leg`, `scorpions-2026-10-15`, …). |
| `report` | Optional pointer into MWTDAM generation-reports / batch folder. |

**Walk to SoT:** follow `parentSourceId` until `null`.

**Siblings:** all assets that share the same `parentSourceId` (same parent seed / alternate takes in a batch).

Web UI: `buildLineageChain()` in `web/src/media/manifest.ts` + `LineageTrail` on the decision panel.

## Push a single file / folder (`npm run push:media`)

For Cursor skills or one-off plates (including absolute paths outside the repo):

```bash
# From DAMMWT (cwd = repo). --file may be absolute.
npm run push:media -- --file /path/to/out.png --partition generated \
  --pipeline my-run --tags gen,test --batch demo-2026-10-23

# From another repo / skill
DAMMWT_ROOT=/path/to/DAMMWT npm run push:media --prefix "$DAMMWT_ROOT" -- \
  --file /abs/out.png --partition tattoos --pipeline flash --parent orig-base-01-irezumi-color-dragon

# Dir of images + dry-run
npm run push:media -- --dir ./exports --partition generated --dry-run
```

| Flag | Role |
|------|------|
| `--file` / `--dir` | Source image(s); absolute paths OK |
| `--partition` | `originals` \| `tattoos` \| `generated` |
| `--pipeline` | Optional subfolder under the partition |
| `--asset-id` | Explicit id (`--file` only) |
| `--parent` | `parentSourceId` |
| `--tags` / `--batch` / `--cloud-url` / `--title` | Metadata |
| `--dry-run` | Plan only |
| `--no-ingest` | Skip Electron DB seed |

Staging: copy/hardlink → `assets/media/<partition>/…` + mirror `web/public/media/`, upsert both `manifest.json` copies, then Electron `seedMediaFromManifest` (idempotent `ingestAssetIfAbsent`). Set `DAMMWT_ROOT` when the skill’s cwd is not the DAMMWT repo; resolve the script via `npm run push:media --prefix "$DAMMWT_ROOT"` or the Cursor skill wrapper `~/.agents/skills/dammwt-push-media/scripts/push-media.sh`. After push, review in Gallery with `npm run review:electron` (use `SEED=1` if links/schema look stale).

## Refresh from MWTDAM

Source of truth on disk (iCloud default):

```text
…/MediaWaveTech/MWTDAM/tattoo-designs/tattoo/
  references/     → staged as assets/media/originals/
  generated/      → staged as assets/media/tattoos/…
```

```bash
# Default path (CloudDocs MWTDAM tattoo/)
npm run curate:media

# Or point at an explicit tattoo root
MWTDAM_TATTOO_ROOT=/path/to/MWTDAM/tattoo-designs/tattoo npm run curate:media
```

The script:

1. Copies the curated `PLAN` subset into `assets/media/` and `web/public/media/`.
2. Rewrites `manifest.json` + `MANIFEST.json` in both places.
3. Skips missing sources (listed under `skipped` in the manifest).

Then re-seed Electron if needed:

```bash
npm run seed:media
```

### Full vault vs curated subset

The full MWTDAM tattoo tree is large. This repo keeps a **lean curated set** (~60 images) so clones stay usable. Expand `PLAN` in `scripts/curate-media.mjs` to pull more plates; do not commit the entire vault unless you switch to LFS / external sync.

Related MWTDAM docs (outside this repo): `docs/MWTDAM-V1/Asset inventory.md`, `Gallery product.md`, `originals-vs-generated.md`.

## Brand (separate)

Brand / Design Kit marks live under `assets/brand/` (and mirrors), not in this tattoo inventory. See `docs/BRAND-ASSETS.md`.
