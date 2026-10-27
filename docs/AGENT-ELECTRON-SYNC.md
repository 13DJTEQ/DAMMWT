# Agent / Harness ↔ Electron DAM — Sync Architecture (Phase 1)

Plan-ready design for generative creative workflows where **Electron MWT DAM is the central review/approval viewpoint**, and agents / harnesses / Comfy scripts push work into it and read decisions back.

**Connectivity is harness-agnostic:** Claude, Cursor, Grok, Hermes, Comfy, and generic scripts all use the same **localhost HTTP API** as the universal contract. MCP and CLI are optional adapters — not required. How-to for any agent: [`HARNESS-CONNECTIVITY.md`](./HARNESS-CONNECTIVITY.md). Machine contract: [`openapi-dam-api.yaml`](./openapi-dam-api.yaml).

**Status:** Phase 1 **implemented** (HTTP API + OpenAPI + MCP + `dam:decide` + skill/docs)

| Piece | Status |
|-------|--------|
| HTTP API in Electron (`src/api/localServer.ts` + `DamService`) | **implemented** |
| OpenAPI 3 + harness connectivity docs | **implemented** |
| MCP stdio wrapper (`mcp/`) | **implemented** (optional adapter) |
| `npm run dam:decide` CLI | **implemented** (optional adapter) |
| Skill docs (API/MCP when Electron up) | **implemented** |
| README curl + MCP config | **implemented** |
| `npm run verify:api` / `scripts/dam-api-examples.sh` | **implemented** |

---

## Decision: Phase 1 primary path

**Localhost HTTP API inside Electron main** (bound to `127.0.0.1`) is the **universal contract**. Optional thin adapters: MCP over that API, `dam:decide` CLI, and existing `push:media` / `dam:section` for disk staging.

| Client | How it talks |
|--------|----------------|
| **Any** agent (Claude, Cursor, Grok, Hermes, …) | HTTP (`curl` / `fetch` / OpenAPI tools) — preferred |
| Cursor / Claude MCP (optional) | MCP tools → HTTP |
| Scripts / Comfy (same Mac) | `curl` / `fetch` → HTTP; files via CLI |
| Cloud agents (later) | Same HTTP contract via tunnel **or** cloud DB mirror (Phase 2+) |

**Why this path (not CLI-only, not MCP-only, not cloud-first):**

1. Electron already owns SQLite (`~/Library/Application Support/@13djteq/mwt-dam-mvp/dam.db`). A second process cannot safely open that DB while Electron runs. The API must share the **same** `DatabaseManager` instance in main.
2. Agents need live **queue + approvals**, not only file staging. Today CLI stages + seeds; IPC is renderer-only. HTTP fills the gap.
3. HTTP is the common denominator for every harness (Claude tool-use, Cursor MCP, Grok actions, Hermes skills, Comfy nodes, shell scripts) and later tunnels.
4. MCP stays a **thin optional wrapper** (no duplicated business logic).
5. Existing `npm run push:media` / `dam:section` already own staging under `assets/media/` — keep them; do not reimplement copy/manifest in the API.

`src/main.ts` currently states “No HTTP server.” Phase 1 deliberately adds one **localhost-only** server alongside IPC.

---

## Architecture (Phase 1)

```
┌──────────────┐ ┌──────────────┐ ┌─────────────┐ ┌────────────────┐
│ Any agent    │ │ Optional MCP │ │ Comfy/curl  │ │ push-media CLI │
│ HTTP tools   │ │ (Cursor/…)   │ │             │ │                │
└──────┬───────┘ └──────┬───────┘ └──────┬──────┘ └───────┬────────┘
       │ HTTP           │ MCP→HTTP       │ HTTP           │ stages files
       ▼                ▼                ▼                ▼
                ┌─────────────────────────────────────┐
                │ Electron main                       │
                │  • DatabaseManager (SQLite SoT)     │
                │  • IPC handlers (renderer)          │
                │  • HTTP API :7842 (127.0.0.1)  ◀──── universal contract
                │  • manifest watch → seed            │
                │  • broadcast media:updated          │
                └──────────────┬──────────────────────┘
                               │
           assets/media/manifest.json + dam.db
                               │
                               ▼
                Gallery renderer (central UI)
                auto-refresh via media:updated
```

### Components to add

