/**
 * mcp-installer — pure config-merge for installing an MCP catalog entry into the
 * workspace `.mcp.json` (the cross-host MCP server config convention). Idempotent:
 * re-installing updates the same key. The I/O (read/write the file) lives in the
 * command; this merge logic is pure + unit-tested.
 */

import type { McpCatalogEntry } from './mcp-catalog';

/** The `.mcp.json` server entry for a catalog item. */
export function buildMcpServerEntry(entry: McpCatalogEntry): { command: string; args: string[] } {
  return { command: entry.install.command, args: [...entry.install.args] };
}

/**
 * Merge a catalog entry into existing `.mcp.json` text under `mcpServers`.
 * Tolerates empty/malformed input (starts fresh). Returns the merged JSON text
 * and whether the entry was newly added (vs. updated).
 */
export type McpMergeResult =
  | { ok: true; text: string; added: boolean }
  | { ok: false; reason: 'unparseable-existing' };

// #241 Tranche C D-1 (FX913): an unparseable existing config REFUSES the merge
// instead of silently replacing the operator's other MCP servers with {}.
export function mergeMcpConfig(existingText: string, entry: McpCatalogEntry): McpMergeResult {
  let config: { mcpServers?: Record<string, unknown> } & Record<string, unknown>;
  if (!existingText.trim()) {
    config = {};
  } else {
    try {
      config = JSON.parse(existingText) as typeof config;
    } catch {
      return { ok: false, reason: 'unparseable-existing' };
    }
  }
  if (!config.mcpServers || typeof config.mcpServers !== 'object') config.mcpServers = {};
  const servers = config.mcpServers as Record<string, unknown>;
  const added = !(entry.id in servers);
  servers[entry.id] = buildMcpServerEntry(entry);
  return { ok: true, text: `${JSON.stringify(config, null, 2)}\n`, added };
}
