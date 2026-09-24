# MWT DAM (DAMMWT)

Digital Asset Management MVP for Media Wave Technology — Phase 1 review & approval gate for generative pipelines.

**Repo:** https://github.com/13DJTEQ/DAMMWT

## Clone

```bash
git clone https://github.com/13DJTEQ/DAMMWT.git
cd DAMMWT
```

## Day 1 status

**Shipped:** storage abstraction + SQLite schema/manager scaffold.

| Layer | Contents |
|-------|----------|
| Storage | `StorageBackend` interface, `StorageFactory`, `FalBackend`, `LocalBackend` (Replit/ComfyUI stubbed) |
| Database | `ReviewQueue`, `ApprovalHistory`, `ArchiveJob` + transactional `DatabaseManager` |
| Docs | [docs/DAY1-README.md](docs/DAY1-README.md) |

**Not in Day 1:** Electron IPC (Day 2), React UI (Days 3–4), archive orchestration (Day 5), full test suite (Day 6). No HTTP server by design.

## Setup / verify

```bash
git checkout cursor/day-1-scaffold-decd
npm install
npm run build
npm run verify
```

`npm run verify` should print:

```json
{ total: 1, pending: 1, approved: 0, rejected: 0, changesRequested: 0 }
```

## Quick usage

```ts
import { DatabaseManager, StorageFactory } from 'mwt-dam-mvp';

const local = StorageFactory.create({ type: 'local', localPath: '/tmp/media' });
await local.healthCheck();

const db = new DatabaseManager('./data/dam.db');
db.ingestAsset({
  assetId: 'test-1',
  sourceBackend: 'local',
  sourceIdentifier: '/tmp/media/video.mp4',
  previewUrl: 'file:///tmp/media/video.mp4',
});
console.log(db.getQueueStats());
db.close();
```

## Spec

Notion: [DAM MVP Phase 1 Day 1 Scaffold](https://app.notion.com/p/DAM-MVP-Phase-1-Day-1-Scaffold-3e4ed1cc334881959506db1ae74f68f4)

## CI

On every PR and push to `main`, **CI (Node)** runs:

| Step | Command |
|------|---------|
| Install | `npm ci` (Node 20) |
| Lint | `npm run typecheck` |
| Build | `npm run build` |
| Test / MOE | `npm run verify` |

Also required for Conventional Commits: **Commitlint**. Verify stdout is summarized on the Actions job and uploaded as artifact `verify-report`.

Unused stack callers (`ci-go` / `ci-python` / `ci-ios`) were removed from this Node-only repo. Staging/prod deploy workflows remain placeholder until a launch target is chosen. Release versioning uses release-please (`release-type: node`).

**Required checks (when branch protection is enabled):** `CI (Node)` / `call-ci`, `Commitlint`.
