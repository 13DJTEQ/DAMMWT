/**
 * Electron-hosted seed entry (uses Electron's Node ABI for better-sqlite3).
 * Invoked by: npm run seed:media
 *
 * Must target the same userData DB as `electron .` / main.ts. Running
 * `electron scripts/seed-media-electron.js` otherwise defaults userData to
 * "Electron" and seeds a different dam.db than the Gallery app.
 */
const { app } = require('electron');
const { existsSync, mkdirSync, readFileSync } = require('fs');
const { homedir } = require('os');
const { dirname, join } = require('path');

const root = join(__dirname, '..');
const { DatabaseManager } = require(join(root, 'dist', 'database', 'DatabaseManager'));
const {
  seedMediaFromManifest,
  resolveMediaRoot,
} = require(join(root, 'dist', 'media', 'seedMedia'));

function defaultDamDbPath() {
  if (process.env.DAM_DB_PATH) {
    return process.env.DAM_DB_PATH;
  }
  let pkgName = '@13djteq/mwt-dam-mvp';
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (pkg && typeof pkg.name === 'string' && pkg.name.trim()) {
      pkgName = pkg.name.trim();
    }
  } catch {
    /* keep fallback */
  }
  const appData =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : process.env.APPDATA ||
        join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'));
  return join(appData, pkgName, 'dam.db');
}

// Align paths before ready so getPath('userData') matches `electron .`
try {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (pkg?.name) {
    app.setPath(
      'userData',
      join(
        process.platform === 'darwin'
          ? join(homedir(), 'Library', 'Application Support')
          : process.env.APPDATA ||
              join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config')),
        pkg.name
      )
    );
  }
} catch {
  /* optional */
}

app.whenReady().then(() => {
  try {
    const mediaRoot = resolveMediaRoot(root);
    if (!mediaRoot) {
      console.error(
        'assets/media/manifest.json not found.\n' +
          '  Curate first: npm run curate:media'
      );
      app.exit(1);
      return;
    }

    const dbPath = defaultDamDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });

    const db = new DatabaseManager(dbPath);
    try {
      const result = seedMediaFromManifest(db, { mediaRoot });
      console.log('Media seed complete');
      console.log(`  db:         ${dbPath}`);
      console.log(`  mediaRoot:  ${result.mediaRoot}`);
      console.log(`  inserted:   ${result.inserted}`);
      console.log(`  skipped:    ${result.skipped}`);
      console.log(`  manifest:   ${result.total} assets`);
      if (result.missingFiles.length) {
        console.warn(
          `  missing files (${result.missingFiles.length}):`,
          result.missingFiles.slice(0, 5).join(', '),
          result.missingFiles.length > 5 ? '…' : ''
        );
      }
      if (result.inserted === 0 && result.total === 0) {
        console.warn('  No assets processed — check manifest.');
        app.exit(1);
        return;
      }
      app.exit(0);
    } finally {
      db.close();
    }
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
