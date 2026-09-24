#!/usr/bin/env bash
# Deploy entry point. Called by deploy-reusable.yml with:
#   $1 = environment (staging|prod)
#   $2 = release tag (vX.Y.Z)
#
# Staging: ensure a GitHub Release exists for $TAG and mark it prerelease.
# Prod: ensure a full (non-prerelease) GitHub Release, then npm publish to
#       GitHub Packages (@13djteq scope).
#
# Secrets / env:
#   GH_TOKEN or GITHUB_TOKEN  — create/edit GitHub Releases (repo scope)
#   NODE_AUTH_TOKEN           — npm publish to GitHub Packages (write:packages);
#                               falls back to GH_TOKEN / GITHUB_TOKEN if unset
set -euo pipefail

ENV="${1:?usage: deploy.sh <staging|prod> <tag>}"
TAG="${2:?usage: deploy.sh <staging|prod> <tag>}"
REPO="${GITHUB_REPOSITORY:-13DJTEQ/DAMMWT}"
GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-${GH_TOKEN}}"

echo "Deploying ${TAG} to ${ENV} (repo=${REPO})"

require_gh_token() {
  if [[ -z "${GH_TOKEN}" ]]; then
    echo "GH_TOKEN or GITHUB_TOKEN is required for ${ENV} deploy" >&2
    exit 1
  fi
  export GH_TOKEN
  export GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN}}"
}

# Create release if missing; otherwise edit prerelease flag.
# $1 = true|false for --prerelease
ensure_github_release() {
  local prerelease="$1"
  require_gh_token

  if gh release view "${TAG}" --repo "${REPO}" >/dev/null 2>&1; then
    echo "Release ${TAG} exists; setting prerelease=${prerelease}"
    if [[ "${prerelease}" == "true" ]]; then
      gh release edit "${TAG}" --repo "${REPO}" --prerelease
    else
      gh release edit "${TAG}" --repo "${REPO}" --prerelease=false
    fi
  else
    echo "Creating GitHub Release ${TAG} (prerelease=${prerelease})"
    local args=(release create "${TAG}" --repo "${REPO}" --title "${TAG}" --generate-notes)
    if [[ "${prerelease}" == "true" ]]; then
      args+=(--prerelease)
    fi
    # Tag should already exist from release-please; target the tag ref.
    args+=(--target "${TAG}")
    gh "${args[@]}"
  fi
}

setup_npmrc_github_packages() {
  local token="${NODE_AUTH_TOKEN}"
  if [[ -z "${token}" ]]; then
    echo "NODE_AUTH_TOKEN (or GH_TOKEN/GITHUB_TOKEN) required for npm publish" >&2
    exit 1
  fi
  # Scoped registry + auth for GitHub Packages
  {
    echo "@13djteq:registry=https://npm.pkg.github.com"
    echo "//npm.pkg.github.com/:_authToken=${token}"
  } > .npmrc
  echo "Wrote .npmrc for @13djteq → npm.pkg.github.com"
}

publish_github_packages() {
  setup_npmrc_github_packages
  echo "Publishing @13djteq/mwt-dam-mvp to GitHub Packages (tag=${TAG})"
  npm publish --access restricted
}

case "$ENV" in
  staging)
    ensure_github_release true
    echo "STAGING: ${TAG} marked as GitHub prerelease (no npm publish)"
    ;;
  prod)
    ensure_github_release false
    publish_github_packages
    echo "PROD: ${TAG} full release + npm publish complete"
    ;;
  *)
    echo "Unknown environment: $ENV" >&2
    exit 1
    ;;
esac

echo "Deploy to ${ENV} complete."
