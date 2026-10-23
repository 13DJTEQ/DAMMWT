# MWT DAM — Web Gallery (sync scaffold)

Browser preview of Gallery V1 (`love` / `keep` / `reject` + notes) with pluggable local/cloud storage and a thin sync client.

See [../docs/WEB-SYNC.md](../docs/WEB-SYNC.md) for architecture, conflict policy, and env vars.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

Default: in-memory store + in-memory sync transport (fully runnable).  
Cloud default (stub): Supabase.
