# dammwt MCP (Phase 1)

Thin **stdio MCP** wrapper over the Electron localhost HTTP API (`127.0.0.1:7842`). No business logic — every tool is an HTTP call.

Requires **Electron MWT DAM running** with the Phase 1 API enabled. See [`docs/AGENT-ELECTRON-SYNC.md`](../docs/AGENT-ELECTRON-SYNC.md).

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

| Var | Default | Role |
|-----|---------|------|
| `DAM_API_BASE` | `http://127.0.0.1:${DAM_API_PORT:-7842}` | API root |
| `DAM_API_PORT` | `7842` | Port when `DAM_API_BASE` unset |
| `DAM_API_TOKEN` | (from file) | Bearer token (wins over file) |
| `DAM_API_TOKEN_FILE` | `~/Library/Application Support/@13djteq/mwt-dam-mvp/dam-api-token` | Token written on first Electron launch |

## Cursor MCP config

Add to Cursor MCP settings (or `~/.cursor/mcp.json`):

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

Or inject the token directly:

```json
{
  "mcpServers": {
    "dammwt": {
      "command": "node",
      "args": ["/Users/administrator/src/DAMMWT/mcp/index.mjs"],
      "env": {
        "DAM_API_PORT": "7842",
        "DAM_API_TOKEN": "<paste from dam-api-token file>"
      }
    }
  }
}
```

## Shell alternative

```bash
# decisions / queue without MCP
npm run dam:decide -- health
npm run dam:decide -- queue --status pending
npm run dam:decide -- submit --asset-id <id> --decision love --by cursor-agent
```

## When API is down

Tools return a clear **DAM API unreachable** error. Start Gallery:

```bash
cd /Users/administrator/src/DAMMWT
SEED=1 npm run review:electron
```
