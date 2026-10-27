#!/usr/bin/env bash
# Smoke / example curl against the DAM localhost HTTP API.
# Requires Electron MWT DAM running (API on 127.0.0.1:7842 by default).
# Usage: bash scripts/dam-api-examples.sh
#        DAM_API_TOKEN=… DAM_API_PORT=7842 bash scripts/dam-api-examples.sh
set -euo pipefail

PORT="${DAM_API_PORT:-7842}"
BASE="${DAM_API_BASE:-http://127.0.0.1:${PORT}}"
TOKEN_FILE="${DAM_API_TOKEN_FILE:-$HOME/Library/Application Support/@13djteq/mwt-dam-mvp/dam-api-token}"

if [[ -n "${DAM_API_TOKEN:-}" ]]; then
  TOKEN="$DAM_API_TOKEN"
elif [[ -f "$TOKEN_FILE" ]]; then
  TOKEN="$(tr -d '[:space:]' <"$TOKEN_FILE")"
else
  echo "No token: set DAM_API_TOKEN or create Electron once so $TOKEN_FILE exists" >&2
  exit 1
fi

auth=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/json")
json=(-H "Content-Type: application/json")

echo "== GET $BASE/v1/health (no auth) =="
curl -sf "$BASE/v1/health" | (command -v jq >/dev/null && jq . || cat)
echo

echo "== GET $BASE/v1/projects =="
curl -sf "${auth[@]}" "$BASE/v1/projects" | (command -v jq >/dev/null && jq . || cat)
echo

echo "== GET $BASE/v1/queue?status=pending =="
curl -sf "${auth[@]}" "$BASE/v1/queue?status=pending" | (command -v jq >/dev/null && jq . || cat)
echo

echo "== GET $BASE/v1/queue/stats =="
curl -sf "${auth[@]}" "$BASE/v1/queue/stats" | (command -v jq >/dev/null && jq . || cat)
echo

# Optional mutating demos (set DAM_API_SMOKE_MUTATE=1)
if [[ "${DAM_API_SMOKE_MUTATE:-0}" == "1" ]]; then
  SLUG="${DAM_API_SMOKE_PROJECT:-api-examples-probe}"
  echo "== POST $BASE/v1/projects slug=$SLUG =="
  curl -sf "${auth[@]}" "${json[@]}" -X POST \
    -d "{\"slug\":\"$SLUG\"}" "$BASE/v1/projects" | (command -v jq >/dev/null && jq . || cat)
  echo

  echo "== POST $BASE/v1/media/refresh =="
  curl -sf "${auth[@]}" -X POST "$BASE/v1/media/refresh" | (command -v jq >/dev/null && jq . || cat)
  echo

  if [[ -n "${DAM_API_SMOKE_ASSET_ID:-}" ]]; then
    AID="$DAM_API_SMOKE_ASSET_ID"
    echo "== GET $BASE/v1/assets/$AID/lineage =="
    curl -sf "${auth[@]}" "$BASE/v1/assets/$AID/lineage" | (command -v jq >/dev/null && jq . || cat)
    echo

    if [[ -n "${DAM_API_SMOKE_DECISION:-}" ]]; then
      echo "== POST $BASE/v1/approvals $AID → $DAM_API_SMOKE_DECISION =="
      curl -sf "${auth[@]}" "${json[@]}" -X POST \
        -d "{\"assetId\":\"$AID\",\"decision\":\"$DAM_API_SMOKE_DECISION\",\"reviewedBy\":\"dam-api-examples\",\"notes\":\"smoke\"}" \
        "$BASE/v1/approvals" | (command -v jq >/dev/null && jq . || cat)
      echo
    fi

    if [[ -n "${DAM_API_SMOKE_REVEAL_PATH:-}" ]]; then
      echo "== POST $BASE/v1/shell/reveal =="
      curl -sf "${auth[@]}" "${json[@]}" -X POST \
        -d "{\"localPath\":\"$DAM_API_SMOKE_REVEAL_PATH\"}" \
        "$BASE/v1/shell/reveal" | (command -v jq >/dev/null && jq . || cat)
      echo
    fi
  fi
else
  echo "(skip mutate) Set DAM_API_SMOKE_MUTATE=1 to POST project/refresh;"
  echo "  optionally DAM_API_SMOKE_ASSET_ID / DAM_API_SMOKE_DECISION / DAM_API_SMOKE_REVEAL_PATH"
fi

echo "OK — examples against $BASE"
