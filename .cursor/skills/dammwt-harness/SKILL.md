---
name: dammwt-harness
description: >-
  Reach MWT DAM (DAMMWT) from Claude, Grok, Hermes, or Cursor via localhost
  HTTP / MCP / curl — no Cursor-only assumptions. Health, queue, decisions,
  lineage, reveal; stage bytes with push:media. Project pointer to
  ~/.agents/skills/dammwt-harness and ~/.hermes/skills/dammwt-harness.
---

# DAMMWT harness (project pointer)

**Canonical skills:**

- `~/.agents/skills/dammwt-harness/SKILL.md` (Claude / Cursor / generic agents)
- `~/.hermes/skills/dammwt-harness/SKILL.md` (Hermes)

**Env contract (single source):** `$DAMMWT_ROOT/docs/DAM-HARNESS.md`

```bash
export DAMMWT_ROOT="${DAMMWT_ROOT:-/Users/administrator/src/DAMMWT}"
npm run dam:token --prefix "$DAMMWT_ROOT"
eval "$(npm run dam:token --prefix "$DAMMWT_ROOT" -- --export)"

# HTTP
curl -s "$DAM_API_BASE/v1/health" | jq .
curl -s -H "Authorization: Bearer $DAM_API_TOKEN" \
  "$DAM_API_BASE/v1/queue?status=pending" | jq .

# CLI
npm run dam:decide --prefix "$DAMMWT_ROOT" -- health
npm run dam:decide --prefix "$DAMMWT_ROOT" -- queue --status pending

# Bytes
npm run push:media --prefix "$DAMMWT_ROOT" -- \
  --file "/absolute/out.png" --partition generated --project my-client
```

MCP (Claude Desktop **and** Cursor): `mcp/README.md` — same `node mcp/index.mjs` stdio server.
