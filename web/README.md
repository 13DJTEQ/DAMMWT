# MWT DAM — Web Gallery (sync scaffold)

Browser preview of Gallery V1 (`love` / `keep` / `reject` + notes) with pluggable local/cloud storage and a thin sync client.

On boot the store seeds from curated Tattoo Design graphics in
`public/media/manifest.json` (also `MANIFEST.json`). Sections:

- **Originals / Source of Truth** — master seeds / references
- **Tattoos** — placement & flash designs
- **Generated** — when present in the manifest

Asset detail shows **Generation history** when `parentSourceId` (or manifest
`parentId` / `derivedFrom`) links back to an original.

See [../docs/WEB-SYNC.md](../docs/WEB-SYNC.md) for architecture, conflict policy, and env vars.

```bash
# from repo root
npm run web:install
npm run web:dev          # http://localhost:5173
npm run web:typecheck
npm run web:build

# refresh curated media from MWTDAM (optional)
node scripts/curate-media.mjs
```

Default: in-memory store + in-memory sync transport (fully runnable).  
Cloud default (stub): Supabase.
