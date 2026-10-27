# Harness connectivity (agent-agnostic)

**HTTP is the universal contract.** Any agent, IDE, script, or Comfy node that can call localhost REST can drive MWT DAM. MCP and CLI are optional adapters over the same routes — not required.

Electron must be running (Gallery). The API shares the same `DamService` + SQLite as IPC. Spec: [`openapi-dam-api.yaml`](./openapi-dam-api.yaml). Architecture: [`AGENT-ELECTRON-SYNC.md`](./AGENT-ELECTRON-SYNC.md).

**Env + adapter locations (once):** [`DAM-HARNESS.md`](./DAM-HARNESS.md) — `DAMMWT_ROOT`, `DAM_API_BASE`, `DAM_API_TOKEN` or `DAM_API_TOKEN_FILE`. Print token: `npm run dam:token`.

---

## Quick start (any harness)

| Item | Value |
|------|-------|
| Base URL | `http://127.0.0.1:7842` (`DAM_API_BASE`) |
| API prefix | `/v1` |
| Auth | `Authorization: Bearer <token>` on every route **except** `GET /v1/health` |
| Env contract | [`DAM-HARNESS.md`](./DAM-HARNESS.md) |
| Token helper | `npm run dam:token` / `npm run dam:token -- --export` |
| OpenAPI | [`docs/openapi-dam-api.yaml`](./openapi-dam-api.yaml) |

```bash
# Start Gallery (API comes up with main)
export DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"
cd "$DAMMWT_ROOT"
SEED=1 npm run review:electron

eval "$(npm run dam:token -- --export)"
BASE="$DAM_API_BASE"
TOKEN="$DAM_API_TOKEN"

# Health — no auth
curl -s "$BASE/v1/health" | jq .

# Queue / decision / lineage / reveal / refresh
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/queue?status=pending" | jq .
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/projects" | jq .
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"slug":"agent-sync-probe"}' "$BASE/v1/projects" | jq .
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"assetId":"EXAMPLE","decision":"love","reviewedBy":"any-harness","notes":"steer"}' \
  "$BASE/v1/approvals" | jq .
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/assets/EXAMPLE/lineage" | jq .
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"localPath":"/abs/path/under/assets/media/…"}' "$BASE/v1/shell/reveal" | jq .
curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE/v1/media/refresh" | jq .
```

Smoke script: `bash scripts/dam-api-examples.sh` (or `npm run dam:decide -- health`).

**Bytes vs metadata:** stage files with `npm run push:media` / `dam:section` (or `POST /v1/assets` with `sourcePath`). HTTP owns queue, decisions, lineage, reveal, refresh.

---

## Core routes (v1)

| Method | Path | Auth | Role |
|--------|------|------|------|
| `GET` | `/v1/health` | no | Fail-fast; `{ ok, dbReady, stats, apiVersion, electronPid }` |
| `GET` | `/v1/projects` | yes | List project slugs |
| `POST` | `/v1/projects` | yes | Create section `{ "slug" }` |
| `GET` | `/v1/queue` | yes | `?status=` · `?project=` |
| `GET` | `/v1/queue/stats` | yes | Aggregates |
| `POST` | `/v1/approvals` | yes | Decision `{ assetId, decision, reviewedBy, notes? }` |
| `GET` | `/v1/assets/:id/lineage` | yes | SoT chain + siblings |
| `POST` | `/v1/shell/reveal` | yes | Finder reveal (allowed media roots only) |
| `POST` | `/v1/media/refresh` | yes | Reseed from manifest |

Full surface (assets push, ingest, history, resubmit, shell open/cloud): see OpenAPI / `src/api/localServer.ts`.

Errors: `{ "ok": false, "error": "…" }` with 4xx/5xx. Unauthenticated → `401`.

---

## Claude (MCP or HTTP tool-use)

**Option A — MCP (if the Claude client supports stdio MCP):** point at `mcp/index.mjs` with `DAM_API_BASE` + `DAM_API_TOKEN_FILE` (same as Cursor). Tools map 1:1 to HTTP (`dam_health`, `dam_list_queue`, …). See [`mcp/README.md`](../mcp/README.md).

**Option B — HTTP tool-use / Skills:** give Claude a custom tool or skill that `fetch`/`curl`s the base URL with the bearer token. No MCP required — paste the OpenAPI or this doc’s route table. Example tool contract:

- `dam_health()` → `GET /v1/health`
- `dam_queue(status?, project?)` → `GET /v1/queue`
- `dam_decide(assetId, decision, reviewedBy, notes?)` → `POST /v1/approvals`
- `dam_lineage(assetId)` → `GET /v1/assets/:id/lineage`

Set `reviewedBy` to something identifiable (`claude`, `claude-desktop`, …).

---

## Cursor MCP

