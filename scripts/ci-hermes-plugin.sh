#!/usr/bin/env bash
# CI / local gate for the native Hermes DAM plugin.
# Skips with an explicit notice when `hermes` is not on PATH (upstream CI images).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="$ROOT/hermes-plugin/dammwt"

if ! command -v hermes >/dev/null 2>&1; then
  echo "ci-hermes-plugin: hermes CLI not found — skipping validate/doctor (install Hermes locally for full gate)"
  exit 0
fi

if [[ ! -f "$PLUGIN/plugin.yaml" || ! -f "$PLUGIN/__init__.py" ]]; then
  echo "ci-hermes-plugin: missing plugin tree at $PLUGIN" >&2
  exit 1
fi

echo "==> hermes plugins validate $PLUGIN"
hermes plugins validate "$PLUGIN"

echo "==> hermes plugins doctor $PLUGIN --ci"
hermes plugins doctor "$PLUGIN" --ci

echo "ci-hermes-plugin: PASS"
