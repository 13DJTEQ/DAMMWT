#!/usr/bin/env node
/**
 * Curate a lean tattoo + originals subset from MWTDAM into DAMMWT.
 *
 * Media root (canonical): assets/media/
 *   assets/media/originals/   — Source of Truth seeds / refs
 *   assets/media/tattoos/     — flash, body-maps, arm-*, scorpions, …
 *   assets/media/generated/   — optional non-tattoo gens (empty in default plan)
 *
 * Vite mirror (web previews at /media/…):
 *   web/public/media/{originals,tattoos,generated}/
 *
 * Manifests (identical content):
 *   assets/media/manifest.json + MANIFEST.json
 *   web/public/media/manifest.json + MANIFEST.json
 *
 * Refresh:
 *   npm run curate:media
 *   MWTDAM_TATTOO_ROOT=/path/to/tattoo npm run curate:media
 *
 * Default source (iCloud):
 *   …/MWTDAM/tattoo-designs/tattoo/{references,generated}
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'fs';
import { basename, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const DEFAULT_SRC = join(
  process.env.HOME ?? '',
  'Library/Mobile Documents/com~apple~CloudDocs/Documents/MediaWaveTechnology/MediaWaveTech/MWTDAM/tattoo-designs/tattoo',
);
const srcRoot = process.env.MWTDAM_TATTOO_ROOT || DEFAULT_SRC;

const assetsMedia = join(root, 'assets', 'media');
const webMedia = join(root, 'web', 'public', 'media');

/** @typedef {'originals' | 'tattoos' | 'generated'} Partition */

/**
 * @typedef {object} ManifestAsset
 * @property {string} id
 * @property {string} assetId
 * @property {string} title
 * @property {Partition} partition
 * @property {string} previewPath  relative under media/ (e.g. tattoos/flash/01-….jpg)
 * @property {string} previewUrl   web URL (/media/…) — Electron uses file:// from assets/media
 * @property {string} localPath    repo-relative path (assets/media/…) for Reveal / copy-path
 * @property {string | null} cloudUrl  optional Notion / Drive / Supabase / CDN URL (null when unknown)
 * @property {string} sourcePath   relative to MWTDAM tattoo root
 * @property {string | null} parentSourceId  canonical lineage → parent assetId (null = SoT root)
 * @property {string | null} [parentId]      alias of parentSourceId (compat)
 * @property {string | null} [derivedFrom]   alias of parentSourceId (compat / reports)
 * @property {string | null} [batch]
 * @property {string | null} [report]
 * @property {string[]} tags
 * @property {string | null} description
 */

