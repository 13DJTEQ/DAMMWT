import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { DatabaseManager } from './database/DatabaseManager';
import { registerIpcHandlers } from './ipc/handlers';

/**
 * Electron main process (Day 2).
 * Boots SQLite under userData, registers IPC, then opens a window.
 * No HTTP server — renderer talks only through preload → ipcMain.
 */

let db: DatabaseManager | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Day 2: IPC shell only — React UI arrives Days 3–4.
  void win.loadURL('about:blank');
  return win;
}

async function bootstrap(): Promise<void> {
  const dbPath = join(app.getPath('userData'), 'dam.db');
  db = new DatabaseManager(dbPath);
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