Add to Cursor MCP settings / `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "dammwt": {
      "command": "node",
      "args": ["/Users/administrator/src/DAMMWT/mcp/index.mjs"],
      "env": {
        "DAM_API_BASE": "http://127.0.0.1:7842",
        "DAM_API_TOKEN_FILE": "/Users/administrator/Library/Application Support/@13djteq/mwt-dam-mvp/dam-api-token"
      }
    }
  }
}
```

Or use HTTP directly in agent prompts / shell: same curl as Quick start. Skill pointer: `.cursor/skills/dammwt-push-media/`. Thin CLI: `npm run dam:decide -- …`.

---

## Grok (and other HTTP tool agents)

Grok / xAI (and similar) agents that support custom HTTP or “call this API” tools should use the OpenAPI file as the tool schema source:

1. Base URL `http://127.0.0.1:7842` (tunnel later for remote — Phase 2).
2. Inject `Authorization: Bearer $DAM_API_TOKEN` on all non-health calls.
3. Prefer `GET /v1/health` first; abort with “start Electron / `npm run review:electron`” on connection refused.
4. Do not open SQLite yourself — always go through HTTP while Electron runs.

If the product only supports “actions” without OpenAPI import, define one action per core route above with JSON bodies from the spec.

---

## Hermes skill

Installed: `~/.hermes/skills/dammwt-harness/` · `~/.agents/skills/dammwt-harness/` · repo `.cursor/skills/dammwt-harness/`.

Treat DAM as an **HTTP skill**, not an MCP-only plugin:

1. Env: `DAMMWT_ROOT`, `DAM_API_BASE`, `DAM_API_TOKEN` or `DAM_API_TOKEN_FILE` — `npm run dam:token -- --export`.
2. Steps: health → create project / push media (CLI or `POST /v1/assets`) → list queue → (human decides in Gallery **or** `POST /v1/approvals`) → lineage for next gen.
3. Optional backends: `scripts/dam-api-examples.sh` or `npm run dam:decide`.
4. Set `reviewedBy: "hermes"` (or the session id) on decisions.

Bytes skill: `dammwt-push-media`. Pair with this HTTP contract for queue/decisions.

---

## Generic scripts / Comfy / curl

Same machine as Electron:

```bash
export DAM_API_BASE=http://127.0.0.1:7842
export DAM_API_TOKEN="$(cat "$HOME/Library/Application Support/@13djteq/mwt-dam-mvp/dam-api-token")"

# After a Comfy export lands on disk:
npm run push:media -- --file /abs/out.png --partition generated --project my-client --pipeline comfy

# Or one HTTP round-trip:
curl -s -X POST -H "Authorization: Bearer $DAM_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"sourcePath":"/abs/out.png","partition":"generated","project":"my-client","pipeline":"comfy"}' \
  "$DAM_API_BASE/v1/assets"

# Poll what Dave still needs:
curl -s -H "Authorization: Bearer $DAM_API_TOKEN" \
  "$DAM_API_BASE/v1/queue?status=pending&project=my-client"
```

Comfy custom nodes: `urllib`/`requests`/`fetch` against `/v1/*` with the bearer header. No Electron IPC from Python/Node outside main.

Thin CLI (same contract):

```bash
npm run dam:decide -- health
npm run dam:decide -- queue --status pending --project my-client
npm run dam:decide -- submit --asset-id <id> --decision love --by comfy-harness
npm run dam:decide -- lineage --asset-id <id>
npm run dam:decide -- refresh
```

---

## Recommended agent loop (any harness)

```
health → create project → (generate) → push asset(s)
  → Dave reviews in Gallery (central UI; auto-refresh)
  → list queue / lineage → steer next generation
```

Agents push and read; humans decide in **MWT DAM** Gallery unless a harness explicitly posts approvals.

---

## When the API is down

Connection refused / timeout → Electron is not running or `DAM_API_DISABLE=1`.

```bash
cd "${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"
SEED=1 npm run review:electron
```

MCP tools surface **DAM API unreachable**. Do not open `dam.db` from a second process while Electron is up.

---

## Related

| Doc / path | Role |
|------------|------|
| [`DAM-HARNESS.md`](./DAM-HARNESS.md) | Env contract + adapter locations (once) |
| [`openapi-dam-api.yaml`](./openapi-dam-api.yaml) | Machine-readable contract |
| [`AGENT-ELECTRON-SYNC.md`](./AGENT-ELECTRON-SYNC.md) | Phase 1 architecture |
| [`../mcp/README.md`](../mcp/README.md) | Optional MCP (Claude Desktop + Cursor) |
| `src/api/localServer.ts` | Route implementation |
| `scripts/dam-api-examples.sh` | Curl smoke |
| `npm run dam:token` | Print token path/value |
| `npm run dam:decide` | Thin HTTP CLI |
| `npm run verify:api` | Automated API acceptance |
| `~/.hermes/skills/dammwt-harness/` | Hermes skill |