/** @type {Array<{ src: string, dest: string, partition: Partition, title?: string, derivedFrom?: string | null, batch?: string | null, tags?: string[], description?: string | null, report?: string | null, cloudUrl?: string | null }>} */
const PLAN = [
  // —— Originals / Source of Truth ——
  {
    src: 'references/base/01-irezumi-color-dragon.jpg',
    dest: 'originals/base/01-irezumi-color-dragon.jpg',
    partition: 'originals',
    title: 'Irezumi color dragon (seed)',
    batch: 'tattoo-base',
    tags: ['original', 'seed', 'dragon', 'irezumi'],
    description: 'Master seed for wave-dragon flash lineage',
  },
  {
    src: 'references/base/02-blackout-gold-dragon.jpg',
    dest: 'originals/base/02-blackout-gold-dragon.jpg',
    partition: 'originals',
    title: 'Blackout gold dragon (seed)',
    batch: 'tattoo-base',
    tags: ['original', 'seed', 'dragon', 'blackout'],
    description: 'Master seed for blackout-gold flash lineage',
  },
  {
    src: 'references/base/03-body-canvas-torso.jpg',
    dest: 'originals/base/03-body-canvas-torso.jpg',
    partition: 'originals',
    title: 'Body canvas torso',
    batch: 'tattoo-base',
    tags: ['original', 'seed', 'body-canvas'],
    description: 'Placement canvas used for body-map overlays',
  },
  {
    src: 'references/esoteric/ref-eye-starburst.jpg',
    dest: 'originals/esoteric/ref-eye-starburst.jpg',
    partition: 'originals',
    title: 'Ref — eye starburst',
    batch: 'esoteric',
    tags: ['original', 'esoteric', 'eye'],
  },
  {
    src: 'references/esoteric/ref-metallic-compass.jpg',
    dest: 'originals/esoteric/ref-metallic-compass.jpg',
    partition: 'originals',
    title: 'Ref — metallic compass',
    batch: 'esoteric',
    tags: ['original', 'esoteric', 'compass'],
  },
  {
    src: 'references/esoteric/ref-minimal-compass-eye.jpg',
    dest: 'originals/esoteric/ref-minimal-compass-eye.jpg',
    partition: 'originals',
    title: 'Ref — minimal compass + eye',
    batch: 'esoteric',
    tags: ['original', 'esoteric', 'compass', 'eye'],
  },
  {
    src: 'references/esoteric/ref-heraldic-wings.jpg',
    dest: 'originals/esoteric/ref-heraldic-wings.jpg',
    partition: 'originals',
    title: 'Ref — heraldic wings',
    batch: 'esoteric',
    tags: ['original', 'esoteric', 'heraldic'],
  },
  {
    src: 'references/esoteric/ref-lineart-square-g.jpg',
    dest: 'originals/esoteric/ref-lineart-square-g.jpg',
    partition: 'originals',
    title: 'Ref — square G filigree',
    batch: 'esoteric',
    tags: ['original', 'esoteric', 'filigree'],
  },
  {
    src: 'references/esoteric/ref-crystalline-knot.jpg',
    dest: 'originals/esoteric/ref-crystalline-knot.jpg',
    partition: 'originals',
    title: 'Ref — crystalline knot',
    batch: 'esoteric',
    tags: ['original', 'esoteric', 'knot'],
  },
  {
    src: 'references/esoteric/ref-seals-grid.jpg',
    dest: 'originals/esoteric/ref-seals-grid.jpg',
    partition: 'originals',
    title: 'Ref — seals grid',
    batch: 'esoteric',
    tags: ['original', 'esoteric', 'seals'],
  },
  {
    src: 'references/durango-scorpions/Centruroides_edwardsii_1.jpg',
    dest: 'originals/scorpions/Centruroides_edwardsii_1.jpg',
    partition: 'originals',
    title: 'Centruroides edwardsii (photo)',
    batch: 'durango-scorpions',
    tags: ['original', 'scorpion', 'photo'],
    description: 'Species photo seed for scorpion tattoo styles',
  },
  {
    src: 'references/durango-scorpions/Centruroides_suffusus_1.jpg',
    dest: 'originals/scorpions/Centruroides_suffusus_1.jpg',
    partition: 'originals',
    title: 'Centruroides suffusus (photo)',
    batch: 'durango-scorpions',
    tags: ['original', 'scorpion', 'photo'],
  },
  {
    src: 'references/durango-scorpions/Centruroides_vittatus_1.jpg',
    dest: 'originals/scorpions/Centruroides_vittatus_1.jpg',
    partition: 'originals',
    title: 'Centruroides vittatus (photo)',
    batch: 'durango-scorpions',
    tags: ['original', 'scorpion', 'photo'],
  },
  {
    src: 'references/durango-scorpions/Centruroides_infamatus_1.jpg',
    dest: 'originals/scorpions/Centruroides_infamatus_1.jpg',
    partition: 'originals',
    title: 'Centruroides infamatus (photo)',
    batch: 'durango-scorpions',
    tags: ['original', 'scorpion', 'photo'],
  },
  {
    src: 'references/durango-scorpions/Vaejovis_baggins_1.jpg',
    dest: 'originals/scorpions/Vaejovis_baggins_1.jpg',
    partition: 'originals',
    title: 'Vaejovis baggins (photo)',
    batch: 'durango-scorpions',
    tags: ['original', 'scorpion', 'photo'],
  },
  {
    src: 'references/durango-scorpions/Vaejovis_mcwesti_1.jpg',
    dest: 'originals/scorpions/Vaejovis_mcwesti_1.jpg',
    partition: 'originals',
    title: 'Vaejovis mcwesti (photo)',
    batch: 'durango-scorpions',
    tags: ['original', 'scorpion', 'photo'],
  },
  {
    src: 'references/durango-scorpions/Vaejovis_sierrae_1.jpg',
    dest: 'originals/scorpions/Vaejovis_sierrae_1.jpg',
    partition: 'originals',
    title: 'Vaejovis sierrae (photo)',
    batch: 'durango-scorpions',
    tags: ['original', 'scorpion', 'photo'],
  },

  // —— Tattoos: flash plates ——
  {
    src: 'generated/01-wave-dragon-irezumi.jpg',
    dest: 'tattoos/flash/01-wave-dragon-irezumi.jpg',
    partition: 'tattoos',
    title: 'Wave dragon irezumi flash',
    derivedFrom: 'orig-base-01-irezumi-color-dragon',
    batch: 'flash',
    tags: ['tattoo', 'flash', 'dragon', 'irezumi'],
    report: 'docs/generation-reports',
  },
  {
    src: 'generated/02-blackout-gold-wave.jpg',
    dest: 'tattoos/flash/02-blackout-gold-wave.jpg',
    partition: 'tattoos',
    title: 'Blackout gold wave flash',
    derivedFrom: 'orig-base-02-blackout-gold-dragon',
    batch: 'flash',
    tags: ['tattoo', 'flash', 'blackout'],
  },
  {
    src: 'generated/03-sleeve-tech-wave.jpg',
    dest: 'tattoos/flash/03-sleeve-tech-wave.jpg',
    partition: 'tattoos',
    title: 'Sleeve tech wave flash',
    derivedFrom: 'orig-base-01-irezumi-color-dragon',
    batch: 'flash',
    tags: ['tattoo', 'flash', 'sleeve'],
  },
  {
    src: 'generated/04-shoulder-emblem-flash.jpg',
    dest: 'tattoos/flash/04-shoulder-emblem-flash.jpg',
    partition: 'tattoos',
    title: 'Shoulder emblem flash',
    batch: 'flash',
    tags: ['tattoo', 'flash', 'emblem'],
  },
  {
    src: 'generated/05-dragon-wave-hybrid.jpg',
    dest: 'tattoos/flash/05-dragon-wave-hybrid.jpg',
    partition: 'tattoos',
    title: 'Dragon wave hybrid flash',
    derivedFrom: 'orig-base-01-irezumi-color-dragon',
    batch: 'flash',
    tags: ['tattoo', 'flash', 'dragon'],
  },
  {
    src: 'generated/06-chest-wave-sternum.jpg',
    dest: 'tattoos/flash/06-chest-wave-sternum.jpg',
    partition: 'tattoos',
    title: 'Chest wave sternum flash',
    batch: 'flash',
    tags: ['tattoo', 'flash', 'chest'],
  },
  {
    src: 'generated/07-rib-maroon-sakura.jpg',
    dest: 'tattoos/flash/07-rib-maroon-sakura.jpg',
    partition: 'tattoos',
    title: 'Rib maroon sakura flash',
    batch: 'flash',
    tags: ['tattoo', 'flash', 'rib'],
  },
  {
    src: 'generated/08-calf-fuji-wave.jpg',
    dest: 'tattoos/flash/08-calf-fuji-wave.jpg',
    partition: 'tattoos',
    title: 'Calf Fuji wave flash',
    batch: 'flash',
    tags: ['tattoo', 'flash', 'calf'],
  },
  {
    src: 'generated/09-forearm-firefly-wave.jpg',
    dest: 'tattoos/flash/09-forearm-firefly-wave.jpg',
    partition: 'tattoos',
    title: 'Forearm firefly wave flash',
    batch: 'flash',
    tags: ['tattoo', 'flash', 'forearm'],
  },

  // —— arm-leg ——
  {
    src: 'generated/arm-leg/01-forearm-compass-eye-blackwork.jpg',
    dest: 'tattoos/arm-leg/01-forearm-compass-eye-blackwork.jpg',
    partition: 'tattoos',
    title: 'Forearm compass + eye blackwork',
    derivedFrom: 'orig-esoteric-ref-minimal-compass-eye',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'forearm'],
  },
  {
    src: 'generated/arm-leg/02-calf-square-g-filigree.jpg',
    dest: 'tattoos/arm-leg/02-calf-square-g-filigree.jpg',
    partition: 'tattoos',
    title: 'Calf square-G filigree',
    derivedFrom: 'orig-esoteric-ref-lineart-square-g',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'calf'],
  },
  {
    src: 'generated/arm-leg/03-thigh-neotrad-roses-skulls.jpg',
    dest: 'tattoos/arm-leg/03-thigh-neotrad-roses-skulls.jpg',
    partition: 'tattoos',
    title: 'Thigh neo-trad roses + skulls',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'thigh'],
  },
  {
    src: 'generated/arm-leg/04-bicep-eye-providence-banner.jpg',
    dest: 'tattoos/arm-leg/04-bicep-eye-providence-banner.jpg',
    partition: 'tattoos',
    title: 'Bicep eye of providence banner',
    derivedFrom: 'orig-esoteric-ref-eye-starburst',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'bicep'],
  },
  {
    src: 'generated/arm-leg/05-shin-harmonic-spiral.jpg',
    dest: 'tattoos/arm-leg/05-shin-harmonic-spiral.jpg',
    partition: 'tattoos',
    title: 'Shin harmonic spiral',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'shin'],
  },
  {
    src: 'generated/arm-leg/07-elbow-solar-seal.jpg',
    dest: 'tattoos/arm-leg/07-elbow-solar-seal.jpg',
    partition: 'tattoos',
    title: 'Elbow solar seal',
    derivedFrom: 'orig-esoteric-ref-seals-grid',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'elbow'],
  },
  {
    src: 'generated/arm-leg/08-forearm-crystalline-knot.jpg',
    dest: 'tattoos/arm-leg/08-forearm-crystalline-knot.jpg',
    partition: 'tattoos',
    title: 'Forearm crystalline knot',
    derivedFrom: 'orig-esoteric-ref-crystalline-knot',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'forearm'],
  },
  {
    src: 'generated/arm-leg/09-calf-metallic-compass.jpg',
    dest: 'tattoos/arm-leg/09-calf-metallic-compass.jpg',
    partition: 'tattoos',
    title: 'Calf metallic compass',
    derivedFrom: 'orig-esoteric-ref-metallic-compass',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'calf'],
  },
  {
    src: 'generated/arm-leg/10-thigh-heraldic-wings.jpg',
    dest: 'tattoos/arm-leg/10-thigh-heraldic-wings.jpg',
    partition: 'tattoos',
    title: 'Thigh heraldic wings',
    derivedFrom: 'orig-esoteric-ref-heraldic-wings',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'thigh'],
  },
  {
    src: 'generated/arm-leg/11-innerarm-eye-starburst.jpg',
    dest: 'tattoos/arm-leg/11-innerarm-eye-starburst.jpg',
    partition: 'tattoos',
    title: 'Inner-arm eye starburst',
    derivedFrom: 'orig-esoteric-ref-eye-starburst',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'innerarm'],
  },
  {
    src: 'generated/arm-leg/12-upperarm-minimal-compass-eye.jpg',
    dest: 'tattoos/arm-leg/12-upperarm-minimal-compass-eye.jpg',
    partition: 'tattoos',
    title: 'Upper-arm minimal compass + eye',
    derivedFrom: 'orig-esoteric-ref-minimal-compass-eye',
    batch: 'arm-leg',
    tags: ['tattoo', 'arm-leg', 'upperarm'],
  },

  // —— arm-shoulder ——
  {
    src: 'generated/arm-shoulder/11-halfsleeve-navy-wave.jpg',
    dest: 'tattoos/arm-shoulder/11-halfsleeve-navy-wave.jpg',
    partition: 'tattoos',
    title: 'Half-sleeve navy wave',
    derivedFrom: 'tat-flash-03-sleeve-tech-wave',
    batch: 'arm-shoulder',
    tags: ['tattoo', 'arm-shoulder', 'halfsleeve'],
  },
  {
    src: 'generated/arm-shoulder/12-deltoid-circular-emblem.jpg',
    dest: 'tattoos/arm-shoulder/12-deltoid-circular-emblem.jpg',
    partition: 'tattoos',
    title: 'Deltoid circular emblem',
    derivedFrom: 'tat-flash-04-shoulder-emblem-flash',
    batch: 'arm-shoulder',
    tags: ['tattoo', 'arm-shoulder', 'deltoid'],
  },
  {
    src: 'generated/arm-shoulder/13-upperarm-blackout-gold.jpg',
    dest: 'tattoos/arm-shoulder/13-upperarm-blackout-gold.jpg',
    partition: 'tattoos',
    title: 'Upper-arm blackout gold',
    derivedFrom: 'orig-base-02-blackout-gold-dragon',
    batch: 'arm-shoulder',
    tags: ['tattoo', 'arm-shoulder', 'blackout'],
  },
  {
    src: 'generated/arm-shoulder/14-shoulder-cap-dragon.jpg',
    dest: 'tattoos/arm-shoulder/14-shoulder-cap-dragon.jpg',
    partition: 'tattoos',
    title: 'Shoulder-cap dragon',
    derivedFrom: 'orig-base-01-irezumi-color-dragon',
    batch: 'arm-shoulder',
    tags: ['tattoo', 'arm-shoulder', 'dragon'],
  },
  {
    src: 'generated/arm-shoulder/15-forearm-firefly-panel.jpg',
    dest: 'tattoos/arm-shoulder/15-forearm-firefly-panel.jpg',
    partition: 'tattoos',
    title: 'Forearm firefly panel',
    derivedFrom: 'tat-flash-09-forearm-firefly-wave',
    batch: 'arm-shoulder',
    tags: ['tattoo', 'arm-shoulder', 'forearm'],
  },

  // —— body-maps (subset) ——
  {
    src: 'generated/body-maps/06-right-chest-wave.jpg',
    dest: 'tattoos/body-maps/06-right-chest-wave.jpg',
    partition: 'tattoos',
    title: 'Body map — right chest wave',
    derivedFrom: 'orig-base-03-body-canvas-torso',
    batch: 'body-maps',
    tags: ['tattoo', 'body-map', 'chest'],
  },
  {
    src: 'generated/body-maps/07-abdomen-dragon-wave.jpg',
    dest: 'tattoos/body-maps/07-abdomen-dragon-wave.jpg',
    partition: 'tattoos',
    title: 'Body map — abdomen dragon wave',
    derivedFrom: 'orig-base-03-body-canvas-torso',
    batch: 'body-maps',
    tags: ['tattoo', 'body-map', 'abdomen'],
  },
  {
    src: 'generated/body-maps/08-right-shoulder-emblem.jpg',
    dest: 'tattoos/body-maps/08-right-shoulder-emblem.jpg',
    partition: 'tattoos',
    title: 'Body map — right shoulder emblem',
    derivedFrom: 'tat-flash-04-shoulder-emblem-flash',
    batch: 'body-maps',
    tags: ['tattoo', 'body-map', 'shoulder'],
  },
  {
    src: 'generated/body-maps/09-sternum-spiral-wave.jpg',
    dest: 'tattoos/body-maps/09-sternum-spiral-wave.jpg',
    partition: 'tattoos',
    title: 'Body map — sternum spiral wave',
    derivedFrom: 'orig-base-03-body-canvas-torso',
    batch: 'body-maps',
    tags: ['tattoo', 'body-map', 'sternum'],
  },
  {
    src: 'generated/body-maps/10-ribside-blackout.jpg',
    dest: 'tattoos/body-maps/10-ribside-blackout.jpg',
    partition: 'tattoos',
    title: 'Body map — ribside blackout',
    derivedFrom: 'orig-base-02-blackout-gold-dragon',
    batch: 'body-maps',
    tags: ['tattoo', 'body-map', 'rib'],
  },
  {
    src: 'generated/body-maps/14-night-forearm-blackwork.jpg',
    dest: 'tattoos/body-maps/14-night-forearm-blackwork.jpg',
    partition: 'tattoos',
    title: 'Body map — night forearm blackwork',
    derivedFrom: 'tat-arm-leg-01-forearm-compass-eye-blackwork',
    batch: 'body-maps',
    tags: ['tattoo', 'body-map', 'forearm'],
  },
  {
    src: 'generated/body-maps/arms/arm-01-halfsleeve-navy-wave.jpg',
    dest: 'tattoos/body-maps/arms/arm-01-halfsleeve-navy-wave.jpg',
    partition: 'tattoos',
    title: 'Body map arm — halfsleeve navy wave',
    derivedFrom: 'tat-arm-shoulder-11-halfsleeve-navy-wave',
    batch: 'body-maps-arms',
    tags: ['tattoo', 'body-map', 'arm'],
  },
  {
    src: 'generated/body-maps/arms/arm-05-upperarm-shoulder-dragon.jpg',
    dest: 'tattoos/body-maps/arms/arm-05-upperarm-shoulder-dragon.jpg',
    partition: 'tattoos',
    title: 'Body map arm — upperarm shoulder dragon',
    derivedFrom: 'tat-arm-shoulder-14-shoulder-cap-dragon',
    batch: 'body-maps-arms',
    tags: ['tattoo', 'body-map', 'arm'],
  },
  {
    src: 'generated/body-maps/legs/leg-01-calf-g-filigree.jpg',
    dest: 'tattoos/body-maps/legs/leg-01-calf-g-filigree.jpg',
    partition: 'tattoos',
    title: 'Body map leg — calf G filigree',
    derivedFrom: 'tat-arm-leg-02-calf-square-g-filigree',
    batch: 'body-maps-legs',
    tags: ['tattoo', 'body-map', 'leg'],
  },
  {
    src: 'generated/body-maps/legs/leg-04-calf-fuji-wave.jpg',
    dest: 'tattoos/body-maps/legs/leg-04-calf-fuji-wave.jpg',
    partition: 'tattoos',
    title: 'Body map leg — calf Fuji wave',
    derivedFrom: 'tat-flash-08-calf-fuji-wave',
    batch: 'body-maps-legs',
    tags: ['tattoo', 'body-map', 'leg'],
  },
  {
    src: 'generated/body-maps/legs/leg-05-thigh-heraldic-wings.jpg',
    dest: 'tattoos/body-maps/legs/leg-05-thigh-heraldic-wings.jpg',
    partition: 'tattoos',
    title: 'Body map leg — thigh heraldic wings',
    derivedFrom: 'tat-arm-leg-10-thigh-heraldic-wings',
    batch: 'body-maps-legs',
    tags: ['tattoo', 'body-map', 'leg'],
  },

  // —— scorpion tattoos (style sheet) ——
  {
    src: 'generated/scorpions-2026-10-15/scorp-edwardsii-diadelosmuertos.jpg',
    dest: 'tattoos/scorpions/scorp-edwardsii-diadelosmuertos.jpg',
    partition: 'tattoos',
    title: 'Scorpion edwardsii — Día de los Muertos',
    derivedFrom: 'orig-scorpions-centruroides-edwardsii-1',
    batch: 'scorpions-2026-10-15',
    tags: ['tattoo', 'scorpion', 'style'],
    report: 'tattoo/generated/scorpions-2026-10-15',
  },
  {
    src: 'generated/scorpions-2026-10-15/scorp-suffusus1-watercolor.jpg',
    dest: 'tattoos/scorpions/scorp-suffusus1-watercolor.jpg',
    partition: 'tattoos',
    title: 'Scorpion suffusus — watercolor',
    derivedFrom: 'orig-scorpions-centruroides-suffusus-1',
    batch: 'scorpions-2026-10-15',
    tags: ['tattoo', 'scorpion', 'style'],
  },
  {
    src: 'generated/scorpions-2026-10-15/scorp-vittatus1-trashpolka.jpg',
    dest: 'tattoos/scorpions/scorp-vittatus1-trashpolka.jpg',
    partition: 'tattoos',
    title: 'Scorpion vittatus — trash polka',
    derivedFrom: 'orig-scorpions-centruroides-vittatus-1',
    batch: 'scorpions-2026-10-15',
    tags: ['tattoo', 'scorpion', 'style'],
  },
  {
    src: 'generated/scorpions-2026-10-15/scorp-infamatus1-biomech.jpg',
    dest: 'tattoos/scorpions/scorp-infamatus1-biomech.jpg',
    partition: 'tattoos',
    title: 'Scorpion infamatus — biomech',
    derivedFrom: 'orig-scorpions-centruroides-infamatus-1',
    batch: 'scorpions-2026-10-15',
    tags: ['tattoo', 'scorpion', 'style'],
  },
  {
    src: 'generated/scorpions-2026-10-15/scorp-baggins-sacredgeo.jpg',
    dest: 'tattoos/scorpions/scorp-baggins-sacredgeo.jpg',
    partition: 'tattoos',
    title: 'Scorpion baggins — sacred geo',
    derivedFrom: 'orig-scorpions-vaejovis-baggins-1',
    batch: 'scorpions-2026-10-15',
    tags: ['tattoo', 'scorpion', 'style'],
  },
  {
    src: 'generated/scorpions-2026-10-15/scorp-mcwesti-neotrad.jpg',
    dest: 'tattoos/scorpions/scorp-mcwesti-neotrad.jpg',
    partition: 'tattoos',
    title: 'Scorpion mcwesti — neo-trad',
    derivedFrom: 'orig-scorpions-vaejovis-mcwesti-1',
    batch: 'scorpions-2026-10-15',
    tags: ['tattoo', 'scorpion', 'style'],
  },
  {
    src: 'generated/scorpions-2026-10-15/scorp-sierrae-blackwork.jpg',
    dest: 'tattoos/scorpions/scorp-sierrae-blackwork.jpg',
    partition: 'tattoos',
    title: 'Scorpion sierrae — blackwork',
    derivedFrom: 'orig-scorpions-vaejovis-sierrae-1',
    batch: 'scorpions-2026-10-15',
    tags: ['tattoo', 'scorpion', 'style'],
  },
];

