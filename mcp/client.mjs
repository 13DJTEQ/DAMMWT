#!/usr/bin/env node
/**
 * Thin HTTP client for the DAM localhost API (Electron main, loopback only).
 * Used by the MCP stdio server and `npm run dam:decide`.
 *
 * Env:
 *   DAM_API_BASE        default http://127.0.0.1:${DAM_API_PORT:-7842}
 *   DAM_API_PORT        default 7842
 *   DAM_API_TOKEN       bearer token (wins over file)
 *   DAM_API_TOKEN_FILE  path to token file (default: app userData dam-api-token)
 */
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DEFAULT_PORT = 7842;
const DEFAULT_TOKEN_FILE = join(
  homedir(),
  'Library',
  'Application Support',
  '@13djteq',
  'mwt-dam-mvp',
  'dam-api-token'
);

export function resolveBaseUrl() {
  if (process.env.DAM_API_BASE && process.env.DAM_API_BASE.trim()) {
    return process.env.DAM_API_BASE.replace(/\/$/, '');
  }
  const port = Number(process.env.DAM_API_PORT || DEFAULT_PORT) || DEFAULT_PORT;
  return `http://127.0.0.1:${port}`;
}

export function resolveToken() {
  if (process.env.DAM_API_TOKEN && process.env.DAM_API_TOKEN.trim()) {
    return process.env.DAM_API_TOKEN.trim();
  }
  const file =
    process.env.DAM_API_TOKEN_FILE?.trim() || DEFAULT_TOKEN_FILE;
  if (existsSync(file)) {
    return readFileSync(file, 'utf8').trim();
  }
  return null;
}

export function tokenFilePath() {
  return process.env.DAM_API_TOKEN_FILE?.trim() || DEFAULT_TOKEN_FILE;
}

/**
 * @param {string} method
 * @param {string} path  e.g. /v1/health
 * @param {{ body?: unknown, auth?: boolean, query?: Record<string, string | undefined> }} [opts]
 */
export async function damFetch(method, path, opts = {}) {
  const base = resolveBaseUrl();
  const auth = opts.auth !== false;
  const url = new URL(path.startsWith('http') ? path : `${base}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && String(v).length) {
        url.searchParams.set(k, String(v));
      }
    }
  }

  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json' };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = resolveToken();
    if (!token) {
      const err = new Error(
        `DAM API token missing. Set DAM_API_TOKEN or create ${tokenFilePath()} (start Electron once).`
      );
      err.code = 'DAM_NO_TOKEN';
      throw err;
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    const err = new Error(
      `DAM API unreachable at ${base} (${cause}). Start Electron: npm run review:electron`
    );
    err.code = 'DAM_UNREACHABLE';
    err.cause = e;
    throw err;
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: text.slice(0, 500) };
    }
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `HTTP ${res.status} ${res.statusText}`;
    const err = new Error(String(msg));
    err.code = 'DAM_HTTP';
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/** Convenience wrappers matching docs/AGENT-ELECTRON-SYNC.md */

export const damApi = {
  health: () => damFetch('GET', '/v1/health', { auth: false }),
  listProjects: () => damFetch('GET', '/v1/projects'),
  createProject: (slug) =>
    damFetch('POST', '/v1/projects', { body: { slug } }),
  pushAsset: (body) => damFetch('POST', '/v1/assets', { body }),
  listQueue: (query = {}) =>
    damFetch('GET', '/v1/queue', { query }),
  queueStats: () => damFetch('GET', '/v1/queue/stats'),
  getAsset: (assetId) =>
    damFetch('GET', `/v1/assets/${encodeURIComponent(assetId)}`),
  submitDecision: (body) =>
    damFetch('POST', '/v1/approvals', { body }),
  getLineage: (assetId) =>
    damFetch('GET', `/v1/assets/${encodeURIComponent(assetId)}/lineage`),
  getHistory: (assetId) =>
    damFetch('GET', `/v1/assets/${encodeURIComponent(assetId)}/history`),
  reveal: (localPath) =>
    damFetch('POST', '/v1/shell/reveal', { body: { localPath } }),
  openFile: (localPath) =>
    damFetch('POST', '/v1/shell/open', { body: { localPath } }),
  openCloud: (cloudUrl) =>
    damFetch('POST', '/v1/shell/open-cloud', { body: { cloudUrl } }),
  refresh: () => damFetch('POST', '/v1/media/refresh', { body: {} }),
};
