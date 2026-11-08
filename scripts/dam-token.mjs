#!/usr/bin/env node
/**
 * Print the DAM API bearer token path and value for any harness to inject.
 *
 *   npm run dam:token
 *   npm run dam:token -- --path-only
 *   npm run dam:token -- --value-only
 *   npm run dam:token -- --export   # shell-friendly export lines
 *
 * Env (same contract as MCP / dam:decide):
 *   DAM_API_TOKEN       wins over file
 *   DAM_API_TOKEN_FILE  default: app userData dam-api-token
 *   DAM_API_BASE / DAM_API_PORT  printed for convenience
 *
 * See docs/DAM-HARNESS.md
 */
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientUrl = pathToFileURL(join(__dirname, '../mcp/client.mjs')).href;
const { resolveBaseUrl, resolveToken, tokenFilePath } = await import(clientUrl);

const args = new Set(process.argv.slice(2));
const pathOnly = args.has('--path-only') || args.has('-p');
const valueOnly = args.has('--value-only') || args.has('-v');
const exportMode = args.has('--export') || args.has('-e');
const help = args.has('--help') || args.has('-h');

if (help) {
  console.log(`Usage:
  npm run dam:token
  npm run dam:token -- --path-only
  npm run dam:token -- --value-only
  npm run dam:token -- --export

Prints DAM API token path/value for Claude / Grok / Hermes / Cursor harness injection.
Env: DAM_API_TOKEN | DAM_API_TOKEN_FILE | DAM_API_BASE | DAM_API_PORT
`);
  process.exit(0);
}

const path = tokenFilePath();
const token = resolveToken();
const base = resolveBaseUrl();

if (pathOnly) {
  console.log(path);
  process.exit(token ? 0 : 1);
}

if (valueOnly) {
  if (!token) {
    console.error(`DAM API token missing (${path}). Start Electron once, or set DAM_API_TOKEN.`);
    process.exit(1);
  }
  console.log(token);
  process.exit(0);
}

if (exportMode) {
  console.log(`export DAM_API_BASE=${JSON.stringify(base)}`);
  console.log(`export DAM_API_TOKEN_FILE=${JSON.stringify(path)}`);
  if (token) {
    console.log(`export DAM_API_TOKEN=${JSON.stringify(token)}`);
  } else {
    console.error(`# WARNING: token missing at ${path} — start Electron once`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}

console.log(`DAM_API_BASE=${base}`);
console.log(`DAM_API_TOKEN_FILE=${path}`);
if (token) {
  console.log(`DAM_API_TOKEN=${token}`);
  console.log(`token_source=${process.env.DAM_API_TOKEN?.trim() ? 'env' : 'file'}`);
} else {
  console.log('DAM_API_TOKEN=');
  console.log(`token_source=missing`);
  console.error(
    `Token missing. Start Gallery once (npm run review:electron) or set DAM_API_TOKEN.`
  );
  process.exit(1);
}
