/**
 * Localhost-only HTTP API for agents / harnesses / Comfy scripts.
 * Binds 127.0.0.1 only; bearer token from userData (or DAM_API_TOKEN).
 * All business logic goes through DamService (shared with IPC).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';
import type { DamService } from './DamService';
import { DAM_API_VERSION } from './DamService';
import type {
  IngestAssetInput,
  ReviewStatus,
  SubmitApprovalInput,
} from '../database/DatabaseManager';

export const DEFAULT_DAM_API_PORT = 7842;
export const DAM_API_TOKEN_FILENAME = 'dam-api-token';

export interface LocalServerOptions {
  service: DamService;
  /** Directory for dam-api-token (typically app.getPath('userData')). */
  userDataPath: string;
  port?: number;
  /** Override token (DAM_API_TOKEN). */
  token?: string;
  host?: string;
}

export interface LocalServerHandle {
  server: Server;
  port: number;
  host: string;
  token: string;
  tokenFile: string;
  close: () => Promise<void>;
}

interface JsonBody {
  [key: string]: unknown;
}

/**
 * Resolve / create the API bearer token.
 * Env DAM_API_TOKEN wins; otherwise read/create `$userData/dam-api-token`.
 */
export function resolveApiToken(
  userDataPath: string,
  envToken?: string
): { token: string; tokenFile: string; created: boolean } {
  const tokenFile = join(userDataPath, DAM_API_TOKEN_FILENAME);
  const fromEnv = (envToken ?? process.env.DAM_API_TOKEN)?.trim();
  if (fromEnv) {
    return { token: fromEnv, tokenFile, created: false };
  }

  if (existsSync(tokenFile)) {
    const existing = readFileSync(tokenFile, 'utf8').trim();
    if (existing) {
      return { token: existing, tokenFile, created: false };
    }
  }

  mkdirSync(dirname(tokenFile), { recursive: true });
  const token = randomBytes(32).toString('hex');
  writeFileSync(tokenFile, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    // Best-effort chmod (Windows may ignore mode on writeFileSync).
    chmodSync(tokenFile, 0o600);
  } catch {
    /* ignore */
  }
  return { token, tokenFile, created: true };
}

export function isDamApiDisabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const v = env.DAM_API_DISABLE?.trim();
  return v === '1' || v?.toLowerCase() === 'true' || v?.toLowerCase() === 'yes';
}

/**
 * Start the DAM HTTP API on loopback. Throws if bind host is not loopback.
 */
