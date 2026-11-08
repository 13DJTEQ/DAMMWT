# MWT DAM (DAMMWT)

Digital Asset Management MVP for Media Wave Technology — **Gallery V1** (love / keep / reject + notes) on Electron + SQLite IPC.

**Repo:** https://github.com/13DJTEQ/DAMMWT

## Clone & run

```bash
git clone https://github.com/13DJTEQ/DAMMWT.git
cd DAMMWT
npm ci
npx @electron/rebuild -f -w better-sqlite3   # match better-sqlite3 to Electron ABI
npm run seed:media      # ingest assets/media → ReviewQueue (or auto on first launch)
npm run verify          # uses ELECTRON_RUN_AS_NODE so sqlite matches Electron
npm start               # build + Electron → Gallery UI with tattoo originals/tattoos
```

Curate media from MWTDAM (optional refresh): `npm run curate:media`. Preview URLs use `file://` under `assets/media/` (allowed by the renderer CSP).

**ABI note:** Host Node 26 cannot compile/load `better-sqlite3@11`. Keep the native addon rebuilt for Electron (`@electron/rebuild`). `seed:media` and `verify*` run under Electron’s Node ABI.

## After every UI / media pass

Agents and humans should relaunch a fresh Electron build for review after each Gallery UI or media change:

```bash
npm run review:electron
# If DB may lack new columns / file links (localPath, cloudUrl), re-seed first:
SEED=1 npm run review:electron
# Or separately: npm run seed:media
```

`review:electron` rebuilds `better-sqlite3` for the Electron ABI, builds the app, kills any prior DAMMWT Electron from this repo, and starts a live window (title often **MWT DAM — Gallery**). Every launch idempotently ingests new manifest rows (including `projects/<slug>/…`). While the app is open, `push:media` / manifest changes also auto-ingest (watch → seed → Gallery refresh); focus the window or click **Refresh** if needed. Project sections from `dam:section` appear under **Projects** even before assets are pushed.

### Quick launch (macOS)

| How | Path / command |
|-----|----------------|
| Double-click `.app` (Dock-friendly) | `~/Applications/MWT DAM.app` (symlink also on Desktop) |
| Double-click `.command` | `scripts/launch-dam.command` or Desktop `launch-dam.command` |
| Terminal alias | `source scripts/shell-alias-dam.sh` then type `dam` |

Drag **MWT DAM.app** to the Dock for one-click rebuild + Gallery launch. First Finder open of a `.command` may ask to allow Terminal.

## Localhost DAM API (harness-agnostic)

With Electron running, main serves a **loopback-only** HTTP API on `127.0.0.1:7842` (shared `DamService` + SQLite — same process as IPC). **HTTP is the universal contract** for Claude, Cursor, Grok, Hermes, Comfy, and scripts; MCP/CLI are optional adapters.

- Connect any agent: [docs/HARNESS-CONNECTIVITY.md](docs/HARNESS-CONNECTIVITY.md)
- OpenAPI 3: [docs/openapi-dam-api.yaml](docs/openapi-dam-api.yaml)
- Architecture: [docs/AGENT-ELECTRON-SYNC.md](docs/AGENT-ELECTRON-SYNC.md)

```bash
# Ensure Gallery/API is up (health; best-effort launch if down):
npm run dam:ensure

# Token file (created on first launch; mode 0600):
#   ~/Library/Application Support/@13djteq/mwt-dam-mvp/dam-api-token
TOKEN=$(cat "$HOME/Library/Application Support/@13djteq/mwt-dam-mvp/dam-api-token")

# Health is unauthenticated:
curl -s http://127.0.0.1:7842/v1/health | jq .

# Authenticated examples:
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:7842/v1/queue?status=pending" | jq .
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"assetId":"EXAMPLE","decision":"love","reviewedBy":"dave","notes":"hero"}' \
  http://127.0.0.1:7842/v1/approvals | jq .
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"notes":"hero — warmer grade"}' \
  http://127.0.0.1:7842/v1/assets/EXAMPLE/notes | jq .
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:7842/v1/projects/my-client/feedback" | jq .

# Smoke script / thin CLI (same HTTP contract):
bash scripts/dam-api-examples.sh
npm run dam:decide -- health
npm run dam:decide -- queue --status pending
npm run dam:decide -- submit --asset-id EXAMPLE --decision love --by dave --notes "hero"
npm run dam:decide -- notes --asset-id EXAMPLE --notes "hero — warmer grade"
npm run dam:decide -- export --project my-client
```

