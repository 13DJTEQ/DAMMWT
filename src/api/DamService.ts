/**
 * Shared façade over DatabaseManager + shell/seed helpers.
 * Used by IPC handlers and the localhost HTTP API so approvals / queue /
 * lineage stay on one code path. MCP/CLI wrappers should call through HTTP
 * or import these exports — do not duplicate business logic.
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
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
} from '../ipc/shellSafe';
import {
  listMediaProjectSlugs,
  resolveMediaRoot,
} from '../media/seedMedia';

export const DAM_API_VERSION = '1';

/** Main → renderer push when queue visibility may have changed. */
export const QUEUE_UPDATED_CHANNEL = 'queue:updated' as const;

/** Result of idempotent manifest → SQLite seed (Refresh / watch / HTTP). */
export interface RefreshMediaResult {
  inserted: number;
  skipped: number;
  total: number;
}

export type DamMutationKind =
  | 'approval'
  | 'ingest'
  | 'resubmit'
  | 'refresh'
  | 'project'
  | 'push'
  | 'shell';

export interface DamMutationEvent {
  kind: DamMutationKind;
  assetId?: string;
  project?: string;
  inserted?: number;
  skipped?: number;
  total?: number;
}

export interface DamHealthResult {
  ok: boolean;
  dbReady: boolean;
  stats: QueueStats;
  apiVersion: string;
  electronPid: number;
}

export interface DamLineageResult {
  asset: ReviewQueueRow;
  chain: ReviewQueueRow[];
  siblings: ReviewQueueRow[];
}

export interface CreateProjectResult {
  ok: boolean;
  slug: string;
  created: boolean;
  path: string;
  error?: string;
}

export interface PushAssetInput {
  /** Absolute (or cwd-relative) file to stage via push:media. */
  sourcePath?: string;
  partition?: IngestAssetInput['partition'] | string;
  project?: string;
  pipeline?: string;
  parentSourceId?: string | null;
  batch?: string;
  tags?: string[];
  title?: string | null;
  cloudUrl?: string | null;
  assetId?: string | null;
  /** DB-only ingest when bytes are already under an allowed media root. */
  ingest?: IngestAssetInput;
}

export interface DamServiceOptions {
  db: DatabaseManager;
  shell?: ShellBridge;
  allowedMediaRoots?: readonly string[];
  /**
   * Re-seed from manifest (watch / Refresh). Prefer main's serialized
   * reseedFromManifest so HTTP and IPC share one seed chain.
   */
  refreshMedia?: () => RefreshMediaResult | Promise<RefreshMediaResult>;
  getMediaProjects?: () => string[] | Promise<string[]>;
  /** Fired after mutating operations so main can broadcast media:updated. */
  onMutation?: (event: DamMutationEvent) => void;
  /** Repo root for spawning push:media (default: process.cwd()). */
  repoRoot?: string;
}

const SHELL_UNAVAILABLE: ShellActionResult = {
  ok: false,
  error: 'Shell actions are not available in this context',
};

const EMPTY_REFRESH: RefreshMediaResult = {
  inserted: 0,
  skipped: 0,
  total: 0,
};

/**
 * Thin service layer shared by IPC and HTTP.
 */
export class DamService {
  readonly db: DatabaseManager;
  private readonly shell?: ShellBridge;
  private readonly allowedMediaRoots: readonly string[];
  private readonly refreshMediaFn?: () =>
    | RefreshMediaResult
    | Promise<RefreshMediaResult>;
  private readonly getMediaProjectsFn?: () => string[] | Promise<string[]>;
  private readonly onMutation?: (event: DamMutationEvent) => void;
  private readonly repoRoot: string;

  constructor(options: DamServiceOptions) {
    this.db = options.db;
    this.shell = options.shell;
    this.allowedMediaRoots = options.allowedMediaRoots ?? [];
    this.refreshMediaFn = options.refreshMedia;
    this.getMediaProjectsFn = options.getMediaProjects;
    this.onMutation = options.onMutation;
    this.repoRoot = options.repoRoot ?? process.cwd();
  }

  healthCheck(): DamHealthResult {
    return {
      ok: true,
      dbReady: true,
      stats: this.db.getQueueStats(),
      apiVersion: DAM_API_VERSION,
      electronPid: process.pid,
    };
  }

  ingestAsset(input: IngestAssetInput): ReviewQueueRow {
    const row = this.db.ingestAsset(input);
    this.emit({ kind: 'ingest', assetId: row.assetId, inserted: 1 });
    return row;
  }

  ingestAssetIfAbsent(
    input: IngestAssetInput
  ): { row: ReviewQueueRow; inserted: boolean } {
    const result = this.db.ingestAssetIfAbsent(input);
    if (result.inserted) {
      this.emit({ kind: 'ingest', assetId: result.row.assetId, inserted: 1 });
    }
    return result;
  }

