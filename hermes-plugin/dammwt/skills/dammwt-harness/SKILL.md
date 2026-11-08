---
name: dammwt-harness
description: >-
  Hermes-bundled recipe pointer for MWT DAM (DAMMWT). Prefer dam_* plugin tools
  for the autonomous loop. Full curl/MCP/CLI recipes live in the DAMMWT checkout
  docs — this skill does not embed bearer-token curl examples.
---

# DAMMWT harness (Hermes plugin recipe)

Electron Gallery remains the single SQLite writer. This plugin’s **tools** are the
primary entrypoint; load this skill only for context.

```text
skill_view("dammwt:dammwt-harness")
```

## Prefer tools

1. `dam_ensure_up` / `dam_health`
2. `dam_create_project` — Gallery project section by slug
3. `dam_push_asset` — HTTP one-shot, or `viaCli=true` for `push:media`
4. `dam_list_queue` — pending / decided rows
5. `dam_submit_decision` — optional; humans may decide in Gallery
6. `dam_update_notes` — amend notes after love/keep/reject
7. `dam_export_feedback` — structured JSON for the next gen loop
8. `dam_get_lineage` / `dam_refresh`

## Env

| Var | Default | Role |
|-----|---------|------|
| `DAMMWT_ROOT` | checkout path | ensure-up + push:media |
| `DAM_API_BASE` | `http://127.0.0.1:7842` | API root |
| `DAM_API_TOKEN` | Hermes secret | Bearer for mutating routes |
| `DAM_API_TOKEN_FILE` | app userData `dam-api-token` | File fallback |

Print/export token from the checkout (no HTTP):

```bash
export DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"
npm run dam:token --prefix "$DAMMWT_ROOT"
```

## Docs (canonical recipes)

In `$DAMMWT_ROOT`:

- `docs/DAM-HARNESS.md`
- `docs/HARNESS-CONNECTIVITY.md`
- `docs/AGENT-ELECTRON-SYNC.md`
- `docs/openapi-dam-api.yaml`
- `mcp/README.md`

Personal skill mirrors (full curl tables): `~/.agents/skills/dammwt-harness/`.

## When API is down

Call `dam_ensure_up`, or start Electron:

```bash
cd "$DAMMWT_ROOT" && npm run review:electron
# or: bash scripts/launch-dam.command
```

Never open `dam.db` from a second process.
