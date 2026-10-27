# DAM harness adapters (Claude / Grok / Hermes / Cursor)

Thin adapters so any agent runtime can reach **MWT DAM** without Cursor-specific assumptions. Electron Gallery remains the single SQLite writer; adapters talk HTTP or stage bytes via CLI.

How-to per runtime: [HARNESS-CONNECTIVITY.md](./HARNESS-CONNECTIVITY.md). OpenAPI: [openapi-dam-api.yaml](./openapi-dam-api.yaml). Design: [AGENT-ELECTRON-SYNC.md](./AGENT-ELECTRON-SYNC.md). MCP: [`mcp/README.md`](../mcp/README.md).

## Env contract (once)

Set these in the harness environment (shell, MCP `env`, Hermes skill, Claude Desktop config). Paths below are the macOS defaults used on this machine.

| Var | Required | Default | Role |
|-----|----------|---------|------|
| `DAMMWT_ROOT` | for CLI / skills | `/Users/administrator/src/DAMMWT` | Absolute path to the DAMMWT git checkout |
| `DAM_API_BASE` | no | `http://127.0.0.1:${DAM_API_PORT:-7842}` | Full API root (no trailing slash) |
| `DAM_API_PORT` | no | `7842` | Used only when `DAM_API_BASE` is unset |
| `DAM_API_TOKEN` | one of token / file | — | Bearer token; **wins over file** |
| `DAM_API_TOKEN_FILE` | one of token / file | `~/Library/Application Support/@13djteq/mwt-dam-mvp/dam-api-token` | Token written on first Electron launch (mode `0600`) |
| `DAM_API_DISABLE` | no | unset | Set `1` in Electron to skip API start (CI / demos) |

Print path + value for injection:

```bash
cd "$DAMMWT_ROOT"
npm run dam:token
# npm run dam:token -- --export    # shell exports
# npm run dam:token -- --value-only
```

Health is unauthenticated. All other `/v1/*` routes need `Authorization: Bearer <token>`.

## Adapter locations

| Adapter | Path | Runtime |
|---------|------|---------|
| Stdio MCP | `mcp/index.mjs` (`npm run dam:mcp`) | Claude Desktop, Cursor, any MCP client |
| HTTP CLI | `scripts/dam-decide.mjs` (`npm run dam:decide`) | Shell / Grok / scripts |
| Token helper | `scripts/dam-token.mjs` (`npm run dam:token`) | Any harness |
| curl examples | `scripts/dam-api-examples.sh` | Smoke / copy-paste |
| OpenAPI | `docs/openapi-dam-api.yaml` | Grok / codegen / tool import |
| Bytes staging | `npm run push:media` / `dam:section` | Any (disk SoT) |
| Hermes / agents skill | `~/.hermes/skills/dammwt-harness/` · `~/.agents/skills/dammwt-harness/` · repo `.cursor/skills/dammwt-harness/` | Hermes, Claude Code, Cursor agents |
| Push-media skill | `~/.agents/skills/dammwt-push-media/` | Bytes-only workflows |

## MCP — Claude Desktop and Cursor (side by side)

Same binary: `node $DAMMWT_ROOT/mcp/index.mjs` (generic MCP JSON-RPC over stdio). Only the config file path differs.

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

**Cursor** — `~/.cursor/mcp.json` (or Cursor MCP settings):

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

Or inject `DAM_API_TOKEN` from `npm run dam:token -- --value-only` instead of `DAM_API_TOKEN_FILE`.

## curl (Grok / Hermes / any HTTP client)

```bash
export DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"
eval "$(npm run dam:token --prefix "$DAMMWT_ROOT" -- --export)"

curl -s "$DAM_API_BASE/v1/health" | jq .
curl -s -H "Authorization: Bearer $DAM_API_TOKEN" \
  "$DAM_API_BASE/v1/queue?status=pending" | jq .
```

Bytes still stage via CLI (preferred for bulk):

```bash
npm run push:media --prefix "$DAMMWT_ROOT" -- \
  --file /abs/out.png --partition generated --project my-client
```

## Prerequisites

1. Electron Gallery running (`cd "$DAMMWT_ROOT" && npm run review:electron`) so the loopback API is up.
2. Token file exists (created on first launch) **or** `DAM_API_TOKEN` set.
3. Do **not** open `dam.db` from a second process — HTTP/MCP/CLI only.