| Component | Path / location | Role |
|-----------|-----------------|------|
| HTTP server | `src/api/localServer.ts` (new), started from `src/main.ts` after DB ready | REST over shared `DatabaseManager` + shell helpers |
| Shared service layer | `src/api/DamService.ts` (new) | Thin façade used by IPC **and** HTTP (avoid two code paths for approvals) |
| MCP package | `mcp/` or sibling `dammwt-mcp/` (stdio) | Tools that call localhost HTTP |
| Token file | `$userData/dam-api-token` (created on first launch) | Localhost auth |
| Env overrides | `DAM_API_PORT`, `DAM_API_TOKEN`, `DAM_API_DISABLE=1` | Ops / CI |

### Existing pieces reused (do not replace)

| Piece | Path | Role |
|-------|------|------|
| SQLite + decisions | `src/database/DatabaseManager.ts`, `schema.sql` | SoT while Electron runs |
| IPC / DamApi | `src/ipc/handlers.ts`, `src/preload.ts` | Renderer stays IPC |
| Auto-refresh | `src/main.ts` watch + `MEDIA_UPDATED_CHANNEL` (`media:updated`) | Gallery stays live |
| Staging CLI | `scripts/push-media.mjs`, `npm run dam:section` | Project sections + asset bytes |
| Media roots | `assets/media/`, mirror `web/public/media/` | Disk SoT for previews |
| Shell safety | `src/ipc/shellSafe.ts` | Reveal / open under allowed roots only |
| Skills | `.cursor/skills/dammwt-push-media/`, `.cursor/skills/dammwt-harness/` (+ `~/.agents` / `~/.hermes`) | Bytes staging + HTTP/MCP harness |
| Token helper | `npm run dam:token` | Print path/value for any harness |

### Explicit non-goals (Phase 1)

- No remote multi-tenant API (localhost + personal Hermes/Claude/Grok adapters only).
- No second SQLite writer process.
- No replacing `push:media` with HTTP multipart uploads (optional later; CLI remains primary for bytes).
- No Supabase / cloud write path yet (`docs/WEB-SYNC.md` stays browser scaffold).
- No exposing the API on LAN (`0.0.0.0`).

---

## Sync model

### Phase 1 — SQLite is SoT while Electron runs

| Store | Authority |
|-------|-----------|
| `dam.db` (app userData) | **Canonical** for queue status, notes, history, archive jobs |
| `assets/media/manifest.json` | Canonical for staged catalog + project sections; seed is idempotent into DB |
| Renderer | Read-only view via IPC; decisions write DB → history |

**Write paths:**

1. **Asset bytes / sections:** CLI → disk + manifest → watch/seed → DB insert (`pending`) → `media:updated`.
2. **Approvals (human in Gallery):** IPC `submitApproval` → DB → UI reload.
3. **Approvals (agent/harness):** HTTP `POST /v1/approvals` → same `DatabaseManager.submitApproval` → emit `media:updated` (and optionally a new `queue:updated` channel) so the Gallery stays central.

**Concurrency:** all DB writes go through the single Electron-main `DatabaseManager` (WAL already enabled). HTTP and IPC serialize naturally on the main process.

**When Electron is not running:** CLI can still stage + seed via Electron-as-Node ingest (existing `push:media` path). Agents that need live queue/approvals must start Electron (`npm run review:electron`). HTTP returns connection refused → MCP surfaces a clear “DAM not running” error.

### Phase 2+ — optional cloud (phased, not Phase 1)

| Option | When | Notes |
|--------|------|-------|
| **A. Tunnel** (Cloudflare Tunnel / ngrok / Tailscale) to localhost `:7842` | Cloud Cursor agents need the same Mac DAM | Same auth token; TLS at tunnel; no schema change |
| **B. Cloud DB mirror** (Supabase stub already named in `docs/WEB-SYNC.md`) | Multi-device / Electron offline | Electron remains review UI; sync transport LWW by `revision`/`updatedAt` as in web scaffold; blob sync still separate |

Phase 1 HTTP shapes should stay stable so Phase 2 clients only change **base URL + auth transport**.

---

## Auth (localhost)

**Model:** bearer token, loopback only.

1. Bind: `http://127.0.0.1:${DAM_API_PORT:-7842}` only (refuse non-loopback).
2. On first boot (if missing): generate 32-byte hex token → write `$userData/dam-api-token` (mode `0600`) and log once: `[api] token file: …`.
3. Every request except `GET /v1/health` requires:
   ```http
   Authorization: Bearer <token>
   ```
