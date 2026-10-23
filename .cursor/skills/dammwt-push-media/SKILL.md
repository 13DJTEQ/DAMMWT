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

Full steps, when-to-create-section, and tattoo / comfy / logo examples: read the personal skill above. CLI SoT: `scripts/push-media.mjs` (+ `dam:section`) and `docs/MEDIA-INVENTORY.md`.
