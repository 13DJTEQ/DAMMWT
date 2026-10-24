import type {
  ApprovalHistoryRow,
  DatabaseManager,
  IngestAssetInput,
  QueueStats,
  ReviewQueueRow,
  ReviewStatus,
  SubmitApprovalInput,
} from '../database/DatabaseManager';
import {
  safeOpenExternal,
  safeOpenPath,
  safeRevealInFolder,
  type ShellActionResult,
  type ShellBridge,
} from './shellSafe';

/**
 * IPC channel names exposed to the renderer via preload.
 * Keep in sync with DamApi / createDamApi.
 */
export const IPC_CHANNELS = [
  'ingestAsset',
  'getReviewQueue',
  'submitApproval',
  'getQueueStats',
  'getAssetVersionHistory',
  'resubmitAsset',
  'healthCheck',
  'revealInFolder',
  'openLocalPath',
  'openCloudUrl',
  'refreshMedia',
] as const;

/** Push payload for main → renderer `media:updated` (not an invoke channel). */
export const MEDIA_UPDATED_CHANNEL = 'media:updated' as const;

export interface RefreshMediaResult {
  inserted: number;
  skipped: number;
  total: number;
}

export type IpcChannel = (typeof IPC_CHANNELS)[number];

export interface HealthCheckResult {
  ok: boolean;
  dbReady: boolean;
  stats: QueueStats;
}

/**
 * Minimal ipcMain surface so handlers can be registered in Electron
 * or exercised headlessly with a mock (verify-day2).
 */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown
  ): void;
}

/** Optional Electron shell + allowed media roots for file / cloud open actions. */
export interface ShellHandlerOptions {
  shell: ShellBridge;
  /** Absolute paths that localPath must resolve under. */
  allowedMediaRoots: readonly string[];
  /**
   * Optional: re-seed from assets/media/manifest.json (main-process only).
   * Used by Gallery Refresh / auto-ingest; better-sqlite3 stays off the renderer.
   */
  refreshMedia?: () => RefreshMediaResult | Promise<RefreshMediaResult>;
}

export interface DamApi {
  ingestAsset(input: IngestAssetInput): Promise<ReviewQueueRow>;
  getReviewQueue(status?: ReviewStatus): Promise<ReviewQueueRow[]>;
  submitApproval(input: SubmitApprovalInput): Promise<ReviewQueueRow>;
  getQueueStats(): Promise<QueueStats>;
  getAssetVersionHistory(assetId: string): Promise<ApprovalHistoryRow[]>;
  resubmitAsset(
    assetId: string,
    newSourceIdentifier: string,
    previewUrl: string
  ): Promise<ReviewQueueRow>;
  healthCheck(): Promise<HealthCheckResult>;
  /** Reveal local asset in Finder / Explorer (path must be under media roots). */
  revealInFolder(localPath: string): Promise<ShellActionResult>;
  /** Open local asset with the OS default app. */
  openLocalPath(localPath: string): Promise<ShellActionResult>;
  /** Open cloudUrl in the default browser (http/https only). */
  openCloudUrl(cloudUrl: string): Promise<ShellActionResult>;
  /** Re-ingest new manifest rows into SQLite (idempotent). */
  refreshMedia(): Promise<RefreshMediaResult>;
}

export type InvokeFn = (channel: string, ...args: unknown[]) => Promise<unknown>;

const SHELL_UNAVAILABLE: ShellActionResult = {
  ok: false,
  error: 'Shell actions are not available in this context',
};

/**
 * Typed renderer-side contract shared by preload and tests.
 */
export function createDamApi(invoke: InvokeFn): DamApi {
  return {
    ingestAsset: (input) =>
      invoke('ingestAsset', input) as Promise<ReviewQueueRow>,
    getReviewQueue: (status?) =>
      invoke('getReviewQueue', status) as Promise<ReviewQueueRow[]>,
    submitApproval: (input) =>
      invoke('submitApproval', input) as Promise<ReviewQueueRow>,
    getQueueStats: () => invoke('getQueueStats') as Promise<QueueStats>,
    getAssetVersionHistory: (assetId) =>
      invoke('getAssetVersionHistory', assetId) as Promise<ApprovalHistoryRow[]>,
    resubmitAsset: (assetId, newSourceIdentifier, previewUrl) =>
      invoke('resubmitAsset', assetId, newSourceIdentifier, previewUrl) as Promise<ReviewQueueRow>,
    healthCheck: () => invoke('healthCheck') as Promise<HealthCheckResult>,
    revealInFolder: (localPath) =>
      invoke('revealInFolder', localPath) as Promise<ShellActionResult>,
    openLocalPath: (localPath) =>
      invoke('openLocalPath', localPath) as Promise<ShellActionResult>,
    openCloudUrl: (cloudUrl) =>
      invoke('openCloudUrl', cloudUrl) as Promise<ShellActionResult>,
    refreshMedia: () => invoke('refreshMedia') as Promise<RefreshMediaResult>,
  };
}

/**
 * Register all DAM IPC invoke handlers against an ipcMain-like object.
 * @returns the channel list that was registered
 */
export function registerIpcHandlers(
  ipcMain: IpcMainLike,
  db: DatabaseManager,
  shellOptions?: ShellHandlerOptions
): readonly IpcChannel[] {
  ipcMain.handle('ingestAsset', (_event, input) => {
    return db.ingestAsset(input as IngestAssetInput);
  });

  ipcMain.handle('getReviewQueue', (_event, status) => {
    return db.getReviewQueue(status as ReviewStatus | undefined);
  });

  ipcMain.handle('submitApproval', (_event, input) => {
    return db.submitApproval(input as SubmitApprovalInput);
  });

  ipcMain.handle('getQueueStats', () => {
    return db.getQueueStats();
  });

  ipcMain.handle('getAssetVersionHistory', (_event, assetId) => {
    return db.getAssetVersionHistory(assetId as string);
  });

  ipcMain.handle('resubmitAsset', (_event, assetId, newSourceIdentifier, previewUrl) => {
    return db.resubmitAsset(
      assetId as string,
      newSourceIdentifier as string,
      previewUrl as string
    );
  });

  ipcMain.handle('healthCheck', () => {
    const stats = db.getQueueStats();
    const result: HealthCheckResult = {
      ok: true,
      dbReady: true,
      stats,
    };
    return result;
  });

  ipcMain.handle('revealInFolder', (_event, localPath) => {
    if (!shellOptions) {
      return SHELL_UNAVAILABLE;
    }
    return safeRevealInFolder(
      shellOptions.shell,
      localPath as string,
      shellOptions.allowedMediaRoots
    );
  });

  ipcMain.handle('openLocalPath', (_event, localPath) => {
    if (!shellOptions) {
      return SHELL_UNAVAILABLE;
    }
    return safeOpenPath(
      shellOptions.shell,
      localPath as string,
      shellOptions.allowedMediaRoots
    );
  });

  ipcMain.handle('openCloudUrl', (_event, cloudUrl) => {
    if (!shellOptions) {
      return SHELL_UNAVAILABLE;
    }
    return safeOpenExternal(shellOptions.shell, cloudUrl as string);
  });

  ipcMain.handle('refreshMedia', async () => {
    if (!shellOptions?.refreshMedia) {
      const empty: RefreshMediaResult = {
        inserted: 0,
        skipped: 0,
        total: 0,
      };
      return empty;
    }
    return shellOptions.refreshMedia();
  });

  return IPC_CHANNELS;
}