4. Overrides: `DAM_API_TOKEN` env wins over file (CI / scripted agents).
5. CORS: not required for loopback MCP/curl; if added, allow only `null` / `http://127.0.0.1:*`.
6. Kill switch: `DAM_API_DISABLE=1` skips server start (packaged demos / verify).

MCP config reads the token file (or env) and attaches the header. Comfy/scripts use the same.

**Not Phase 1:** OAuth, mTLS, multi-user roles. `reviewedBy` is a free string on approvals (e.g. `cursor-agent`, `dave`, `comfy-harness`).

---

## Endpoints (HTTP v1)

Base: `http://127.0.0.1:7842/v1`

Mirror existing IPC / DB types from `DatabaseManager` / `DamApi`. JSON request/response. Errors: `{ "ok": false, "error": "…" }` with 4xx/5xx.

### Health / meta

| Method | Path | Maps to | Notes |
|--------|------|---------|-------|
| `GET` | `/health` | `healthCheck` | No auth. `{ ok, dbReady, stats, apiVersion, electronPid }` |
| `GET` | `/projects` | `getMediaProjects` / `listMediaProjectSlugs` | Registered `manifest.projects[]` slugs |

### Project sections

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| `POST` | `/projects` | `{ "slug": "my-client" }` | Ensures dirs + `manifest.projects` entry (same as `npm run dam:section -- --project <slug>`). Prefer shelling to `scripts/push-media.mjs --create-section` **or** calling shared helpers extracted from it — do not fork section layout. Triggers watch/seed + `media:updated`. |

### Assets (push)

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| `POST` | `/assets` | See below | **Metadata ingest of already-staged files**, or invoke CLI for staging when `sourcePath` is set. |

**Preferred Phase 1 body (agent already staged via CLI, or absolute path on disk):**

```json
{
  "sourcePath": "/abs/comfy/out.png",
  "partition": "generated",
  "project": "my-client",
  "pipeline": "comfy",
  "parentSourceId": "orig-base-01-irezumi-color-dragon",
  "batch": "run-42",
  "tags": ["comfyui", "gen"],
  "title": "Hero take 14",
  "cloudUrl": null,
  "assetId": null
}
```

Server runs the same staging contract as `push:media` (copy/hardlink → `assets/media/…` + web mirror → manifest upsert → `seedMediaFromManifest` / `ingestAssetIfAbsent`) then returns `ReviewQueueRow`.

**Alternate (DB-only, rare):** body shaped like `IngestAssetInput` when bytes are already under an allowed media root — maps to `db.ingestAsset` / `ingestAssetIfAbsent`.

Agents that already have the skill should keep:

```bash
DAMMWT_ROOT=/Users/administrator/src/DAMMWT npm run push:media --prefix "$DAMMWT_ROOT" -- \
  --file /abs/out.png --partition generated --project my-client --pipeline comfy
```

HTTP `/assets` is for harnesses that want one round-trip without spawning npm.

### Queue / decisions

| Method | Path | Query / body | Maps to |
|--------|------|--------------|---------|
| `GET` | `/queue` | `?status=pending\|love\|keep\|reject\|changesRequested` optional; `?project=<slug>` filter | `getReviewQueue` (+ project filter in service layer) |
| `GET` | `/queue/stats` | — | `getQueueStats` |
| `GET` | `/assets/:assetId` | — | `getByAssetId` |
| `POST` | `/approvals` | `{ "assetId", "decision": "love\|keep\|reject\|changesRequested", "reviewedBy", "notes?" }` | `submitApproval` |
| `POST` | `/assets/:assetId/resubmit` | `{ "sourceIdentifier", "previewUrl" }` | `resubmitAsset` |

After any mutating call that changes queue visibility, main **must** `webContents.send('media:updated', …)` (reuse `broadcastMediaUpdated`) so the Gallery auto-refreshes without Dave clicking Refresh.