function slugify(fileBase) {
  return fileBase
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function makeId(partition, destRel) {
  const base = slugify(basename(destRel));
  if (partition === 'originals') {
    if (destRel.includes('/base/')) return `orig-base-${base}`;
    if (destRel.includes('/esoteric/')) return `orig-esoteric-${base}`;
    if (destRel.includes('/scorpions/')) return `orig-scorpions-${base}`;
    return `orig-${base}`;
  }
  if (destRel.includes('/flash/')) return `tat-flash-${base}`;
  if (destRel.includes('/arm-leg/')) return `tat-arm-leg-${base}`;
  if (destRel.includes('/arm-shoulder/')) return `tat-arm-shoulder-${base}`;
  if (destRel.includes('/body-maps/')) return `tat-body-map-${base}`;
  if (destRel.includes('/scorpions/')) return `tat-scorp-${base}`;
  return `tat-${base}`;
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function main() {
  if (!existsSync(srcRoot)) {
    console.error(`Source root not found: ${srcRoot}`);
    console.error('Set MWTDAM_TATTOO_ROOT to the tattoo/ directory.');
    process.exit(1);
  }

  // Fresh media trees (keep brand/ elsewhere)
  for (const dir of [assetsMedia, webMedia]) {
    if (existsSync(dir)) {
      for (const sub of ['originals', 'tattoos', 'generated']) {
        const p = join(dir, sub);
        if (existsSync(p)) rmSync(p, { recursive: true, force: true });
      }
    }
    mkdirSync(dir, { recursive: true });
  }

  /** @type {ManifestAsset[]} */
  const assets = [];
  const skipped = [];
  let copied = 0;

  for (const item of PLAN) {
    const from = join(srcRoot, item.src);
    if (!existsSync(from)) {
      skipped.push({ src: item.src, reason: 'missing' });
      console.warn(`SKIP missing: ${item.src}`);
      continue;
    }

    const id = makeId(item.partition, item.dest);
    const assetDest = join(assetsMedia, item.dest);
    const webDest = join(webMedia, item.dest);
    ensureDir(assetDest);
    ensureDir(webDest);
    copyFileSync(from, assetDest);
    copyFileSync(from, webDest);
    copied += 1;

    const parentSourceId = item.derivedFrom ?? null;

    /** @type {ManifestAsset} */
    const record = {
      id,
      assetId: id,
      title: item.title ?? basename(item.dest),
      partition: item.partition,
      previewPath: item.dest,
      previewUrl: `/media/${item.dest}`,
      // Repo-relative — Electron seed resolves to absolute under assets/media
      localPath: `assets/media/${item.dest}`,
      // Per-asset Notion/Drive URLs are not in the MWTDAM tattoo plan yet
      cloudUrl: item.cloudUrl ?? null,
      sourcePath: item.src,
      parentSourceId,
      // Compat aliases — prefer parentSourceId when reading
      parentId: parentSourceId,
      derivedFrom: parentSourceId,
      batch: item.batch ?? null,
      report: item.report ?? null,
      tags: item.tags ?? [],
      description: item.description ?? null,
    };
    assets.push(record);
  }

  const counts = {
    originals: assets.filter((a) => a.partition === 'originals').length,
    tattoos: assets.filter((a) => a.partition === 'tattoos').length,
    generated: assets.filter((a) => a.partition === 'generated').length,
  };

  const withLineage = assets.filter((a) => a.parentSourceId).length;

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceRootHint:
      'MWTDAM/tattoo-designs/tattoo (override with MWTDAM_TATTOO_ROOT)',
    mediaRoot: 'assets/media',
    webPublicRoot: 'web/public/media',
    previewUrlScheme: {
      web: '/media/<previewPath>',
      electron: 'file://<repo>/assets/media/<previewPath>',
    },
    fileLinkSchema: {
      localPath:
        'Repo-relative assets/media/<previewPath> (Electron seed stores absolute). Use for Reveal in Finder / Open file / copy path.',
      cloudUrl:
        'Optional http(s) Notion / Drive / Supabase / CDN URL. Null when no known cloud link for the plate.',
      previewUrl: 'Display-only preview (web /media/… or Electron file://).',
    },
    lineageSchema: {
      parentSourceId:
        'assetId of the immediate parent in generation history; null for Source-of-Truth originals',
      siblings:
        'assets that share the same parentSourceId (same generation batch / alternate takes)',
      walkToSot: 'follow parentSourceId until null to reach the master original',
      aliases: ['parentId', 'derivedFrom'],
    },
    counts,
    lineageLinks: withLineage,
    skipped,
    assets,
  };

  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  for (const dir of [assetsMedia, webMedia]) {
    // Prefer lowercase; web fetch also tries MANIFEST.json (same path on
    // case-insensitive volumes such as default macOS APFS).
    writeFileSync(join(dir, 'manifest.json'), manifestJson);
  }

  console.log(
    `Curated ${copied} files → assets/media + web/public/media (originals=${counts.originals}, tattoos=${counts.tattoos}, lineage=${withLineage}, skipped=${skipped.length})`,
  );
}

main();
