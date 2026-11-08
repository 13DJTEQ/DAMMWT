---
name: dammwt-push-media
description: >-
  Hermes-bundled recipe for staging bytes into MWT DAM via push:media /
  dam:section. Prefer dam_push_asset (viaCli=true) or npm scripts under
  DAMMWT_ROOT. Full personal skill with wrappers: ~/.agents/skills/dammwt-push-media.
---

# DAMMWT push media (Hermes plugin recipe)

Bytes staging stays **CLI-primary**. Plugin tool:

```text
dam_push_asset({ sourcePath, partition, project, viaCli: true })
```

Or from any shell with `DAMMWT_ROOT` set:

```bash
export DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"

# Optional project section (idempotent)
npm run dam:section --prefix "$DAMMWT_ROOT" -- --project my-client

# Stage a file into Gallery Projects → my-client
npm run push:media --prefix "$DAMMWT_ROOT" -- \
  --file "/absolute/path/to/asset.png" \
  --partition generated \
  --project my-client
```

Partitions: `originals` | `tattoos` | `generated`.

## After push

1. Ensure Gallery is up (`dam_ensure_up` / `npm run review:electron`)
2. `dam_refresh` if the row is missing
3. `dam_list_queue` with `project` / `status=pending`
4. Human decides in Gallery, or `dam_submit_decision` + `dam_update_notes`
5. `dam_export_feedback` for the next generation loop

## Canonical skill + wrappers

Long-form docs and `scripts/push-media.sh` / `create-section.sh` live at:

- `$DAMMWT_ROOT` (`npm run push:media`, `npm run dam:section`)
- `~/.agents/skills/dammwt-push-media/` (personal harness skill)

Do not reimplement copy/manifest/seed layout in agents — call the durable CLI.
