/**
 * Phase 1 DAM HTTP API acceptance (headless).
 * Starts DamService + localServer on an ephemeral loopback port — does not
 * require a display / full Electron window. Uses ELECTRON_RUN_AS_NODE via
 * scripts/run-verify.mjs for better-sqlite3 ABI.
 */
import { createServer } from 'http';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DamService } from '../src/api/DamService';
import {
  isDamApiDisabled,
  startLocalServer,
} from '../src/api/localServer';
import { DatabaseManager } from '../src/database/DatabaseManager';

async function fetchJson(
  base: string,
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
  } = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

/** Pick a free loopback port. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (!addr || typeof addr === 'string') {
        s.close(() => reject(new Error('Could not allocate port')));
        return;
      }
      const { port } = addr;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on('error', reject);
  });
}

async function main(): Promise<void> {
  if (isDamApiDisabled({ DAM_API_DISABLE: process.env.DAM_API_DISABLE })) {
    // Still verify the kill-switch helper; do not skip the whole suite unless
    // the env is set for this process intentionally by the caller.
  }

  const dir = mkdtempSync(join(tmpdir(), 'mwt-dam-api-'));
  const dbPath = join(dir, 'test.db');
  const userData = join(dir, 'userData');
  mkdirSync(userData, { recursive: true });

  let mutations = 0;
  const db = new DatabaseManager(dbPath);
  const service = new DamService({
    db,
    repoRoot: join(__dirname, '..'),
    allowedMediaRoots: [dir],
    onMutation: () => {
      mutations += 1;
    },
  });

  const port = await freePort();
  const token = 'verify-dam-api-token-0123456789abcdef';
  writeFileSync(join(userData, 'dam-api-token'), `${token}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  const handle = await startLocalServer({
    service,
    userDataPath: userData,
    port,
    token,
  });
  const base = `http://127.0.0.1:${port}`;

  try {
    // Health — no auth
    const health = await fetchJson(base, '/v1/health');
    if (health.status !== 200 || health.body.ok !== true) {
      throw new Error(`health failed: ${JSON.stringify(health)}`);
    }
    if (health.body.dbReady !== true) {
      throw new Error('health.dbReady expected true');
    }
    if (typeof health.body.apiVersion !== 'string') {
      throw new Error('health.apiVersion missing');
    }
    console.log('GET /v1/health ok:', {
      apiVersion: health.body.apiVersion,
      stats: health.body.stats,
    });

    // Unauthenticated mutating call → 401
    const unauth = await fetchJson(base, '/v1/queue');
    if (unauth.status !== 401) {
      throw new Error(`expected 401 without token, got ${unauth.status}`);
    }
    console.log('GET /v1/queue without token → 401');

    // Ingest via service (DB path) then list queue over HTTP
    const ingested = service.ingestAsset({
      assetId: 'api-verify-1',
      sourceBackend: 'local',
      sourceIdentifier: '/tmp/api-verify-1.png',
      previewUrl: 'file:///tmp/api-verify-1.png',
      projectTag: 'api-verify',
      partition: 'generated',
      parentSourceId: null,
      title: 'API verify fixture',
    });
    if (ingested.status !== 'pending') {
      throw new Error('ingest did not land pending');
    }

    const queue = await fetchJson(base, '/v1/queue?status=pending', {
      token,
    });
    if (queue.status !== 200) {
      throw new Error(`queue failed: ${JSON.stringify(queue)}`);
    }
    const rows = queue.body.queue as Array<{ assetId: string }>;
    if (!Array.isArray(rows) || !rows.some((r) => r.assetId === 'api-verify-1')) {
      throw new Error(`queue missing api-verify-1: ${JSON.stringify(queue.body)}`);
    }
    console.log('GET /v1/queue pending includes api-verify-1');

    // Lineage (SoT only)
    const lineage = await fetchJson(base, '/v1/assets/api-verify-1/lineage', {
      token,
    });
    if (lineage.status !== 200) {
      throw new Error(`lineage failed: ${JSON.stringify(lineage)}`);
    }
    const chain = lineage.body.chain as unknown[];
    if (!Array.isArray(chain) || chain.length !== 1) {
      throw new Error(`expected chain length 1, got ${JSON.stringify(lineage.body)}`);
    }
    console.log('GET /v1/assets/:id/lineage ok');

    // Approval round-trip
    const beforeMutations = mutations;
    const approval = await fetchJson(base, '/v1/approvals', {
      method: 'POST',
      token,
      body: {
        assetId: 'api-verify-1',
        decision: 'love',
        reviewedBy: 'verify-dam-api',
        notes: 'phase1 harness',
      },
    });
    if (approval.status !== 200 || (approval.body.asset as { status?: string })?.status !== 'love') {
      throw new Error(`approval failed: ${JSON.stringify(approval)}`);
    }
    if (mutations <= beforeMutations) {
      throw new Error('expected onMutation after HTTP approval');
    }
    console.log('POST /v1/approvals love ok; mutations=', mutations);

    // Stats
    const stats = await fetchJson(base, '/v1/queue/stats', { token });
    const s = stats.body.stats as { love?: number; pending?: number };
    if (stats.status !== 200 || s.love !== 1) {
      throw new Error(`stats unexpected: ${JSON.stringify(stats.body)}`);
    }
    console.log('GET /v1/queue/stats ok');

    // Shell reveal must reject paths outside roots
    const reveal = await fetchJson(base, '/v1/shell/reveal', {
      method: 'POST',
      token,
      body: { localPath: '/etc/passwd' },
    });
    if (reveal.status === 200 && (reveal.body as { ok?: boolean }).ok === true) {
      throw new Error('reveal should reject /etc/passwd');
    }
    console.log('POST /v1/shell/reveal outside roots rejected');

    // Kill switch helper
    if (!isDamApiDisabled({ DAM_API_DISABLE: '1' })) {
      throw new Error('isDamApiDisabled(1) should be true');
    }
    console.log('DAM_API_DISABLE helper ok');

    console.log('verify-dam-api: PASS');
  } finally {
    await handle.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error('verify-dam-api: FAIL', err);
  process.exit(1);
});
