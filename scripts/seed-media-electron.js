/**
 * Electron-hosted seed entry (uses Electron's Node ABI for better-sqlite3).
 * Invoked by: npm run seed:media
 */
const { app } = require('electron');
const { existsSync, mkdirSync } = require('fs');
const { dirname, join } = require('path');

const root = join(__dirname, '..');
const { DatabaseManager } = require(join(root, 'dist', 'database', 'DatabaseManager'));
const {
  seedMediaFromManifest,
  resolveMediaRoot,
} = require(join(root, 'dist', 'media', 'seedMedia'));

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

    const dbPath =
      process.env.DAM_DB_PATH || join(app.getPath('userData'), 'dam.db');
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
