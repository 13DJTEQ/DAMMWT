# DAMMWT brand assets

Staged for gallery / web / Electron branding. Last curated 2026-10-22.

## Layout

| Path | Role |
|------|------|
| `assets/brand/` | Shared canonical copies |
| `web/public/brand/` | Vite static (`/brand/…`) |
| `src/renderer/assets/brand/` | Electron (`build-renderer.js` → `dist/renderer/assets/brand/`) |

The three trees are **hard-linked** (same inodes) so disk use is not tripled. Prefer editing under `assets/brand/`.

## Chosen files

| File | Role | Notes |
|------|------|-------|
| `mwt-logo-primary.jpeg` | **Primary mark** (Design Kit v2 #03) | Gold-frame circle, navy wave, MEDIA WAVE TECHNOLOGY. RGB on near-black matte — **not transparent**. Place on navy `#0A192F` or black only. |
| `mwt-emblem.png` | Transparent circular emblem | RGBA; UI / avatar chrome |
| `mwt-emblem-dark.png` | Dark-field emblem | Email-sig dark variant |
| `mwt-spiral-mark.png` | Transparent spiral + MWT mark | RGBA; small UI accent |
| `fib-spiral.svg` | Fibonacci spiral (vector) | Gold stroke `#d4af37`; Design Kit motif pack |
| `fibonacci-iris.png` | Spiral / iris hero | Generation inventory emblem-layer component |
| `palette.json` | Hex tokens | Locked v2 + legacy Brand DNA red |

## Palette tokens

### Locked (Design Kit v2 — 2026-10-02)

| Token | Hex | Use |
|-------|-----|-----|
| Navy | `#0A192F` | Default surface, email header |
| Gold | `#D4AF37` | Accent, logo gold (never yellow) |
| Cream | `#f4ede1` | Text on navy; light paper |
| Black | `#000000` | Alternate dark field behind logo |
| White | `#FFFFFF` | Text when cream is too warm |

### Legacy Brand DNA / Sept 15 kit (gallery red–gold theme)

| Token | Hex | Note |
|-------|-----|------|
| Red | `#FF0000` | **Retired** as fill / WAVE text for new brand art; red **borders** still allowed |
| Maroon | `#8B0000` | Legacy wave body |
| Charcoal | `#1A1A1A` | Legacy grid |

For DAM gallery chrome that wants a red–gold accent: use **gold `#D4AF37`** as primary accent and **red `#FF0000`** sparingly (borders / motifs), on **navy `#0A192F`**.

## Source paths

### Primary logo (authoritative)

- Notion: [MWT Design Kit v2](https://app.notion.com/p/3eeed1cc3348813ea90df44ec7b86cb0) (supersedes archive page `3dced1cc33488132be99cc838365e4b6`)
- Disk:  
  `/Users/administrator/Library/Mobile Documents/com~apple~CloudDocs/Documents/MediaWaveTechnology/MWT-Graphics-Canonical/logos/logos-2026-09-27/03-circle-gold-frame-navy-wave-MEDIA-WAVE-TECHNOLOGY.jpeg`  
  (PNG twin exists same folder; not staged — identical RGB art, larger)

### Transparent emblems + spiral extract

Vault: `…/MediaWaveTechnology/MediaWaveTech/MWTDAM/`

| Staged | Source |
|--------|--------|
| `mwt-emblem.png` | `graphics/mwt-iterations/email-signature/mwt-emblem-email-sig.png` |
| `mwt-emblem-dark.png` | `graphics/mwt-iterations/email-signature/mwt-emblem-email-sig-dark.png` |
| `mwt-spiral-mark.png` | `graphics/mwt-iterations/email-signature/variations/11-spiral-mwt-dark.png` |
| `fibonacci-iris.png` | `graphics/mwt-iterations/components/emblem-layers/fibonacci-iris.png` |

### Fibonacci SVG

`…/MWT-Graphics-Canonical/design-kit/motifs-fib-spiral/fib-spiral.svg`  
(siblings: `fib-spiral-ink.svg`, `-kanagawa`, `-paper`, `-tall` — not staged)

### Brand DNA doc

`…/MWTDAM/docs/MWTDAM-V1/Brand DNA & Design Kit refs.md`

Gallery ref logo path (vault): `gallery-collapse-qa/gallery/brand.json` → email-sig emblem.

## Missing pieces (sibling agents)

| Gap | Detail |
|-----|--------|
| **SVG / vector primary logo** | Does not exist. Kit gap #1. |
| **Transparent primary PNG** | Missing; current #03 has dark matte rectangle. |
| **Horizontal / stacked wordmark** with correct spelling | Missing. |
| **One-color black / reversed white** masters | Missing. |
| **Agent store `bc-76b37f07`** | Not present under `AgentStores` on this machine (Brand DNA still cites `/cursor/stores/bc-76b37f07-…/media/mwt-refs/`). Use CloudDocs `MWTDAM` + `MWT-Graphics-Canonical` instead. |
| **Do not ship** | Logo #01 (`TECHNLOGISE` typo), Firefly marks with `TECCHNOLOGY`, cut-sheet explorations as “the” logo. |
| **Optional not staged** | `05-gold-spiral-spiral.png` extract (~526 KB), `mwt-initials-source.png` (~898 KB), Media Wave horizontal lockup JPGs, circuit-wave badge #02. |

## Usage quick rules

1. Primary masthead / press: `mwt-logo-primary.jpeg` on navy or black only.
2. Small UI badges with transparency: `mwt-emblem.png` or `mwt-spiral-mark.png`.
3. Spiral motif: prefer `fib-spiral.svg`; raster hero `fibonacci-iris.png`.
4. Do not recolor gold → yellow; do not use red as body text.

## Electron notes

`npm run build:renderer` copies `src/renderer/assets/brand/` → `dist/renderer/assets/brand/` for `loadFile`. Restart Electron after rebuild to pick up chrome/asset changes. Gallery V1 Love/Keep/Reject chrome uses gold for Keep/accent and strong red for Love.
