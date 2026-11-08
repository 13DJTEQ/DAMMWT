#!/usr/bin/env node
/**
 * Ensure MWT DAM localhost API is reachable (CLI / plugin / skills).
 *
 *   npm run dam:ensure
 *   npm run dam:ensure -- --timeout 90000
 *   npm run dam:ensure -- --no-launch   # probe only (CI / headless)
 *
 * Flow: GET /v1/health → if connection refused, best-effort spawn
 * `scripts/launch-dam.command` (falls back to `npm run review:electron`)
 * detached from DAMMWT_ROOT, then re-probe until timeout.
 *
 * Never opens dam.db. Health is unauthenticated (token not required).
 * DAM_API_DISABLE=1 → hard fail (API intentionally off in Electron).
 *
 * Env: DAM_API_BASE / DAM_API_PORT / DAMMWT_ROOT / DAM_ENSURE_NO_LAUNCH
 * See docs/DAM-HARNESS.md · docs/HARNESS-CONNECTIVITY.md
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(__dirname, '..');
const DEFAULT_TIMEOUT_MS = 90_000;
const POLL_MS = 1_500;
const HEALTH_TIMEOUT_MS = 2_500;

function resolveRoot() {
  const fromEnv = process.env.DAMMWT_ROOT?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return DEFAULT_ROOT;
}

function resolveBaseUrl() {
  if (process.env.DAM_API_BASE?.trim()) {
    return process.env.DAM_API_BASE.replace(/\/$/, '');
  }
  const port = Number(process.env.DAM_API_PORT || 7842) || 7842;
  return `http://127.0.0.1:${port}`;
}

function parseArgs(argv) {
  const out = {
    timeout: DEFAULT_TIMEOUT_MS,
    launch: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--no-launch') out.launch = false;
    else if (a === '--launch') out.launch = true;
    else if (a === '--timeout' || a === '-t') {
      const next = argv[++i];
      const n = Number(next);
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid --timeout: ${next}`);
        process.exit(2);
      }
      out.timeout = n;
    }
  }
  if (
    process.env.DAM_ENSURE_NO_LAUNCH === '1' ||
    process.env.DAM_ENSURE_NO_LAUNCH?.toLowerCase() === 'true'
  ) {
    out.launch = false;
  }
  return out;
}

function usage() {
  console.log(`Usage: npm run dam:ensure -- [--timeout <ms>] [--no-launch]

Probe GET /v1/health on DAM_API_BASE (default http://127.0.0.1:7842).
If unreachable, best-effort spawn scripts/launch-dam.command (or
npm run review:electron) from DAMMWT_ROOT and re-probe until timeout.

Options:
  --timeout <ms>   Total wait after spawn (default ${DEFAULT_TIMEOUT_MS})
  --no-launch      Probe only; never spawn (also DAM_ENSURE_NO_LAUNCH=1)
  -h, --help       Show this help

Exit codes:
  0  API healthy
  1  unreachable / disable / timeout
  2  bad args
`);
}

/**
 * @returns {Promise<{ ok: true, body: object } | { ok: false, reason: string, code?: string }>}
 */
async function probeHealth(base) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, reason: `non-JSON health (${res.status})` };
    }
    if (!res.ok || !body || body.ok !== true) {
      return {
        ok: false,
        reason: `health HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    return { ok: true, body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      e && typeof e === 'object' && 'cause' in e && e.cause && e.cause.code
        ? String(e.cause.code)
        : /ECONNREFUSED|fetch failed|AbortError|aborted/i.test(msg)
          ? 'ECONNREFUSED'
          : 'FETCH';
    return { ok: false, reason: msg, code };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Detached spawn of existing launch path. Never blocks on Electron.
 * @returns {{ spawned: boolean, command: string, error?: string }}
 */
function spawnLaunch(root) {
  const launchCmd = join(root, 'scripts', 'launch-dam.command');
  /** @type {string} */
  let command;
  /** @type {string[]} */
  let args;
  /** @type {Record<string, string | undefined>} */
  const env = { ...process.env, DAMMWT_ROOT: root };

  if (existsSync(launchCmd)) {
    command = '/bin/bash';
    args = [launchCmd];
  } else {
    command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    args = ['run', 'review:electron'];
  }

  try {
    const child = spawn(command, args, {
      cwd: root,
      env,
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    child.unref();
    return {
      spawned: true,
      command: `${command} ${args.join(' ')}`,
    };
  } catch (e) {
    return {
      spawned: false,
      command: `${command} ${args.join(' ')}`,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  if (
    process.env.DAM_API_DISABLE === '1' ||
    process.env.DAM_API_DISABLE?.toLowerCase() === 'true' ||
    process.env.DAM_API_DISABLE?.toLowerCase() === 'yes'
  ) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error:
            'DAM_API_DISABLE is set — API will not start in Electron. Unset it, then launch Gallery (npm run review:electron / scripts/launch-dam.command).',
          code: 'DAM_API_DISABLED',
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const base = resolveBaseUrl();
  const root = resolveRoot();

  const first = await probeHealth(base);
  if (first.ok) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          ensured: false,
          base,
          health: first.body,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  if (!args.launch) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: `DAM API unreachable at ${base} (${first.reason}). Start Gallery: npm run review:electron or scripts/launch-dam.command (from ${root}).`,
          code: 'DAM_UNREACHABLE',
          base,
          launched: false,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const launch = spawnLaunch(root);
  if (!launch.spawned) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: `Failed to spawn launch (${launch.error}). Run manually: npm run review:electron or ${join(root, 'scripts', 'launch-dam.command')}`,
          code: 'DAM_LAUNCH_FAILED',
          base,
          command: launch.command,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const deadline = Date.now() + args.timeout;
  let lastReason = first.reason;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const next = await probeHealth(base);
    if (next.ok) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            ensured: true,
            base,
            launched: true,
            command: launch.command,
            health: next.body,
          },
          null,
          2
        )
      );
      process.exit(0);
    }
    lastReason = next.reason;
  }

  console.error(
    JSON.stringify(
      {
        ok: false,
        error: `DAM API still unreachable at ${base} after ${args.timeout}ms (${lastReason}). Launch was started (${launch.command}) but health did not come up — check a display session / SEED=1 npm run review:electron manually from ${root}.`,
        code: 'DAM_ENSURE_TIMEOUT',
        base,
        launched: true,
        command: launch.command,
      },
      null,
      2
    )
  );
  process.exit(1);
}

await main();
