# dammwt MCP (Phase 1)

Thin **optional** stdio MCP adapter over the Electron localhost HTTP API (`127.0.0.1:7842`). No business logic — every tool is an HTTP call. Works with **any** MCP client (Claude Desktop, Cursor, and others) — nothing here is Cursor-specific. Any harness can skip MCP and call HTTP directly ([`docs/HARNESS-CONNECTIVITY.md`](../docs/HARNESS-CONNECTIVITY.md), OpenAPI [`docs/openapi-dam-api.yaml`](../docs/openapi-dam-api.yaml)).

Requires **Electron MWT DAM running** with the Phase 1 API enabled. Env contract + adapters: [`docs/DAM-HARNESS.md`](../docs/DAM-HARNESS.md). Design: [`docs/AGENT-ELECTRON-SYNC.md`](../docs/AGENT-ELECTRON-SYNC.md).

```bash
node mcp/index.mjs
# or: npm run dam:mcp
```

## Tools

| Tool | HTTP |
|------|------|
| `dam_health` | `GET /v1/health` |
| `dam_create_project` | `POST /v1/projects` |
| `dam_push_asset` | `POST /v1/assets` |
| `dam_refresh` | `POST /v1/media/refresh` |
| `dam_list_queue` | `GET /v1/queue` |
| `dam_submit_decision` | `POST /v1/approvals` |
| `dam_get_lineage` | `GET /v1/assets/:id/lineage` |
| `dam_reveal_file` | `POST /v1/shell/reveal` |
| `dam_open_file` | `POST /v1/shell/open` |

## Env

Same contract as all harnesses ([`docs/DAM-HARNESS.md`](../docs/DAM-HARNESS.md)):

| Var | Default | Role |
|-----|---------|------|
| `DAMMWT_ROOT` | (checkout path) | Repo root for CLI / skills (not required by MCP itself) |
| `DAM_API_BASE` | `http://127.0.0.1:${DAM_API_PORT:-7842}` | API root |
| `DAM_API_PORT` | `7842` | Port when `DAM_API_BASE` unset |
| `DAM_API_TOKEN` | (from file) | Bearer token (wins over file) |
| `DAM_API_TOKEN_FILE` | `~/Library/Application Support/@13djteq/mwt-dam-mvp/dam-api-token` | Token written on first Electron launch |

Print token for injection: `npm run dam:token` (or `-- --export` / `-- --value-only`).

## Client configs (side by side)

Same `command` / `args` / `env` — only the config **file** differs.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Cursor

`~/.cursor/mcp.json` (or Cursor MCP settings UI):

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

### Token via env (any client)

```json
{
  "mcpServers": {
    "dammwt": {
      "command": "node",
      "args": ["/Users/administrator/src/DAMMWT/mcp/index.mjs"],
      "env": {
        "DAM_API_PORT": "7842",
        "DAM_API_TOKEN": "<paste from: npm run dam:token -- --value-only>"
      }
    }
  }
}
```

## Shell alternative

```bash
npm run dam:token
npm run dam:decide -- health
npm run dam:decide -- queue --status pending
npm run dam:decide -- submit --asset-id <id> --decision love --by harness
```

Hermes / agents skill: `~/.hermes/skills/dammwt-harness/` · `~/.agents/skills/dammwt-harness/`.

## When API is down

Tools return a clear **DAM API unreachable** error. Start Gallery:

```bash
cd /Users/administrator/src/DAMMWT
SEED=1 npm run review:electron
```
