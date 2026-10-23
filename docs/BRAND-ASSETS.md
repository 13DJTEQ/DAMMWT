# MWT brand assets (DAMMWT)

Canonical copies for Gallery / Design Kit chrome. Sourced read-only from the MWTDAM vault (`graphics/mwt-iterations/…`). Palette & type: Design Kit — Primary red `#FF0000`, gold `#D4AF37`, navy `#0A192F`, charcoal `#1A1A1A`; web type Playfair Display + Work Sans.

## Paths

| Role | Web (Vite public) | Electron renderer |
|------|-------------------|-------------------|
| Emblem (color) | `web/public/brand/mwt-emblem.png` | `src/renderer/assets/brand/mwt-emblem.png` |
| Emblem (dark) | `web/public/brand/mwt-emblem-dark.png` | same under `assets/brand/` |
| Spiral mark | `web/public/brand/mwt-spiral-mark.png` | … |
| Mono gold | `web/public/brand/mwt-mono-gold.png` | … |
| Media Wave lockup | `web/public/brand/media-wave-horizontal-lockup.jpg` | … |
| Wordmark | `web/public/brand/media-wave-technology-wordmark.jpg` | … |
| Gold Fibonacci spiral | `web/public/brand/gold-spiral.png` | … |
| Fibonacci iris | `web/public/brand/fibonacci-iris.png` | … |
| Gallery brand ref JSON | `web/public/brand/brand.gallery-ref.json` | … |
| Provenance | `web/public/brand/SOURCES.md` | … |

Web URLs are `/brand/<file>` (served from `web/public/brand/`). Favicon: `/brand/mwt-emblem.png`.

Electron: `npm run build:renderer` copies `src/renderer/assets/brand/` → `dist/renderer/assets/brand/` for `loadFile` (paths in JSX are `./assets/brand/…`). Restart Electron after rebuild to pick up chrome changes.

If assets are missing locally, copy from MWTDAM per `SOURCES.md` into both trees (keep filenames stable).
