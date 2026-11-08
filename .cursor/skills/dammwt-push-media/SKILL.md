---
name: dammwt-push-media
description: >-
  Push image/media files into MWT DAM (DAMMWT) from any repo. Create DAM project
  folder / new DAM section to isolate project assets, then push:media --project.
  Project pointer to the personal skill (~/.agents/skills/dammwt-push-media).
  Use for push to DAM, create DAM project folder, new DAM section, isolate
  project assets, ingest into DAMMWT, send graphics to gallery, or staging
  tattoo / Comfy / logo assets into the Gallery.
---

# DAMMWT push media (project pointer)

**Canonical personal skill:** `~/.agents/skills/dammwt-push-media/SKILL.md`  
(also on this machine: `~/.cursor/skills/dammwt-push-media/`)

## Electron review push (4 steps)

Default recipe for **Gallery → Projects** (absolute paths; set `DAMMWT_ROOT`):

```bash
export DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"
```

1. **Start Electron** — `cd "$DAMMWT_ROOT" && npm run review:electron` (skip if already up; `SEED=1` only if DB/links look stale).
2. **Create section** — `npm run dam:section --prefix "$DAMMWT_ROOT" -- --project my-client` (or `bash ~/.agents/skills/dammwt-push-media/scripts/create-section.sh --project my-client`).
3. **Push** — absolute `--file` / `--dir` + `--partition` + `--project my-client` via `push:media` / `push-media.sh`.
4. **See in Projects** — Gallery **Projects → my-client** (status **All**); Refresh / manifest watch if needed.

```bash
cd "$DAMMWT_ROOT"
npm run review:electron

npm run dam:section --prefix "$DAMMWT_ROOT" -- --project my-client

npm run push:media --prefix "$DAMMWT_ROOT" -- \
  --file "/absolute/path/to/asset.png" \
  --partition generated \
  --project my-client
# → Projects → my-client
```

## Create section then push (isolate project assets)

```bash
export DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"

bash ~/.agents/skills/dammwt-push-media/scripts/create-section.sh \
  --project comfy-soundshield

bash ~/.agents/skills/dammwt-push-media/scripts/push-media.sh \
  --dir "/absolute/path/to/comfy/output" \
  --partition generated \
  --project comfy-soundshield
```

Inside this repo:

```bash
npm run dam:section -- --project tattoo-scorpion-oct
# or: npm run push:media -- --create-section --project tattoo-scorpion-oct
npm run push:media -- --dir "/absolute/scorpions" --partition tattoos --project tattoo-scorpion-oct
```

Layout: `assets/media/projects/<slug>/{originals,tattoos,generated}/…`

## Push only (shared curated)

```bash
npm run push:media -- --file "/absolute/path.jpg" --partition tattoos --pipeline flash
```

## From a foreign repo (shared)

```bash
export DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"
bash ~/.agents/skills/dammwt-push-media/scripts/push-media.sh \
  --file "/absolute/path.jpg" \
  --partition generated \
  --pipeline comfy \
  --batch run-42
```

## Flags (summary)

`--file` / `--dir` · `--partition` (required for push) · `--project` · `--create-section` · `--pipeline` · `--parent` · `--batch` · `--cloud-url` · `--title` · `--asset-id` · `--tags` · `--dry-run` · `--no-ingest`

## Electron review

```bash
npm run review:electron
# SEED=1 npm run review:electron
```

## When Electron is up — HTTP API (any harness)

Queue, decisions, lineage, reveal via localhost HTTP (universal contract; MCP/CLI optional). Prefer skill **`dammwt-harness`** (`~/.agents/skills/dammwt-harness`, `~/.hermes/skills/dammwt-harness`) for curl / MCP / Claude / Grok / Hermes. Env: `docs/DAM-HARNESS.md` (`DAMMWT_ROOT`, `DAM_API_BASE`, `DAM_API_TOKEN` or `DAM_API_TOKEN_FILE`). Guide: `docs/HARNESS-CONNECTIVITY.md`. OpenAPI: `docs/openapi-dam-api.yaml`.

```bash
npm run dam:token
bash scripts/dam-api-examples.sh
npm run dam:decide -- health
npm run dam:decide -- queue --status pending
npm run dam:decide -- submit --asset-id <id> --decision love --by harness
```

Optional MCP (Claude Desktop + Cursor): `mcp/README.md` → `node mcp/index.mjs`. Architecture: `docs/AGENT-ELECTRON-SYNC.md`. Bytes still via `push:media` / `dam:section`.

Full steps, when-to-create-section, and tattoo / comfy / logo examples: read the personal skill above. CLI SoT: `scripts/push-media.mjs` (+ `dam:section`) and `docs/MEDIA-INVENTORY.md`.