### Lineage

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/assets/:assetId/lineage` | Walk `parentSourceId` to SoT (`null` parent). Return `{ asset, chain: ReviewQueueRow[], siblings: ReviewQueueRow[] }` where siblings share the same `parentSourceId`. |
| `GET` | `/assets/:assetId/history` | `getAssetVersionHistory` |

Lineage rules match `docs/MEDIA-INVENTORY.md` / web `buildLineageChain()`.

### Open / reveal (local OS)

| Method | Path | Body | Maps to |
|--------|------|------|---------|
| `POST` | `/shell/reveal` | `{ "localPath": "…" }` | `safeRevealInFolder` + `allowedMediaRoots` |
| `POST` | `/shell/open` | `{ "localPath": "…" }` | `safeOpenPath` |
| `POST` | `/shell/open-cloud` | `{ "cloudUrl": "…" }` | `safeOpenExternal` (http/https only) |

Same security as IPC: path must resolve under `assets/media` (and optional `web/public/media`). Returns `{ ok, error? }`.

### Refresh

| Method | Path | Maps to |
|--------|------|---------|
| `POST` | `/media/refresh` | `reseedFromManifest('refresh')` |

---

## MCP tools (thin wrapper)

Package: stdio MCP server that only calls the HTTP API (env `DAM_API_BASE`, `DAM_API_TOKEN`).

| Tool | HTTP | Typical agent use |
|------|------|-------------------|
| `dam_health` | `GET /v1/health` | Fail fast if Electron down |
| `dam_create_project` | `POST /v1/projects` | New generative job section |
| `dam_push_asset` | `POST /v1/assets` | After Comfy/export |
| `dam_list_queue` | `GET /v1/queue` | What Dave still needs to review |
| `dam_submit_decision` | `POST /v1/approvals` | Agent-assisted triage **or** read-back after human decide (agents usually list; humans decide in UI — tool still required for harness automation) |
| `dam_get_lineage` | `GET /v1/assets/:id/lineage` | Steer next gen from SoT / siblings |
| `dam_reveal_file` | `POST /v1/shell/reveal` | Open Finder on plate |
| `dam_open_file` | `POST /v1/shell/open` | Open in Preview / editor |
| `dam_refresh` | `POST /v1/media/refresh` | Force ingest if watch missed |

MCP is **generic stdio** (Claude Desktop, Cursor, others) — no build step; run `mcp/index.mjs` directly. Claude Desktop + Cursor config snippets side by side: [`mcp/README.md`](../mcp/README.md). Env contract + adapters: [`DAM-HARNESS.md`](./DAM-HARNESS.md). Token for any harness: `npm run dam:token`.

---

## CLI (unchanged primary for bytes)

Keep as the durable staging SoT:

| Command | Role |
|---------|------|
| `npm run dam:section -- --project <slug>` | Create project tree + registry |
| `npm run push:media -- --file … --partition … [--project …]` | Stage + ingest |
| `npm run review:electron` | Rebuild/launch Gallery (central viewpoint) |
| `SEED=1 npm run review:electron` | Force seed when schema/links stale |

### `dam:decide` (Phase 1 — implemented)

Thin HTTP CLI for shell harnesses (same contract as MCP):

```bash
npm run dam:decide -- health
npm run dam:decide -- queue --status pending --project my-client
npm run dam:decide -- submit --asset-id <id> --decision love --by cursor-agent --notes "steer"
npm run dam:decide -- lineage --asset-id <id>
npm run dam:decide -- reveal --path /abs/path/under/assets/media/…
npm run dam:decide -- refresh
npm run dam:decide -- project --slug agent-sync-probe
npm run dam:decide -- push --file /abs/out.png --partition generated --project my-client
```

Env (once): `DAMMWT_ROOT`, `DAM_API_BASE` / `DAM_API_PORT`, `DAM_API_TOKEN` or `DAM_API_TOKEN_FILE` — see [`DAM-HARNESS.md`](./DAM-HARNESS.md). Print token: `npm run dam:token`.

---

## How Electron stays the central viewpoint

1. **Dave reviews in Gallery** (love / keep / reject + notes; keys `1`/`2`/`3`/`n`). Product naming: **MWT DAM**.
2. Agents/Comfy **push into** project sections and **read** queue/lineage/decisions; they do not become a second review UI.
3. Auto-refresh already exists on this branch (`cursor/electron-auto-refresh-d536`):
   - Manifest watch → `seedMediaFromManifest` → `media:updated`
   - Window focus / visibility + Refresh control
4. Phase 1 extends the same broadcast to **HTTP mutations** (approvals, API pushes) so the open window updates without relaunch.
5. After meaningful Electron/API code changes, agents still run `npm run review:electron` per workspace rules so Dave can verify the live window.

**Recommended agent loop:**

```
dam_create_project → (Comfy run) → dam_push_asset(s)
  → Dave sees tiles appear (auto-refresh)
  → Dave love/keep/reject in UI
  → agent dam_list_queue / dam_get_lineage → next generation steered by loves + SoT