Env contract (Claude / Grok / Hermes / Cursor): [docs/DAM-HARNESS.md](docs/DAM-HARNESS.md) — `DAMMWT_ROOT`, `DAM_API_BASE`, `DAM_API_TOKEN` or `DAM_API_TOKEN_FILE`. Print token for injection: `npm run dam:token`. `DAM_API_DISABLE=1` skips the server (CI / demos). Asset **bytes** still stage via `npm run push:media` / `dam:section`; HTTP handles queue, approvals, notes, feedback export, lineage, reveal, and optional one-shot push.

**Hermes plugin:** [hermes-plugin/dammwt/README.md](hermes-plugin/dammwt/README.md) — `hermes plugins validate|doctor|install|enable` against `hermes-plugin/dammwt` (user plugins tree; not `./.hermes/plugins/`).

**Optional MCP (any client):** [mcp/README.md](mcp/README.md) — generic stdio `node mcp/index.mjs`; Claude Desktop `claude_desktop_config.json` and Cursor `mcp.json` snippets side by side.

## Gallery V1

| Layer | Contents |
|-------|----------|
| Decisions | ❤️ Love · 👍 Keep · 👎 Reject (+ notes); Request Changes secondary for resubmit |
| Persistence | SQLite `ReviewQueue` / `ApprovalHistory` via Electron IPC + localhost HTTP API |
| UI | Preview-first gallery queue + decision card + Love/Keep/Reject stats |
| Keys | `1` love · `2` keep · `3` reject · `n` notes |

Week 1 formal Approve naming mapped to **keep**; **love** is a distinct strong-positive for generation steering.

## Verify

`npm run verify` runs Days 1/2/5/6 + Gallery V1 + DAM API coverage. Optional: `npm run verify:day34`, `npm run verify:gallery`, `npm run verify:api`.

## Web Gallery + sync (scaffold)

Additive browser app under `web/` (Vite + React). Same Gallery V1 decisions; pluggable local (`memory` / IndexedDB) and cloud (**Supabase** stub) stores with a pull/push sync client.

```bash
npm run web:install
npm run web:dev       # http://localhost:5173
```

Details: [docs/WEB-SYNC.md](docs/WEB-SYNC.md). Does not replace Electron; `npm run verify` stays the desktop path.

## Spec / docs

- Project Gallery plan: see Project store `docs/v1-gallery-plan.md` (or legacy `v0.5-gallery-plan.md` until renamed)
- Day 1 notes: [docs/DAY1-README.md](docs/DAY1-README.md)
- Web sync scaffold: [docs/WEB-SYNC.md](docs/WEB-SYNC.md)
- Harness connectivity (any agent via HTTP): [docs/HARNESS-CONNECTIVITY.md](docs/HARNESS-CONNECTIVITY.md)
- DAM OpenAPI 3: [docs/openapi-dam-api.yaml](docs/openapi-dam-api.yaml)
- Agent / harness ↔ Electron sync (Phase 1): [docs/AGENT-ELECTRON-SYNC.md](docs/AGENT-ELECTRON-SYNC.md)
- Harness adapters + env contract: [docs/DAM-HARNESS.md](docs/DAM-HARNESS.md)

## CI

On every PR and push to `main`, **CI (Node)** runs typecheck / build / verify. **Commitlint** requires lowercase conventional subjects.
