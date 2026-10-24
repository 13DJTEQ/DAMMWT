import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { existsSync, watch, type FSWatcher } from 'fs';
import { basename, join } from 'path';
import { DatabaseManager } from './database/DatabaseManager';
import {
  MEDIA_UPDATED_CHANNEL,
  registerIpcHandlers,
} from './ipc/handlers';
import {
  resolveMediaRoot,
  seedMediaFromManifest,
  type SeedMediaResult,
} from './media/seedMedia';

/**
 * Electron main process.
 * Boots SQLite under userData, registers IPC, then loads the Gallery UI.
 * No HTTP server — renderer talks only through preload → ipcMain.
 *
 * On first launch (empty ReviewQueue), seeds tattoo-design media from
 * assets/media/manifest.json with file:// preview URLs (allowed by CSP).
 *
 * Watches the media manifest so push:media / curate can ingest without relaunch;
 * notifies renderers via `media:updated`.
 */

const WATCH_DEBOUNCE_MS = 400;

let db: DatabaseManager | null = null;
let mediaWatcher: FSWatcher | null = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;
/** Serialize seed runs so watch + Refresh never overlap. */
let seedChain: Promise<SeedMediaResult | null> = Promise.resolve(null);

/** Media trees the renderer may Reveal / Open via shell IPC. */
function allowedMediaRoots(): string[] {
  const roots: string[] = [];
  const curated = resolveMediaRoot();
  if (curated) {
    roots.push(curated);
  }
  const webPublic = join(process.cwd(), 'web', 'public', 'media');
  if (existsSync(webPublic)) {
    roots.push(webPublic);
  }
  // Packaged / sibling assets next to dist/
  const distSibling = join(__dirname, '..', 'assets', 'media');
  if (existsSync(distSibling) && !roots.includes(distSibling)) {
    roots.push(distSibling);
  }
  return roots;
}

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

function broadcastMediaUpdated(payload: {
  inserted: number;
  skipped: number;
  total: number;
  source: 'watch' | 'refresh';
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(MEDIA_UPDATED_CHANNEL, payload);
    }
  }
}

/**
 * Idempotent ingest from manifest. Serialized via seedChain so rapid
 * fs.watch events and overlapping Refresh never run concurrent seeds.
 */
function reseedFromManifest(
  source: 'watch' | 'refresh'
): Promise<SeedMediaResult | null> {
  seedChain = seedChain
    .catch(() => null)
    .then(() => {
      if (!db) {
        return null;
      }
      try {
        const result = seedMediaFromManifest(db);
        if (result.inserted > 0) {
          console.log(
            `[media] ${source}: ingested ${result.inserted} new asset(s) (${result.total} in manifest)`
          );
        }
        broadcastMediaUpdated({
          inserted: result.inserted,
          skipped: result.skipped,
          total: result.total,
          source,
        });
        return result;
      } catch (err) {
        console.warn(
          `[media] ${source} seed failed:`,
          err instanceof Error ? err.message : err
        );
        return null;
      }
    });
  return seedChain;
}

function scheduleWatchReseed(): void {
  if (watchDebounce) {
    clearTimeout(watchDebounce);
  }
  watchDebounce = setTimeout(() => {
    watchDebounce = null;
    void reseedFromManifest('watch');
  }, WATCH_DEBOUNCE_MS);
}

function startMediaManifestWatcher(): void {
  const mediaRoot = resolveMediaRoot();
  if (!mediaRoot) {
    console.warn('[media] No assets/media root — skipping manifest watch');
    return;
  }

  const manifestPath = join(mediaRoot, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.warn('[media] manifest.json missing — skipping watch');
    return;
  }

  // Watch the media directory so atomic replace of manifest.json is reliable.
  try {
    mediaWatcher = watch(mediaRoot, (_eventType, filename) => {
      const name = filename == null ? '' : String(filename);
      const base = name ? basename(name) : '';
      // Empty filename can happen on some platforms — debounce-reseed to be safe.
      if (!base || /manifest\.json$/i.test(base)) {
        scheduleWatchReseed();
      }
    });
    mediaWatcher.on('error', (err) => {
      console.warn('[media] Watch error:', err.message);
    });
    console.log(`[media] Watching ${manifestPath} for auto-ingest`);
  } catch (err) {
    console.warn(
      '[media] Could not watch manifest:',
      err instanceof Error ? err.message : err
    );
  }
}

function stopMediaManifestWatcher(): void {
  if (watchDebounce) {
    clearTimeout(watchDebounce);
    watchDebounce = null;
  }
  if (mediaWatcher) {
    mediaWatcher.close();
    mediaWatcher = null;
  }
}

async function bootstrap(): Promise<void> {
  const dbPath =
    process.env.DAM_DB_PATH ?? join(app.getPath('userData'), 'dam.db');
  db = new DatabaseManager(dbPath);
  maybeSeedMedia(db);
  registerIpcHandlers(ipcMain, db, {
    shell: {
      showItemInFolder: (fullPath) => shell.showItemInFolder(fullPath),
      openPath: (fullPath) => shell.openPath(fullPath),
      openExternal: (url) => shell.openExternal(url),
    },
    allowedMediaRoots: allowedMediaRoots(),
    refreshMedia: async () => {
      const result = await reseedFromManifest('refresh');
      return {
        inserted: result?.inserted ?? 0,
        skipped: result?.skipped ?? 0,
        total: result?.total ?? 0,
      };
    },
  });
  startMediaManifestWatcher();
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
  stopMediaManifestWatcher();
  db?.close();
  db = null;
});
