// FX528 echo-mcp-server — vendored test fixture for B-BIC-20 live-subprocess
// integration test. Implements the MCP-stdio protocol via the SDK's Server,
// declares the 15 bicameral tool names, returns canned JSON per call, and
// writes received call arguments to a side-channel file so the test can
// verify wire-shape without a complex bidirectional spy.
//
// SELF-CONTAINED: no parent-directory imports (only @modelcontextprotocol/sdk
// + Node stdlib) so this compiles to a standalone .js the test can spawn.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

const SIDE_CHANNEL_FILE = process.env.ECHO_MCP_SIDE_CHANNEL
  ?? path.join(process.cwd(), 'echo-mcp-server.last-call.json');

const TOOL_NAMES = [
  'bicameral.brief',
  'bicameral.dashboard',
  'bicameral.drift',
  'bicameral.getNeighbors',
  'bicameral.history',
  'bicameral.ingest',
  'bicameral.judgeGaps',
  'bicameral.linkCommit',
  'bicameral.preflight',
  'bicameral.ratify',
  'bicameral.reset',
  'bicameral.resolveCompliance',
  'bicameral.search',
  'bicameral.update',
  'bicameral.validateSymbols',
] as const;

// Canned JSON per tool — minimal-but-valid shapes that satisfy each guard.
const CANNED: Record<string, unknown> = {
  'bicameral.history': { features: [{ feature: 'echo-feature', decisions: [] }] },
  'bicameral.preflight': { prior_decisions: [], drifted: [], open_questions: [] },
  'bicameral.drift': { drift: [] },
  'bicameral.ratify': { ok: true },
  'bicameral.ingest': { ingested: 0 },
  'bicameral.search': { results: [] },
  'bicameral.brief': { brief: 'echo-brief' },
  'bicameral.judgeGaps': { gaps: [] },
  'bicameral.resolveCompliance': { resolved: true },
  'bicameral.linkCommit': { linked: true },
  'bicameral.update': { updated: true },
  'bicameral.reset': { reset: true },
  'bicameral.dashboard': { features: 1, decisions: 0 },
  'bicameral.validateSymbols': { invalid: [] },
  'bicameral.getNeighbors': { neighbors: [] },
};

const server = new Server(
  { name: 'echo-bicameral', version: '0.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_NAMES.map((name) => ({
    name,
    description: `echo stub for ${name}`,
    inputSchema: { type: 'object', additionalProperties: true },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    fs.writeFileSync(SIDE_CHANNEL_FILE, JSON.stringify({ tool: name, args: args ?? {} }));
  } catch { /* best-effort */ }
  const canned = CANNED[name];
  if (canned === undefined) {
    return { isError: true, content: [{ type: 'text', text: `unknown tool ${name}` }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(canned) }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();
