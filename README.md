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

## Localhost DAM API (agents / harness)

With Electron running, main also serves a **loopback-only** HTTP API on `127.0.0.1:7842` (shared `DamService` + SQLite — same process as IPC). Design: [docs/AGENT-ELECTRON-SYNC.md](docs/AGENT-ELECTRON-SYNC.md).

```bash
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

# Thin CLI (same HTTP contract):
npm run dam:decide -- health
npm run dam:decide -- queue --status pending
npm run dam:decide -- submit --asset-id EXAMPLE --decision love --by dave --notes "hero"
```

Env: `DAM_API_PORT` (default `7842`), `DAM_API_TOKEN` (overrides file), `DAM_API_DISABLE=1` (skip server — CI / demos). Asset **bytes** still stage via `npm run push:media` / `dam:section`; HTTP handles queue, approvals, lineage, reveal, and optional one-shot push.

**MCP (Cursor):** see [mcp/README.md](mcp/README.md) — `node mcp/index.mjs` with `DAM_API_BASE` / `DAM_API_TOKEN_FILE`.

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
- Agent / harness ↔ Electron sync (Phase 1): [docs/AGENT-ELECTRON-SYNC.md](docs/AGENT-ELECTRON-SYNC.md)

## CI

On every PR and push to `main`, **CI (Node)** runs typecheck / build / verify. **Commitlint** requires lowercase conventional subjects.
