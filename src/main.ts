import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { DatabaseManager } from './database/DatabaseManager';
import { registerIpcHandlers } from './ipc/handlers';
import { seedMediaFromManifest } from './media/seedMedia';

/**
 * Electron main process.
 * Boots SQLite under userData, registers IPC, then loads the Gallery UI.
 * No HTTP server — renderer talks only through preload → ipcMain.
 *
 * On first launch (empty ReviewQueue), seeds tattoo-design media from
 * assets/media/manifest.json with file:// preview URLs (allowed by CSP).
 */

let db: DatabaseManager | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Days 3–4 + V-0.5 renderer: built to dist/renderer/ by scripts/build-renderer.js
  const rendererHtml = join(__dirname, 'renderer', 'index.html');
  void win.loadFile(rendererHtml);
  return win;
}

function maybeSeedMedia(database: DatabaseManager): void {
  if (!database.isEmpty()) {
    return;
  }
  try {
    const result = seedMediaFromManifest(database, { forceEmptyOnly: true });
    if (result.inserted > 0) {
      console.log(
        `[media] First-launch seed: ${result.inserted} assets from ${result.mediaRoot}`
      );
    } else if (result.missingFiles.length) {
      console.warn(
        `[media] Seed skipped missing files: ${result.missingFiles.length}`
      );
    }
  } catch (err) {
    console.warn(
      '[media] First-launch seed skipped:',
      err instanceof Error ? err.message : err
    );
  }
}

async function bootstrap(): Promise<void> {
  const dbPath =
    process.env.DAM_DB_PATH ?? join(app.getPath('userData'), 'dam.db');
  db = new DatabaseManager(dbPath);
  maybeSeedMedia(db);
  registerIpcHandlers(ipcMain, db);
  createWindow();
}

app.whenReady().then(() => {
  void bootstrap().catch((err: unknown) => {
    console.error('Failed to start DAM main process', err);
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  db?.close();
  db = null;
});
