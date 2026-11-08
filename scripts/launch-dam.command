#!/usr/bin/env bash
# MWT DAM quick launch — double-click in Finder, or open from Dock via "MWT DAM.app".
# Rebuilds Electron ABI + app, then opens the Gallery window (npm run review:electron).
# Optional: SEED=1 ./scripts/launch-dam.command  (re-seed media / file links)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> MWT DAM — launching from ${ROOT}"
echo "    (SEED=1 to re-seed; Dock: Applications → MWT DAM)"
exec npm run review:electron
