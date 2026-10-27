#!/usr/bin/env node
/**
 * dammwt MCP server (stdio) — thin wrapper over the Electron localhost HTTP API.
 * Generic MCP JSON-RPC over stdio: Claude Desktop, Cursor, and any MCP client.
 *
 * Requires Electron DAM running with the Phase 1 API on 127.0.0.1:7842.
 * See docs/DAM-HARNESS.md, docs/AGENT-ELECTRON-SYNC.md, and mcp/README.md.
 */
import { damApi, resolveBaseUrl, resolveToken, tokenFilePath } from './client.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'dammwt', version: '0.1.0' };

/** @param {Buffer} buf @param {Buffer} sub */
function indexOfSubBuf(buf, sub) {
  if (sub.length === 0) return 0;
  outer: for (let i = 0; i <= buf.length - sub.length; i++) {
    for (let j = 0; j < sub.length; j++) {
      if (buf[i + j] !== sub[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** @type {Array<{ name: string, description: string, inputSchema: object }>} */
const TOOLS = [
  {
    name: 'dam_health',
    description:
      'Check whether Electron MWT DAM localhost API is up (no auth). Fail fast if DAM not running.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'dam_create_project',
    description:
      'Create/ensure a Gallery project section (assets/media/projects/<slug>/…). Same as npm run dam:section.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Lowercase kebab-case project slug',
        },
      },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'dam_push_asset',
    description:
      'Stage/ingest an asset into DAM (preferred: sourcePath + partition; or already-staged ingest). Prefer CLI push:media for bulk bytes; use this for one-shot harness pushes.',
    inputSchema: {
      type: 'object',
      properties: {
        sourcePath: { type: 'string', description: 'Absolute path to image on disk' },
        partition: {
          type: 'string',
          enum: ['originals', 'tattoos', 'generated'],
        },
        project: { type: 'string' },
        pipeline: { type: 'string' },
        parentSourceId: { type: ['string', 'null'] },
        batch: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        title: { type: ['string', 'null'] },
        cloudUrl: { type: ['string', 'null'] },
        assetId: { type: ['string', 'null'] },
        ingest: {
          type: 'object',
          description: 'DB-only ingest when bytes already under media root',
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'dam_refresh',
    description: 'Force reseed from assets/media/manifest.json into ReviewQueue.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'dam_list_queue',
    description:
      'List Gallery review queue rows. Optional status + project filters. Use to see what Dave still needs to review.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'love', 'keep', 'reject', 'changesRequested'],
        },
        project: { type: 'string', description: 'Project section slug filter' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'dam_submit_decision',
    description:
      'Submit a Gallery decision (love|keep|reject|changesRequested). Prefer humans deciding in the UI; harness automation may call this.',
    inputSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        decision: {
          type: 'string',
          enum: ['love', 'keep', 'reject', 'changesRequested'],
        },
        reviewedBy: {
          type: 'string',
          description: 'Who decided (e.g. cursor-agent, dave, comfy-harness)',
        },
        notes: { type: 'string' },
      },
      required: ['assetId', 'decision', 'reviewedBy'],
      additionalProperties: false,
    },
  },
  {
    name: 'dam_get_lineage',
    description:
      'Walk parentSourceId to SoT + siblings sharing the same parent. Steer next gen from loves + SoT.',
    inputSchema: {
      type: 'object',
      properties: { assetId: { type: 'string' } },
      required: ['assetId'],
      additionalProperties: false,
    },
  },
  {
    name: 'dam_reveal_file',
    description:
      'Reveal a local media path in Finder (must resolve under allowed media roots).',
    inputSchema: {
      type: 'object',
      properties: { localPath: { type: 'string' } },
      required: ['localPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'dam_open_file',
    description: 'Open a local media path in the default app (allowed roots only).',
    inputSchema: {
      type: 'object',
      properties: { localPath: { type: 'string' } },
      required: ['localPath'],
      additionalProperties: false,
    },
  },
];

function toolResult(data, isError = false) {
  const text =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

async function callTool(name, args = {}) {
  switch (name) {
    case 'dam_health':
      return toolResult({
        ...(await damApi.health()),
        base: resolveBaseUrl(),
        tokenConfigured: Boolean(resolveToken()),
        tokenFile: tokenFilePath(),
      });
    case 'dam_create_project':
      return toolResult(await damApi.createProject(args.slug));
    case 'dam_push_asset':
      return toolResult(await damApi.pushAsset(args));
    case 'dam_refresh':
      return toolResult(await damApi.refresh());
    case 'dam_list_queue':
      return toolResult(
        await damApi.listQueue({
          status: args.status,
          project: args.project,
        })
      );
    case 'dam_submit_decision':
      return toolResult(
        await damApi.submitDecision({
          assetId: args.assetId,
          decision: args.decision,
          reviewedBy: args.reviewedBy,
          notes: args.notes,
        })
      );
    case 'dam_get_lineage':
      return toolResult(await damApi.getLineage(args.assetId));
    case 'dam_reveal_file':
      return toolResult(await damApi.reveal(args.localPath));
    case 'dam_open_file':
      return toolResult(await damApi.openFile(args.localPath));
    default:
      return toolResult(`Unknown tool: ${name}`, true);
  }
}

/** Minimal MCP JSON-RPC over stdio (Content-Length framing + JSON lines). */
class StdioJsonRpc {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  start() {
    process.stdin.on('data', (chunk) => {
      this.buffer = Buffer.concat([
        this.buffer,
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
      ]);
      this.drain();
    });
    process.stdin.resume();
  }

  drain() {
    while (true) {
      const headerEnd = indexOfSubBuf(this.buffer, Buffer.from('\r\n\r\n'));
      if (headerEnd >= 0) {
        const header = this.buffer.slice(0, headerEnd).toString('utf8');
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) {
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }
        const len = Number(match[1]);
        const bodyStart = headerEnd + 4;
        if (this.buffer.length < bodyStart + len) return;
        const body = this.buffer
          .slice(bodyStart, bodyStart + len)
          .toString('utf8');
        this.buffer = this.buffer.slice(bodyStart + len);
        void this.handleMessage(body);
        continue;
      }

      const nl = this.buffer.indexOf(0x0a);
      if (nl < 0) return;
      const line = this.buffer.slice(0, nl).toString('utf8').trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line.startsWith('{')) {
        void this.handleMessage(line);
      }
    }
  }

  async handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (Array.isArray(msg)) {
      for (const m of msg) await this.dispatch(m);
      return;
    }
    await this.dispatch(msg);
  }

  async dispatch(msg) {
    if (!msg || typeof msg !== 'object') return;
    const { id, method, params } = msg;
    const isNotification = id === undefined || id === null;

    try {
      let result;
      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          };
          break;
        case 'notifications/initialized':
        case 'initialized':
          return;
        case 'ping':
          result = {};
          break;
        case 'tools/list':
          result = { tools: TOOLS };
          break;
        case 'tools/call': {
          const name = params?.name;
          const args = params?.arguments ?? {};
          try {
            result = await callTool(name, args);
          } catch (e) {
            result = toolResult(
              e instanceof Error ? e.message : String(e),
              true
            );
          }
          break;
        }
        default:
          if (!isNotification) {
            this.send({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Method not found: ${method}` },
            });
          }
          return;
      }
      if (!isNotification) {
        this.send({ jsonrpc: '2.0', id, result });
      }
    } catch (e) {
      if (!isNotification) {
        this.send({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: e instanceof Error ? e.message : String(e),
          },
        });
      }
    }
  }

  send(obj) {
    const body = JSON.stringify(obj);
    const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
    process.stdout.write(frame);
  }
}

const server = new StdioJsonRpc();
server.start();
