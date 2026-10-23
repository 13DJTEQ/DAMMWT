#!/usr/bin/env bash
# Rebuild native ABI + app, then launch Electron for Gallery UI review.
# Usage: npm run review:electron
# Optional: SEED=1 npm run review:electron  (re-seed media / backfill localPath+cloudUrl)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Stopping existing DAMMWT Electron (if any)"
pkill -f "${ROOT}/node_modules/electron" 2>/dev/null || true
sleep 0.3

echo "==> Rebuilding better-sqlite3 for Electron ABI"
npx @electron/rebuild -f -w better-sqlite3

if [[ "${SEED:-}" == "1" ]]; then
  echo "==> Seeding media (localPath / cloudUrl backfill)"
  npm run seed:media
fi

echo "==> Build + start Electron"
npm start &
APP_PID=$!

# Give the window a moment to appear, then bring frontmost (macOS).
if [[ "$(uname -s)" == "Darwin" ]]; then
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if osascript -e 'tell application "System Events" to (name of processes) contains "Electron"' >/dev/null 2>&1; then
      osascript <<'OSA' >/dev/null 2>&1 || true
tell application "System Events"
  set procs to every process whose name is "Electron"
  repeat with p in procs
    try
      if exists (window 1 of p) then
        set frontmost of p to true
        exit repeat
      end if
    end try
  end repeat
end tell
try
  tell application "Electron" to activate
end try
OSA
      # Prefer titled Gallery window when present
      osascript -e 'tell application "System Events" to tell process "Electron" to set frontmost to true' >/dev/null 2>&1 || true
      break
    fi
  done
fi

echo "==> Electron review app launching (pid ${APP_PID}). Window title is often \"MWT DAM — Gallery\"."
wait "$APP_PID"
