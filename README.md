# CI/CD Template (GitHub Actions)

A reusable, project-agnostic pipeline. One set of workflow files lives in each
repo; each project customizes behavior through a thin caller + a `with:` block.
Versioning is automatic from commit messages (Conventional Commits → SemVer tags).
Published as a GitHub **template repo** — click "Use this template" to spin up a
new project repo with the full pipeline already wired.

## Architecture

```
push/PR to main
   ├─ ci-<stack>.yml  ──► ci-reusable.yml  (lint → build → test, per stack)
   └─ commitlint.yml  ──► rejects non-conventional commits

push to main (merge)
   └─ release-please.yml  ──► opens "Release PR"
        merge Release PR
          └─ cuts tag vX.Y.Z + GitHub Release + updates CHANGELOG

push of tag v*
   ├─ deploy-staging.yml  ──► deploy-reusable.yml  (environment: staging, auto)
   └─ deploy-prod.yml      ──► deploy-reusable.yml  (environment: prod, MANUAL approval)
```

Key rules:
- **CI never deploys.** Deploy only fires on a version tag.
- **One build, promote the artifact** through environments (don't rebuild for prod).
- **Staging auto-deploys; prod requires a human approval** (the `prod` environment reviewer gate).
- **main is always green** — branch protection blocks merges on red CI / bad commits.

## Per-project setup (5 minutes)

1. On GitHub: open this repo → **Use this template** → create the new project repo.
   (Branch protection recommendation below still applies to the new repo.)
2. Edit the matching caller (`ci-node.yml` / `ci-python.yml` / `ci-go.yml` /
   `ci-ios.yml`): set the `with:` block (commands, versions, Xcode scheme names).
   The `if: github.repository != '13DJTEQ/ci-cd-template'` guard should be
   **removed** in the consumer repo so CI actually runs there.
3. Set `release-type` in `release-please-config.json` to match the stack:
   `node`, `python`, `go`, or a
   [release-please release-type](https://github.com/googleapis/release-please).
4. Add `commitlint` dev dependency and `commitlint.config.cjs` (already included).
5. Replace the placeholder body in `scripts/deploy.sh` with your real deploy
   (kubectl / ssh / fastlane), branching on `$1` (staging|prod).

## Branch protection (run once per CONSUMER repo, needs `gh` + auth)

```bash
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field "required_status_checks[strict]=true" \
  --field "required_status_checks[contexts][]=call-ci" \
  --field "required_status_checks[contexts][]=commitlint" \
  --field "enforce_admins=true" \
  --field "required_pull_request_reviews[count]=1" \
  --field "required_pull_request_reviews[dismiss_stale_reviews]=true" \
  --field "required_pull_request_reviews[require_code_owner_reviews]=true" \
  --field "required_linear_history=true" \
  --field "restrictions=null"
```

Replace `:owner/:repo` with the actual slug. The status-check context `call-ci`
is the job name in the caller workflow — rename it there if you change it.
This template repo itself keeps only `commitlint` + code-owner review as the
gate, since it holds no buildable project.

## Environments + secrets (repo Settings → Environments / Secrets → Actions)

The template defines two environments:
- `staging` — no approval; auto-deploys on tag.
- `prod` — **required reviewer** (you). Tag pushes wait for your manual approval
  before deploying. Set the reviewer via Settings → Environments → prod →
  "Required reviewers."

Secrets each consumer repo needs:
- `DEPLOY_TOKEN` — used by deploy-reusable.yml (your staging/prod credentials).
  Set it once per repo:
  ```bash
  gh secret set DEPLOY_TOKEN -R :owner/:repo --body "$YOUR_TOKEN"
  ```
- `CODECOV_TOKEN` — optional, for coverage upload in ci-reusable.yml.

## Conventional Commits (drives versioning)

```
feat: add retry to uploader        → MINOR bump
fix: null deref in parser          → PATCH bump
feat!: drop node 18 support        → MAJOR bump (! = breaking)
```

Release-please opens a Release PR; merging it cuts `vX.Y.Z` and a GitHub Release.
The tag then triggers the staging deploy automatically; prod waits for approval.

## License

MIT — see `LICENSE`. Copyright (c) 2026 Dave Thompson / Media Wave Technology (MWT).
Free to reuse, modify, and redistribute with attribution; provided as-is, no warranty.
