#!/usr/bin/env node
/**
 * Seed Electron ReviewQueue from assets/media/manifest.json.
 *
 * Runs under Electron so better-sqlite3 matches the Electron ABI
 * (plain Node 22+ often fails to compile/load the native addon).
 *
 * Usage:
 *   npm run seed:media
 *   DAM_DB_PATH=/tmp/dam.db npm run seed:media
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const entry = join(__dirname, 'seed-media-electron.js');
const distDb = join(root, 'dist', 'database', 'DatabaseManager.js');
const distSeed = join(root, 'dist', 'media', 'seedMedia.js');

if (!existsSync(distDb) || !existsSync(distSeed)) {
  console.error('dist/ missing seed modules. Run `npm run build` first.');
  process.exit(1);
}

const electron =
  process.env.ELECTRON_PATH ||
  require('electron'); /* path string when required from Node */

if (typeof electron !== 'string') {
  console.error('Could not resolve electron binary path.');
  process.exit(1);
}

const result = spawnSync(electron, [entry], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
