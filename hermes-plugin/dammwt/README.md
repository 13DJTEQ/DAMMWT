# dammwt — Hermes plugin for MWT DAM

Native Hermes plugin that adapts the Electron localhost OpenAPI contract
(`http://127.0.0.1:7842`). HTTP remains the universal wire; this package is
packaging + tools for Hermes sessions.

Bundled skills are **recipes** loaded with `skill_view("dammwt:…")` — the
autonomous loop is complete through **tools alone**.

## Install (Dave)

Plugins are opt-in and must live under the **user** plugins tree
(`~/.hermes/plugins/`). Gateway sessions do **not** load `./.hermes/plugins/`.

From a DAMMWT checkout:

```bash
cd /Users/administrator/src/DAMMWT

# Validate / doctor before install (catalog + CI gates)
hermes plugins validate hermes-plugin/dammwt
hermes plugins doctor hermes-plugin/dammwt --ci

# Local install — symlink into the user plugins tree (recommended for this checkout).
# `hermes plugins install file://…/hermes-plugin/dammwt` needs a git root at that
# path; the plugin dir alone is not a repo, so use a symlink or Git subdir install.
mkdir -p ~/.hermes/plugins
ln -sfn "$PWD/hermes-plugin/dammwt" ~/.hermes/plugins/dammwt
hermes plugins enable dammwt
```

Git subdir install (from GitHub once the tree is on the default branch / a ref Hermes can clone):

```bash
hermes plugins install "13DJTEQ/DAMMWT/hermes-plugin/dammwt"
hermes plugins enable dammwt
```

Env (see `docs/DAM-HARNESS.md`):

```bash
export DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"
eval "$(npm run dam:token --prefix "$DAMMWT_ROOT" -- --export)"
# DAM_API_TOKEN is prompted/stored as a Hermes secret on install when missing
```

## Tools

| Tool | HTTP / action |
|------|----------------|
| `dam_health` | `GET /v1/health` (no auth) |
| `dam_ensure_up` | health probe + best-effort Electron launch |
| `dam_create_project` | `POST /v1/projects` `{slug}` |
| `dam_push_asset` | `POST /v1/assets` or `viaCli` → `npm run push:media` |
| `dam_list_queue` | `GET /v1/queue?status&project` |
| `dam_submit_decision` | `POST /v1/approvals` |
| `dam_update_notes` | `PATCH /v1/assets/:assetId/notes` |
| `dam_get_lineage` | `GET /v1/assets/:assetId/lineage` |
| `dam_refresh` | `POST /v1/media/refresh` |
| `dam_export_feedback` | `GET /v1/projects/:slug/feedback` |

Handlers always return JSON strings and never raise into Hermes.

## Skills (opt-in)

```text
skill_view("dammwt:dammwt-harness")
skill_view("dammwt:dammwt-push-media")
```

## Sibling HTTP routes

`dam_update_notes` and `dam_export_feedback` target the Phase-1 gap-closes:

- `PATCH /v1/assets/:assetId/notes` → `DamService.updateApprovalNotes`
- `GET /v1/projects/:slug/feedback` → `DamService.exportProjectFeedback`

Coordinate those routes on the same feature branch before live AE1/AE2.

## Constraints

- No network / ensure-up during `register(ctx)` (Plugin Doctor).
- No second SQLite writer; Electron owns `dam.db`.
- No root portable `plugin.json` — native `plugin.yaml` only.
