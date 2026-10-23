# DAMMWT curated media

Canonical store for Tattoo Design graphics and Source-of-Truth originals.

- **Layout:** `originals/` · `tattoos/` · `generated/` (optional) · `projects/<slug>/{originals,tattoos,generated}/`
- **Index:** `manifest.json` / `MANIFEST.json` (`projects[]` registry for sections)
- **Web mirror:** `web/public/media/` (same tree; URLs `/media/…`)
- **Docs:** [`docs/MEDIA-INVENTORY.md`](../../docs/MEDIA-INVENTORY.md)
- **Refresh:** `npm run curate:media`
- **Sections:** `npm run dam:section -- --project <slug>` then `npm run push:media -- … --project <slug>`