export async function startLocalServer(
  options: LocalServerOptions
): Promise<LocalServerHandle> {
  const host = options.host ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error(
      `DAM API refuses non-loopback bind: ${host} (Phase 1 is localhost-only)`
    );
  }

  const port =
    options.port ??
    (process.env.DAM_API_PORT
      ? Number(process.env.DAM_API_PORT)
      : DEFAULT_DAM_API_PORT);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid DAM_API_PORT: ${process.env.DAM_API_PORT}`);
  }

  const { token, tokenFile, created } = resolveApiToken(
    options.userDataPath,
    options.token
  );
  if (created) {
    console.log(`[api] token file: ${tokenFile}`);
  }

  const service = options.service;

  const server = createServer((req, res) => {
    void handleRequest(req, res, service, token);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  console.log(
    `[api] DAM HTTP listening on http://${host}:${port}/v1 (apiVersion=${DAM_API_VERSION})`
  );

  return {
    server,
    port,
    host,
    token,
    tokenFile,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  service: DamService,
  token: string
): Promise<void> {
  try {
    const url = new URL(
      req.url ?? '/',
      `http://${req.headers.host ?? '127.0.0.1'}`
    );
    const path = normalizePath(url.pathname);
    const method = (req.method ?? 'GET').toUpperCase();

    // Discovery roots — unauthenticated so a browser hit isn't blank / 401
    if (method === 'GET' && (path === '/' || path === '/v1')) {
      json(res, 200, {
        ok: true,
        service: 'MWT DAM',
        apiVersion: DAM_API_VERSION,
        health: '/v1/health',
        openapi: 'docs/openapi-dam-api.yaml',
        base: '/v1',
        docs: 'docs/HARNESS-CONNECTIVITY.md',
      });
      return;
    }

    // Health is unauthenticated
    if (method === 'GET' && (path === '/v1/health' || path === '/health')) {
      json(res, 200, service.healthCheck());
      return;
    }

    if (!isAuthorized(req, token)) {
      json(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }

    if (method === 'GET' && path === '/v1/projects') {
      const projects = await service.getMediaProjects();
      json(res, 200, { ok: true, projects });
      return;
    }

    if (method === 'POST' && path === '/v1/projects') {
      const body = await readJson(req);
      const slug = String(body.slug ?? '').trim();
      if (!slug) {
        json(res, 400, { ok: false, error: 'slug is required' });
        return;
      }
      const result = await service.createProject(slug);
      json(res, result.ok ? 200 : 500, result);
      return;
    }

    if (method === 'POST' && path === '/v1/assets') {
      const body = await readJson(req);
      const row = await service.pushAsset(body as Parameters<DamService['pushAsset']>[0]);
      json(res, 200, { ok: true, asset: row });
      return;
    }

    if (method === 'GET' && path === '/v1/queue') {
      const status = url.searchParams.get('status') as ReviewStatus | null;
      const project = url.searchParams.get('project') ?? undefined;
      const valid: ReviewStatus[] = [
        'pending',
        'love',
        'keep',
        'reject',
        'changesRequested',
      ];
      if (status && !valid.includes(status)) {
        json(res, 400, { ok: false, error: `Invalid status: ${status}` });
        return;
      }
      const queue = service.getReviewQueue(status ?? undefined, project);
      json(res, 200, { ok: true, queue });
      return;
    }

    if (method === 'GET' && path === '/v1/queue/stats') {
      json(res, 200, { ok: true, stats: service.getQueueStats() });
      return;
    }

    if (method === 'POST' && path === '/v1/approvals') {
      const body = await readJson(req);
      const input = body as unknown as SubmitApprovalInput;
      if (!input.assetId || !input.decision || !input.reviewedBy) {
        json(res, 400, {
          ok: false,
          error: 'assetId, decision, and reviewedBy are required',
        });
        return;
      }
      const row = service.submitApproval(input);
      json(res, 200, { ok: true, asset: row });
      return;
    }

    const assetMatch = path.match(/^\/v1\/assets\/([^/]+)(.*)$/);
    if (assetMatch) {
      const assetId = decodeURIComponent(assetMatch[1]!);
      const rest = assetMatch[2] ?? '';

      if (method === 'GET' && rest === '') {
        const asset = service.getByAssetId(assetId);
        if (!asset) {
          json(res, 404, { ok: false, error: `Unknown assetId: ${assetId}` });
          return;
        }
        json(res, 200, { ok: true, asset });
        return;
      }

      if (method === 'GET' && rest === '/lineage') {
        const lineage = service.getLineage(assetId);
        if (!lineage) {
          json(res, 404, { ok: false, error: `Unknown assetId: ${assetId}` });
          return;
        }
        json(res, 200, { ok: true, ...lineage });
        return;
      }

      if (method === 'GET' && rest === '/history') {
        const history = service.getAssetVersionHistory(assetId);
        json(res, 200, { ok: true, history });
        return;
      }

      if (method === 'POST' && rest === '/resubmit') {
        const body = await readJson(req);
        const sourceIdentifier = String(
          body.sourceIdentifier ?? body.newSourceIdentifier ?? ''
        ).trim();
        const previewUrl = String(body.previewUrl ?? '').trim();
        if (!sourceIdentifier || !previewUrl) {
          json(res, 400, {
            ok: false,
            error: 'sourceIdentifier and previewUrl are required',
          });
          return;
        }
        const row = service.resubmitAsset(
          assetId,
          sourceIdentifier,
          previewUrl
        );
        json(res, 200, { ok: true, asset: row });
        return;
      }
    }

    if (method === 'POST' && path === '/v1/shell/reveal') {
      const body = await readJson(req);
      const localPath = String(body.localPath ?? '').trim();
      if (!localPath) {
        json(res, 400, { ok: false, error: 'localPath is required' });
        return;
      }
      const result = await service.revealInFolder(localPath);
      json(res, result.ok ? 200 : 400, result);
      return;
    }

    if (method === 'POST' && path === '/v1/shell/open') {
      const body = await readJson(req);
      const localPath = String(body.localPath ?? '').trim();
      if (!localPath) {
        json(res, 400, { ok: false, error: 'localPath is required' });
        return;
      }
      const result = await service.openLocalPath(localPath);
      json(res, result.ok ? 200 : 400, result);
      return;
    }

    if (method === 'POST' && path === '/v1/shell/open-cloud') {
      const body = await readJson(req);
      const cloudUrl = String(body.cloudUrl ?? '').trim();
      if (!cloudUrl) {
        json(res, 400, { ok: false, error: 'cloudUrl is required' });
        return;
      }
      const result = await service.openCloudUrl(cloudUrl);
      json(res, result.ok ? 200 : 400, result);
      return;
    }

    if (method === 'POST' && path === '/v1/media/refresh') {
      const result = await service.refreshMedia();
      json(res, 200, { ok: true, ...result });
      return;
    }

    // Also accept DB-shaped POST /v1/assets as ingest when Content looks like IngestAssetInput
    if (method === 'POST' && path === '/v1/ingest') {
      const body = await readJson(req);
      const row = service.ingestAsset(body as unknown as IngestAssetInput);
      json(res, 200, { ok: true, asset: row });
      return;
    }

    json(res, 404, { ok: false, error: `Not found: ${method} ${path}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /required|invalid|unknown asset|cannot submit|not awaiting/i.test(
      message
    )
      ? 400
      : 500;
    json(res, status, { ok: false, error: message });
  }
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

function isAuthorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return false;
  const match = /^\s*Bearer\s+(.+)\s*$/i.exec(header);
  if (!match) return false;
  return match[1]!.trim() === token;
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<JsonBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON body must be an object');
  }
  return parsed as JsonBody;
}