  getReviewQueue(
    status?: ReviewStatus,
    project?: string
  ): ReviewQueueRow[] {
    const rows = this.db.getReviewQueue(status);
    if (!project || !project.trim()) {
      return rows;
    }
    const slug = project.trim();
    return rows.filter((row) => rowMatchesProject(row, slug));
  }

  submitApproval(input: SubmitApprovalInput): ReviewQueueRow {
    const row = this.db.submitApproval(input);
    this.emit({ kind: 'approval', assetId: row.assetId });
    return row;
  }

  getQueueStats(): QueueStats {
    return this.db.getQueueStats();
  }

  getAssetVersionHistory(assetId: string): ApprovalHistoryRow[] {
    return this.db.getAssetVersionHistory(assetId);
  }

  getByAssetId(assetId: string): ReviewQueueRow | undefined {
    return this.db.getByAssetId(assetId);
  }

  resubmitAsset(
    assetId: string,
    newSourceIdentifier: string,
    previewUrl: string
  ): ReviewQueueRow {
    const row = this.db.resubmitAsset(
      assetId,
      newSourceIdentifier,
      previewUrl
    );
    this.emit({ kind: 'resubmit', assetId: row.assetId });
    return row;
  }

  getLineage(assetId: string): DamLineageResult | null {
    return this.db.getLineage(assetId);
  }

  async revealInFolder(localPath: string): Promise<ShellActionResult> {
    if (!this.shell) {
      return SHELL_UNAVAILABLE;
    }
    return safeRevealInFolder(
      this.shell,
      localPath,
      this.allowedMediaRoots
    );
  }

  async openLocalPath(localPath: string): Promise<ShellActionResult> {
    if (!this.shell) {
      return SHELL_UNAVAILABLE;
    }
    return safeOpenPath(this.shell, localPath, this.allowedMediaRoots);
  }

  async openCloudUrl(cloudUrl: string): Promise<ShellActionResult> {
    if (!this.shell) {
      return SHELL_UNAVAILABLE;
    }
    return safeOpenExternal(this.shell, cloudUrl);
  }

  async refreshMedia(): Promise<RefreshMediaResult> {
    if (!this.refreshMediaFn) {
      return EMPTY_REFRESH;
    }
    const result = await this.refreshMediaFn();
    this.emit({
      kind: 'refresh',
      inserted: result.inserted,
      skipped: result.skipped,
      total: result.total,
    });
    return result;
  }

  async getMediaProjects(): Promise<string[]> {
    if (this.getMediaProjectsFn) {
      return this.getMediaProjectsFn();
    }
    return listMediaProjectSlugs(resolveMediaRoot(this.repoRoot));
  }

  /**
   * Ensure project section dirs + manifest.projects via push:media CLI.
   */
  async createProject(slugRaw: string): Promise<CreateProjectResult> {
    const slug = normalizeProjectSlug(slugRaw);
    const before = new Set(await this.getMediaProjects());
    const cli = this.runPushMedia([
      '--create-section',
      '--project',
      slug,
    ]);
    if (cli.status !== 0) {
      return {
        ok: false,
        slug,
        created: false,
        path: `projects/${slug}`,
        error: cli.error || `push:media exited ${cli.status}`,
      };
    }
    await this.refreshMedia();
    // CLI may register the slug even when listing lags; treat "new to us" as created.
    const created = !before.has(slug);
    this.emit({ kind: 'project', project: slug });
    return {
      ok: true,
      slug,
      created,
      path: `projects/${slug}`,
    };
  }

