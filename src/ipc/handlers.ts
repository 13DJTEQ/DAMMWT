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
  DamService,
  type RefreshMediaResult,
  type DamHealthResult,
} from '../api/DamService';
import {
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
  'getMediaProjects',
] as const;

/** Push payload for main → renderer `media:updated` (not an invoke channel). */
export const MEDIA_UPDATED_CHANNEL = 'media:updated' as const;

export type { RefreshMediaResult };

export type IpcChannel = (typeof IPC_CHANNELS)[number];

/** IPC health shape — extends DamService health (apiVersion / electronPid). */
export type HealthCheckResult = DamHealthResult;

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
  /**
   * Optional: project section slugs from manifest.projects[] (incl. empty).
   */
  getMediaProjects?: () => string[] | Promise<string[]>;
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
  /** Registered project section slugs (manifest.projects[] + may be empty). */
  getMediaProjects(): Promise<string[]>;
}

export type InvokeFn = (channel: string, ...args: unknown[]) => Promise<unknown>;

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
    getMediaProjects: () => invoke('getMediaProjects') as Promise<string[]>,
  };
}

/**
 * Build a DamService from DB + optional shell options (IPC / verify harness).
 */
export function createDamService(
  db: DatabaseManager,
  shellOptions?: ShellHandlerOptions
): DamService {
  return new DamService({
    db,
    shell: shellOptions?.shell,
    allowedMediaRoots: shellOptions?.allowedMediaRoots,
    refreshMedia: shellOptions?.refreshMedia,
    getMediaProjects: shellOptions?.getMediaProjects,
  });
}

/**
 * Register all DAM IPC invoke handlers against an ipcMain-like object.
 * Prefer passing a DamService so IPC and HTTP share one façade.
 * @returns the channel list that was registered
 */
export function registerIpcHandlers(
  ipcMain: IpcMainLike,
  dbOrService: DatabaseManager | DamService,
  shellOptions?: ShellHandlerOptions
): readonly IpcChannel[] {
  const service =
    dbOrService instanceof DamService
      ? dbOrService
      : createDamService(dbOrService, shellOptions);

  ipcMain.handle('ingestAsset', (_event, input) => {
    return service.ingestAsset(input as IngestAssetInput);
  });

  ipcMain.handle('getReviewQueue', (_event, status) => {
    return service.getReviewQueue(status as ReviewStatus | undefined);
  });

  ipcMain.handle('submitApproval', (_event, input) => {
    return service.submitApproval(input as SubmitApprovalInput);
  });

  ipcMain.handle('getQueueStats', () => {
    return service.getQueueStats();
  });

  ipcMain.handle('getAssetVersionHistory', (_event, assetId) => {
    return service.getAssetVersionHistory(assetId as string);
  });

  ipcMain.handle('resubmitAsset', (_event, assetId, newSourceIdentifier, previewUrl) => {
    return service.resubmitAsset(
      assetId as string,
      newSourceIdentifier as string,
      previewUrl as string
    );
  });

  ipcMain.handle('healthCheck', () => {
    return service.healthCheck();
  });

  ipcMain.handle('revealInFolder', (_event, localPath) => {
    return service.revealInFolder(localPath as string);
  });

  ipcMain.handle('openLocalPath', (_event, localPath) => {
    return service.openLocalPath(localPath as string);
  });

  ipcMain.handle('openCloudUrl', (_event, cloudUrl) => {
    return service.openCloudUrl(cloudUrl as string);
  });

  ipcMain.handle('refreshMedia', async () => {
    return service.refreshMedia();
  });

  ipcMain.handle('getMediaProjects', async () => {
    return service.getMediaProjects();
  });

  return IPC_CHANNELS;
}
