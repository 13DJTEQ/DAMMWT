#!/usr/bin/env bash
# Autonomous MVP smoke (F1 / AE1): ensure → section → push fixture → list queue → optional decide/notes → export.
# Requires a display session for Electron launch. Probe-only mode: DAM_SMOKE_NO_LAUNCH=1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export DAMMWT_ROOT="$ROOT"

SLUG="${DAM_SMOKE_PROJECT:-hermes-smoke-$(date +%Y%m%d%H%M%S)}"
FIXTURE="${DAM_SMOKE_FIXTURE:-}"
TMP=""

cleanup() {
  if [[ -n "$TMP" && -d "$TMP" ]]; then
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT

if [[ -z "$FIXTURE" ]]; then
  TMP="$(mktemp -d "${TMPDIR:-/tmp}/dam-smoke.XXXXXX")"
  FIXTURE="$TMP/smoke.png"
  # Minimal valid 1×1 PNG
  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' >"$FIXTURE"
fi

echo "==> dam:ensure (project will be $SLUG)"
if [[ "${DAM_SMOKE_NO_LAUNCH:-}" == "1" ]]; then
  npm run dam:ensure -- --no-launch || {
    echo "dam-autonomous-smoke: API down and DAM_SMOKE_NO_LAUNCH=1" >&2
    exit 1
  }
else
  npm run dam:ensure
fi

eval "$(npm run dam:token -- --export)"
BASE="${DAM_API_BASE:-http://127.0.0.1:7842}"

echo "==> create section $SLUG"
npm run dam:section -- --project "$SLUG"

echo "==> push fixture → $SLUG"
npm run push:media -- --file "$FIXTURE" --partition generated --project "$SLUG" --title "hermes-smoke"

echo "==> list pending queue"
QUEUE_JSON="$(npm run dam:decide -- queue --status pending --project "$SLUG")"
echo "$QUEUE_JSON" | head -c 2000
echo

if [[ "${DAM_SMOKE_DECIDE:-0}" == "1" ]]; then
  ASSET_ID="$(echo "$QUEUE_JSON" | node -e '
    let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
      try {
        const j=JSON.parse(s);
        const row=(j.queue||[])[0];
        if(!row) process.exit(2);
        process.stdout.write(row.assetId);
      } catch { process.exit(3); }
    });
  ')" || true
  if [[ -n "${ASSET_ID:-}" ]]; then
    echo "==> decide love + notes amend ($ASSET_ID)"
    npm run dam:decide -- submit --asset-id "$ASSET_ID" --decision love --by hermes-smoke --notes "smoke"
    npm run dam:decide -- notes --asset-id "$ASSET_ID" --notes "smoke — warmer grade"
  fi
fi

echo "==> export feedback"
npm run dam:decide -- export --project "$SLUG"

echo "dam-autonomous-smoke: PASS (project=$SLUG base=$BASE)"
