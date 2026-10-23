---
name: dammwt-push-media
description: >-
  Push image/media files into MWT DAM (DAMMWT) from any repo. Project pointer to
  the personal skill. Use when ingesting tattoo, Comfy, or logo assets via
  npm run push:media.
---

# DAMMWT push media (project pointer)

**Canonical personal skill:** `~/.agents/skills/dammwt-push-media/SKILL.md`  
(also on this machine: `~/.cursor/skills/dammwt-push-media/`)

## Inside this repo

```bash
npm run push:media -- --file "/absolute/path.jpg" --partition tattoos --pipeline flash
```

## From a foreign repo

```bash
export DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"
bash ~/.agents/skills/dammwt-push-media/scripts/push-media.sh \
  --file "/absolute/path.jpg" \
  --partition generated \
  --pipeline comfy \
  --batch run-42
```

## Flags (summary)

`--file` / `--dir` · `--partition` (required) · `--pipeline` · `--parent` · `--batch` · `--cloud-url` · `--title` · `--asset-id` · `--tags` · `--dry-run` · `--no-ingest`

## Electron review

```bash
npm run review:electron
# SEED=1 npm run review:electron
```

Full steps and tattoo / comfy / logo examples: read the personal skill above. CLI SoT: `scripts/push-media.mjs` + `docs/MEDIA-INVENTORY.md`.
