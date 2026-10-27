#!/usr/bin/env node
/**
 * Thin CLI over the DAM localhost HTTP API (Electron main).
 *
 *   npm run dam:decide -- health
 *   npm run dam:decide -- queue [--status pending] [--project slug]
 *   npm run dam:decide -- submit --asset-id <id> --decision love|keep|reject|changesRequested [--by who] [--notes …]
 *   npm run dam:decide -- lineage --asset-id <id>
 *   npm run dam:decide -- reveal --path <localPath>
 *   npm run dam:decide -- refresh
 *   npm run dam:decide -- project --slug <slug>
 *   npm run dam:decide -- push --file <path> --partition <…> [--project …]
 *
 * Env: DAM_API_BASE / DAM_API_PORT / DAM_API_TOKEN / DAM_API_TOKEN_FILE
 * See docs/AGENT-ELECTRON-SYNC.md
 */
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientUrl = pathToFileURL(join(__dirname, '../mcp/client.mjs')).href;
const { damApi, resolveBaseUrl, resolveToken, tokenFilePath } = await import(
  clientUrl
);

const DECISIONS = new Set(['love', 'keep', 'reject', 'changesRequested']);
const STATUSES = new Set(['pending', 'love', 'keep', 'reject', 'changesRequested']);

function usage(code = 1) {
  console.log(`Usage:
  npm run dam:decide -- health
  npm run dam:decide -- projects
  npm run dam:decide -- project --slug <slug>
  npm run dam:decide -- queue [--status pending|love|keep|reject|changesRequested] [--project <slug>]
  npm run dam:decide -- stats
  npm run dam:decide -- submit --asset-id <id> --decision <love|keep|reject|changesRequested> [--by <who>] [--notes <text>]
  npm run dam:decide -- lineage --asset-id <id>
  npm run dam:decide -- get --asset-id <id>
  npm run dam:decide -- reveal --path <localPath>
  npm run dam:decide -- open --path <localPath>
  npm run dam:decide -- refresh
  npm run dam:decide -- push --file <absPath> --partition <originals|tattoos|generated> [options]

Push options: --project --pipeline --parent --batch --tags --title --cloud-url --asset-id

Env:
  DAM_API_BASE / DAM_API_PORT (default 7842)
  DAM_API_TOKEN or DAM_API_TOKEN_FILE
  Base: ${resolveBaseUrl()}
  Token: ${resolveToken() ? 'configured' : `missing (${tokenFilePath()})`}
`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      out.help = true;
    } else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) usage(args.help ? 0 : 1);

  const cmd = args._[0];

  try {
    switch (cmd) {
      case 'health':
        printJson({
          ...(await damApi.health()),
          base: resolveBaseUrl(),
          tokenConfigured: Boolean(resolveToken()),
        });
        break;

      case 'projects':
        printJson(await damApi.listProjects());
        break;

      case 'project':
      case 'create-project': {
        const slug = args.slug || args.project || args._[1];
        if (!slug) {
          console.error('Missing --slug');
          process.exit(1);
        }
        printJson(await damApi.createProject(slug));
        break;
      }

      case 'queue': {
        const status = args.status;
        if (status && !STATUSES.has(status)) {
          console.error(`Invalid --status ${status}`);
          process.exit(1);
        }
        printJson(
          await damApi.listQueue({
            status,
            project: args.project,
          })
        );
        break;
      }

      case 'stats':
        printJson(await damApi.queueStats());
        break;

      case 'submit':
      case 'decide':
      case 'approval': {
        const assetId = args['asset-id'] || args.assetId || args._[1];
        const decision = args.decision || args._[2];
        const reviewedBy =
          args.by || args['reviewed-by'] || args.reviewedBy || 'cli';
        const notes = args.notes;
        if (!assetId || !decision) {
          console.error('Need --asset-id and --decision');
          process.exit(1);
        }
        if (!DECISIONS.has(decision)) {
          console.error(`Invalid --decision ${decision}`);
          process.exit(1);
        }
        printJson(
          await damApi.submitDecision({
            assetId,
            decision,
            reviewedBy,
            notes,
          })
        );
        break;
      }

      case 'lineage': {
        const assetId = args['asset-id'] || args.assetId || args._[1];
        if (!assetId) {
          console.error('Missing --asset-id');
          process.exit(1);
        }
        printJson(await damApi.getLineage(assetId));
        break;
      }

      case 'get': {
        const assetId = args['asset-id'] || args.assetId || args._[1];
        if (!assetId) {
          console.error('Missing --asset-id');
          process.exit(1);
        }
        printJson(await damApi.getAsset(assetId));
        break;
      }

      case 'reveal': {
        const localPath = args.path || args['local-path'] || args._[1];
        if (!localPath) {
          console.error('Missing --path');
          process.exit(1);
        }
        printJson(await damApi.reveal(localPath));
        break;
      }

      case 'open': {
        const localPath = args.path || args['local-path'] || args._[1];
        if (!localPath) {
          console.error('Missing --path');
          process.exit(1);
        }
        printJson(await damApi.openFile(localPath));
        break;
      }

      case 'refresh':
        printJson(await damApi.refresh());
        break;

      case 'push': {
        const sourcePath = args.file || args['source-path'] || args._[1];
        const partition = args.partition;
        if (!sourcePath || !partition) {
          console.error('Need --file and --partition');
          process.exit(1);
        }
        /** @type {Record<string, unknown>} */
        const body = { sourcePath, partition };
        if (args.project) body.project = args.project;
        if (args.pipeline) body.pipeline = args.pipeline;
        if (args.parent) body.parentSourceId = args.parent;
        if (args.batch) body.batch = args.batch;
        if (args.tags) {
          body.tags = String(args.tags)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        }
        if (args.title) body.title = args.title;
        if (args['cloud-url']) body.cloudUrl = args['cloud-url'];
        if (args['asset-id']) body.assetId = args['asset-id'];
        printJson(await damApi.pushAsset(body));
        break;
      }

      default:
        console.error(`Unknown command: ${cmd}`);
        usage(1);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    if (e && e.data) {
      console.error(JSON.stringify(e.data, null, 2));
    }
    process.exit(1);
  }
}

await main();
