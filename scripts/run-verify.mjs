#!/usr/bin/env node
/**
 * Run verify scripts under Electron's Node ABI via ELECTRON_RUN_AS_NODE.
 * Host Node 26+ cannot load better-sqlite3 built for Electron (and often
 * cannot compile better-sqlite3@11 against Node 26 V8).
 */
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCRIPTS = {
  day1: { file: 'scripts/verify-day1.ts' },
  day2: { file: 'scripts/verify-day2.ts' },
  day5: { file: 'scripts/verify-day5.ts' },
  day6: { file: 'scripts/verify-day6.ts' },
  day34: { file: 'scripts/verify-day34.ts', project: 'tsconfig.verify.json' },
  gallery: { file: 'scripts/verify-gallery.ts', project: 'tsconfig.verify.json' },
  api: { file: 'scripts/verify-dam-api.ts', project: 'tsconfig.verify.json' },
};

const key = process.argv[2];
const spec = SCRIPTS[key];
if (!spec) {
  console.error(`Usage: node scripts/run-verify.mjs <${Object.keys(SCRIPTS).join('|')}>`);
  process.exit(1);
}

const electron = require('electron');
const tsNode = join(root, 'node_modules', 'ts-node', 'dist', 'bin.js');
const args = ['--transpile-only'];
if (spec.project) {
  args.push('--project', spec.project);
}
args.push(join(root, spec.file));

const result = spawnSync(electron, [tsNode, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
});

process.exit(result.status ?? 1);
