# Launch: staging prerelease → prod GitHub Packages

Authorized launch path for [13DJTEQ/DAMMWT](https://github.com/13DJTEQ/DAMMWT):

| Stage | Trigger | What happens |
|-------|---------|--------------|
| Version | release-please merges Release PR → tag `vX.Y.Z` | Changelog + GitHub Release (may start as full release) |
| **Staging** | `deploy-staging.yml` on `v*` | `scripts/deploy.sh staging` ensures Release exists and marks it **prerelease** |
| **Prod** | `deploy-prod.yml` on `v*` + Environment approval | `scripts/deploy.sh prod` clears prerelease flag, then **`npm publish`** to GitHub Packages as `@13djteq/mwt-dam-mvp` |

Staging does **not** publish to npm. Prod is the only publish path.

## GitHub Environments

Create Environments on the repo (Settings → Environments):

| Name | Purpose | Protection |
|------|---------|------------|
| `staging` | Auto-run on version tags | Optional (no required reviewers) |
| `prod` | Same tag; human gate before npm publish | **Required reviewers** (Dave / designated) |

`deploy-reusable.yml` binds each job to `environment: staging|prod`.

## Secrets / tokens

| Name | Where | Scopes / use |
|------|-------|----------------|
| `GITHUB_TOKEN` | Actions default | Often enough for `gh release` if workflow has `contents: write` |
| `GH_TOKEN` | Optional repo/Environment secret | PAT if default token cannot create/edit Releases; override in Environment |
| `NODE_AUTH_TOKEN` | **prod** Environment (or repo) | Token with **`write:packages`** (+ `read:packages`); used for `npm publish` to `https://npm.pkg.github.com`. May be the same PAT as `GH_TOKEN` if scopes include packages + repo |

`deploy.sh` falls back: `NODE_AUTH_TOKEN` → `GH_TOKEN` → `GITHUB_TOKEN`.

For local smoke (optional):

```bash
export GH_TOKEN=ghp_...          # repo + write:packages
export NODE_AUTH_TOKEN=$GH_TOKEN
./scripts/deploy.sh staging v0.1.0
# after prod approval path:
./scripts/deploy.sh prod v0.1.0
```

## Install from GitHub Packages

```bash
echo '@13djteq:registry=https://npm.pkg.github.com' >> .npmrc
echo '//npm.pkg.github.com/:_authToken=YOUR_TOKEN' >> .npmrc
npm install @13djteq/mwt-dam-mvp@0.1.0
```

Package name is lowercase scope: `@13djteq/mwt-dam-mvp` (`publishConfig.registry` → GitHub Packages).

## release-please note

`release-please-config.json` uses standard **node** releases (`vX.Y.Z`). Staging prerelease is enforced by **deploy**, not by beta version tags. A separate `vX.Y.Z-beta.N` channel would need an extra release-please branch/config; not enabled for Week 1.
