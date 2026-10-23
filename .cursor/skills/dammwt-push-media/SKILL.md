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

Agents working **inside this repo** can use the durable CLI directly:

```bash
npm run push:media -- --file "/absolute/path.jpg" --pipeline tattoo --batch flash
```

From a **foreign repo**, set `DAMMWT_ROOT` (default `/Users/administrator/src/DAMMWT`) and run the personal wrapper:

```bash
bash ~/.agents/skills/dammwt-push-media/scripts/push-media.sh \
  --file "/absolute/path.jpg" --pipeline comfy --batch run-42
```

After push, for Electron Gallery review:

```bash
npm run review:electron
# SEED=1 npm run review:electron   # if schema / file links need re-seed
```

Read the full skill for flag mapping (`--partition`, `--parent`, `--pipeline`, `--batch`, `--cloud-url`) and tattoo / comfy / logo examples.
