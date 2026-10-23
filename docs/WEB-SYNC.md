# Web Gallery + Sync

Browser-based DAM Gallery scaffold on branch `cursor/web-sync-gallery-d1e8`, built on **Gallery V1** decisions (`love` / `keep` / `reject` + notes).

This is additive: Electron remains the desktop app under `src/`. The web preview lives in `web/` and does not replace IPC/SQLite.

## Run

```bash
# from repo root
npm run web:install   # once
npm run web:dev       # Vite → http://localhost:5173
npm run web:build     # typecheck + production bundle
npm run web:preview   # serve dist
```

Or from `web/`:

```bash
cd web && npm install && npm run dev
```

Electron verify is unchanged: `npm run verify` from the repo root.

## What syncs

| Field | Syncs? | Notes |
|-------|--------|--------|
| Decision (`love` / `keep` / `reject` / `changesRequested` / `pending`) | Yes | Same vocabulary as Electron Gallery V1 |
| Notes, reviewedBy, version, revision | Yes | Whole-document LWW merge |
| Preview URL / tags / description | Yes | Metadata travels with the asset row |
| Binary media bytes | No (scaffold) | URLs only; blob sync is future work |
| Archive / cold storage jobs | No | Electron-only for now |

## Architecture

```
web/src/
  domain/gallery.ts     # shared decision model (mirrors Electron types)
  storage/
    GalleryStore.ts     # interface
    MemoryGalleryStore  # default runnable stub
    IndexedDbGalleryStore
    SupabaseGalleryStore  # cloud stub (default cloud choice)
  sync/
    SyncClient.ts       # pull → merge → push
    conflict.ts         # CRDT-lite policy
    MemorySyncTransport # in-memory “cloud”
    SupabaseSyncTransport  # stub
```

### Storage backends

| Kind | Role | Status |
|------|------|--------|
| `memory` | In-process seed data | **Default** — runnable with no setup |
| `indexeddb` | Local browser DB | Implemented |
| `supabase` | Cloud Postgres via Supabase | **Default cloud target** — stub until env vars exist |

Set store via env: `VITE_GALLERY_STORE=memory|indexeddb|supabase`.

### Sync backends

| Kind | Role | Status |
|------|------|--------|
| `memory` | Simulated remote for pull/push | **Default** |
| `supabase` | PostgREST / Realtime | Stub |

Set sync via env: `VITE_SYNC_BACKEND=memory|supabase`.

Cloud credentials (when implementing the stub):

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

**Firebase** (or other document DBs) can implement the same `GalleryStore` / `SyncTransport` interfaces; they are intentionally not the default so the scaffold has one concrete cloud path.

## Conflict policy (CRDT-lite)

Implemented in `web/src/sync/conflict.ts`:

1. Higher `revision` wins.
2. Else later `updatedAt` wins.
3. Else lexicographically greater `lastWriterId` wins (deterministic tie-break).

Merge is whole-document last-write-wins (status + notes travel together). Field-level CRDTs are out of scope for this scaffold.

Protocol sketch:

1. **Pull** changes since cursor → merge into local store.
2. **Push** dirty (or full) local rows → remote merges with the same policy → advance cursor.

## Sharing with Electron

`web/src/domain/gallery.ts` mirrors `ReviewStatus` / queue row shapes from `src/database/DatabaseManager.ts` without importing Node modules (`better-sqlite3`). A future `packages/shared` extraction can re-export both sides; this branch keeps the Electron package layout intact.

## Open decisions

- Promote types into a real shared package vs keep mirrored files.
- Whether Electron should speak the same sync transport (local API bridge) or remain SQLite-only.
- Supabase schema / RLS vs alternative hosted Postgres.
- Media blob sync and auth (anonymous vs signed-in reviewers).
