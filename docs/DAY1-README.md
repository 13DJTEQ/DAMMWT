# DAM MVP — Day 1 Scaffold

Storage abstraction + SQLite database ready for Electron IPC (Day 2).

## Clone / checkout

```bash
git clone https://github.com/13DJTEQ/DAMMWT.git
cd DAMMWT
git checkout cursor/day-1-scaffold-decd
npm install && npm run build && npm run verify
```

## Design decisions

| Decision | Why |
|----------|-----|
| SQLite + WAL | Atomic transactions; avoids JSON persistence brittleness (Hermes failure mode) |
| Async backends | Ready for HTTP sources (fal.ai, Replit) + filesystem I/O |
| Separate tables | ApprovalHistory for audit; ArchiveJob for background retention |
| Version tracking | Supports resubmit when status is `changesRequested` |
| Pluggable backends | New sources via `StorageFactory` without core changes |
| No HTTP server | Direct Electron IPC instead (Day 2) |
| Strict TypeScript | No implicit `any` |

## Layout

```
src/storage/
  StorageBackend.ts   # Interface + Asset types
  StorageFactory.ts   # Factory
  FalBackend.ts       # fal.ai HTTP client (mock without FAL_KEY)
  LocalBackend.ts     # Local filesystem
src/database/
  schema.sql          # ReviewQueue, ApprovalHistory, ArchiveJob
  DatabaseManager.ts  # ingest / approve / stats / history
```

## API sketch

### Storage

```ts
const local = StorageFactory.create({ type: 'local', localPath: '/tmp' });
await local.healthCheck();
const assets = await local.listRecent(20);
```

### Database

```ts
const db = new DatabaseManager('/path/to/dam.db');
db.ingestAsset({ ... });
db.submitApproval({
  assetId: '...',
  decision: 'approved',
  reviewedBy: 'reviewer@mwt.com',
});
db.getQueueStats();
db.getAssetVersionHistory('...');
db.close();
```

## Status values

`pending` | `approved` | `rejected` | `changesRequested`

## Next

- Day 2: `src/main.ts` Electron + IPC handlers
- Days 3–4: React ReviewQueue / ApprovalCard UI
- Day 5: 30-day archive orchestration
- Day 6: testing

## Setup

```bash
npm install
npm run build
npm run verify
```