  /**
   * Stage via push:media when sourcePath is set, or DB-ingest when `ingest`
   * / IngestAssetInput fields are provided for an already-staged file.
   */
  async pushAsset(input: PushAssetInput): Promise<ReviewQueueRow> {
    if (input.ingest) {
      const { row, inserted } = this.ingestAssetIfAbsent(input.ingest);
      if (!inserted) {
        this.emit({ kind: 'push', assetId: row.assetId, inserted: 0 });
      }
      return row;
    }

    if (input.sourcePath) {
      const partition = String(input.partition ?? '').trim();
      if (!partition) {
        throw new Error('partition is required when sourcePath is set');
      }
      const args = [
        '--file',
        input.sourcePath,
        '--partition',
        partition,
      ];
      if (input.project) {
        args.push('--project', input.project);
      }
      if (input.pipeline) {
        args.push('--pipeline', input.pipeline);
      }
      if (input.parentSourceId) {
        args.push('--parent', input.parentSourceId);
      }
      if (input.batch) {
        args.push('--batch', input.batch);
      }
      if (input.tags?.length) {
        args.push('--tags', input.tags.join(','));
      }
      if (input.title) {
        args.push('--title', input.title);
      }
      if (input.cloudUrl) {
        args.push('--cloud-url', input.cloudUrl);
      }
      if (input.assetId) {
        args.push('--asset-id', input.assetId);
      }

      const cli = this.runPushMedia(args);
      if (cli.status !== 0) {
        throw new Error(cli.error || `push:media exited ${cli.status}`);
      }

      const refresh = await this.refreshMedia();
      const assetId =
        input.assetId?.trim() ||
        findLikelyAssetId(this.db, input) ||
        null;
      if (assetId) {
        const row = this.db.getByAssetId(assetId);
        if (row) {
          this.emit({
            kind: 'push',
            assetId: row.assetId,
            inserted: refresh.inserted,
            project: input.project,
          });
          return row;
        }
      }

      // Fall back: newest pending row matching project/partition
      const pending = this.getReviewQueue('pending', input.project);
      const match = pending.find((r) =>
        input.partition ? r.partition === input.partition : true
      );
      if (match) {
        this.emit({
          kind: 'push',
          assetId: match.assetId,
          inserted: refresh.inserted,
          project: input.project,
        });
        return match;
      }
      throw new Error(
        'push:media succeeded but asset was not found in the review queue'
      );
    }

    // Alternate: treat body as IngestAssetInput fields
    if (input.assetId && looksLikeIngest(input)) {
      const ingestInput = toIngestInput(input);
      return this.ingestAsset(ingestInput);
    }

    throw new Error(
      'Provide sourcePath (stage via CLI) or ingest / IngestAssetInput fields'
    );
  }

  private emit(event: DamMutationEvent): void {
    this.onMutation?.(event);
  }

  private runPushMedia(extraArgs: string[]): {
    status: number;
    error?: string;
  } {
    const script = join(this.repoRoot, 'scripts', 'push-media.mjs');
    if (!existsSync(script)) {
      return { status: 1, error: `push-media.mjs not found at ${script}` };
    }
    const result = spawnSync(process.execPath, [script, ...extraArgs], {
      cwd: this.repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        DAMMWT_ROOT: this.repoRoot,
      },
    });
    if (result.status !== 0) {
      const stderr = (result.stderr || '').trim();
      const stdout = (result.stdout || '').trim();
      return {
        status: result.status ?? 1,
        error: stderr || stdout || result.error?.message || 'push:media failed',
      };
    }
    return { status: 0 };
  }
}

function rowMatchesProject(row: ReviewQueueRow, slug: string): boolean {
  if (row.projectTag === slug) return true;
  if (row.assetId.startsWith(`proj-${slug}-`)) return true;
  if (row.tags) {
    try {
      const tags = JSON.parse(row.tags) as unknown;
      if (Array.isArray(tags)) {
        if (tags.includes(`project:${slug}`) || tags.includes(slug)) {
          return true;
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (row.localPath?.includes(`/projects/${slug}/`)) return true;
  if (row.sourceIdentifier?.includes(`/projects/${slug}/`)) return true;
  return false;
}

function normalizeProjectSlug(raw: string): string {
  const slug = raw
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  if (!slug) {
    throw new Error('project slug is empty after normalization');
  }
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    throw new Error(`Invalid project slug: ${raw}`);
  }
  return slug;
}

function looksLikeIngest(input: PushAssetInput): boolean {
  return Boolean(
    input.assetId &&
      (input as { sourceBackend?: string; sourceIdentifier?: string; previewUrl?: string })
        .sourceBackend &&
      (input as { sourceIdentifier?: string }).sourceIdentifier &&
      (input as { previewUrl?: string }).previewUrl
  );
}

function toIngestInput(input: PushAssetInput): IngestAssetInput {
  const raw = input as PushAssetInput & Partial<IngestAssetInput>;
  if (!raw.assetId || !raw.sourceBackend || !raw.sourceIdentifier || !raw.previewUrl) {
    throw new Error('Incomplete IngestAssetInput');
  }
  return {
    assetId: raw.assetId,
    sourceBackend: raw.sourceBackend,
    sourceIdentifier: raw.sourceIdentifier,
    previewUrl: raw.previewUrl,
    localPath: raw.localPath,
    cloudUrl: raw.cloudUrl ?? input.cloudUrl,
    projectTag: raw.projectTag ?? input.project,
    tags: raw.tags ?? input.tags,
    designatedReviewer: raw.designatedReviewer,
    description: raw.description,
    partition: (raw.partition ?? input.partition) as IngestAssetInput['partition'],
    parentSourceId: raw.parentSourceId ?? input.parentSourceId,
    title: raw.title ?? input.title,
  };
}

function findLikelyAssetId(
  db: DatabaseManager,
  input: PushAssetInput
): string | null {
  if (input.assetId) return input.assetId;
  // Best-effort: title match among pending
  if (input.title) {
    const pending = db.getReviewQueue('pending');
    const hit = pending.find((r) => r.title === input.title);
    if (hit) return hit.assetId;
  }
  return null;
}