```

---

## Concrete paths & defaults (this machine)

| Item | Value |
|------|-------|
| Repo | `/Users/administrator/src/DAMMWT` |
| Media root | `assets/media/` (+ `web/public/media/`) |
| Manifest | `assets/media/manifest.json` |
| DB | `~/Library/Application Support/@13djteq/mwt-dam-mvp/dam.db` (`DAM_DB_PATH` override) |
| API bind | `127.0.0.1:7842` |
| Token file | `…/mwt-dam-mvp/dam-api-token` |
| Env | `DAMMWT_ROOT`, `DAM_API_BASE`, `DAM_API_TOKEN` \| `DAM_API_TOKEN_FILE`, `DAM_API_PORT`, `DAM_API_DISABLE` — [DAM-HARNESS.md](./DAM-HARNESS.md) |

---

## Implementation sketch (ordered)

1. **Done:** Extract `DamService` from IPC handler bodies (`src/api/DamService.ts`).
2. **Done:** Point `registerIpcHandlers` at `DamService`.
3. **Done:** `localServer.ts`; start after DB in `bootstrap()`; broadcast on mutations.
4. **Done:** Lineage query on `DatabaseManager` (`getLineage(assetId)`).
5. **Done:** `POST /projects` + `POST /assets` via push-media spawn / DamService.
6. **Done:** `mcp/` thin client + README for Cursor config; `npm run dam:decide`.
7. **Done:** link from `README.md` + curl examples. WEB-SYNC “open decision” can note Electron localhost API.
8. **Done:** `npm run verify:api` (health + approve round-trip under Electron-as-Node harness).

---

## Acceptance criteria (Phase 1 done when)

1. **With Electron running**, `curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:7842/v1/health` returns `ok: true` and queue stats.
2. **Unauthenticated** mutating calls return `401`; binding is loopback-only.
3. `POST /v1/projects` with slug `agent-sync-probe` creates `assets/media/projects/agent-sync-probe/{originals,tattoos,generated}/` and shows under Gallery **Projects** (empty section OK) after auto-refresh — no relaunch required if app already open.
4. `POST /v1/assets` (or CLI `push:media` then `GET /v1/queue?status=pending`) shows the new row in the **open** Gallery window via `media:updated` within ~1s of watch debounce.
5. `POST /v1/approvals` with `love|keep|reject` + notes updates SQLite + `ApprovalHistory`; Gallery selection/stats refresh without manual Refresh.
6. `GET /v1/assets/:id/lineage` returns SoT chain + siblings consistent with `parentSourceId` rules in `docs/MEDIA-INVENTORY.md`.
7. `POST /v1/shell/reveal` opens Finder only for paths under allowed media roots; outside paths fail safely.
8. MCP tools listed above succeed against a live app for: create section → push asset → list queue → get lineage → reveal.
9. `DAM_API_DISABLE=1` / Electron quit → MCP/curl fail with a clear “DAM API unreachable” message (no hanging writers).
10. `npm run verify` still passes; existing IPC Gallery path unchanged for humans.
11. README documents: start Electron → token location → example curl + MCP config.
12. Cloud agents are **documented as Phase 2** (tunnel same API **or** cloud DB) — not required to pass Phase 1.

---

## Phase map (one glance)

| Phase | What ships | Clients |
|-------|------------|---------|
| **1 (this doc)** | Localhost HTTP in Electron (universal) + optional MCP/`dam:decide` + CLI | Any same-Mac harness (Claude, Cursor, Grok, Hermes, Comfy, scripts) |
| **2** | Tunnel to Phase 1 API **or** Supabase mirror + auth hardening | Cloud Cursor agents |
| **3** | Optional blob sync / multi-reviewer roles | Multi-device creative team |

---

## Related docs

- **Env + adapters (once):** `docs/DAM-HARNESS.md`
- **Harness connectivity (any agent):** `docs/HARNESS-CONNECTIVITY.md`
- **OpenAPI 3 contract:** `docs/openapi-dam-api.yaml`
- Gallery / media SoT: `docs/MEDIA-INVENTORY.md`
- Web sync scaffold (not Phase 1 SoT): `docs/WEB-SYNC.md`
- Harness skill: `.cursor/skills/dammwt-harness/` · `~/.hermes/skills/dammwt-harness/` · `~/.agents/skills/dammwt-harness/`
- Push skill: `.cursor/skills/dammwt-push-media/SKILL.md`
- IPC contract: `src/ipc/handlers.ts`
- Auto-refresh: `src/main.ts` (`media:updated`)
- Optional MCP adapter: `mcp/README.md`
