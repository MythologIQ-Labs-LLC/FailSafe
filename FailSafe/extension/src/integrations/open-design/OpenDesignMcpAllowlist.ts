/**
 * OpenDesignMcpAllowlist — static enumeration of MCP tools exposed by the
 * Open Design daemon, with read/write/destructive classification.
 *
 * Sourced from nexu-io/open-design@abe72af apps/daemon/src/mcp.ts TOOL_DEFS.
 * All names back-cited to upstream line numbers (verified via gh-api
 * 2026-05-27):
 *   list_projects        — mcp.ts:87
 *   get_active_context   — mcp.ts:93   (v1 plan mis-named as get_active_project)
 *   get_artifact         — mcp.ts:100  (v1 plan OMITTED)
 *   get_project          — mcp.ts:128  (v1 plan OMITTED)
 *   get_file             — mcp.ts:139  (v1 plan mis-named as read_file)
 *   search_files         — mcp.ts:165  (v1 plan OMITTED)
 *   list_files           — mcp.ts:191
 *   create_artifact      — mcp.ts:208  (write; non-destructive)
 *   write_file           — mcp.ts:240  (write; destructive — overwrites existing)
 *   delete_file          — mcp.ts:267  (write; destructive — irreversible)
 *   delete_project       — mcp.ts:285  (write; destructive — irreversible)
 *
 * REMOVED v1 fabrications (do NOT add these — upstream excludes them per
 * mcp.ts:296-303): list_skills, get_skill, list_design_systems,
 * get_design_system, update_artifact.
 *
 * v1.1 policy: write tools (`create_artifact`, `write_file`, `delete_file`,
 * `delete_project`) are REJECTED at runtime by OpenDesignMcpClient.callRaw()
 * — exposure deferred to v1.2 with explicit L3 approval per call (B-OD-8).
 * See plan-open-design-integration-v1.1.md §Open-Q1.
 */

/**
 * B-OD-8: the L3 `kind` discriminator for a buffered Open Design create_artifact
 * call. Lives in the integrations layer so both the route (enqueue) and the
 * executor (consume l3Decided) import it downward.
 */
export const OPEN_DESIGN_CREATE_ARTIFACT_KIND = 'open-design-create-artifact';

const READ_ONLY_TOOLS = new Set<string>([
  'list_projects',
  'get_active_context',
  'get_artifact',
  'get_project',
  'get_file',
  'search_files',
  'list_files',
]);

interface WriteToolMeta {
  destructive: boolean;
}

const WRITE_TOOLS = new Map<string, WriteToolMeta>([
  ['create_artifact', { destructive: false }],
  ['write_file', { destructive: true }],
  ['delete_file', { destructive: true }],
  ['delete_project', { destructive: true }],
]);

export class OpenDesignMcpAllowlist {
  static isReadOnly(toolName: string): boolean {
    return READ_ONLY_TOOLS.has(toolName);
  }

  static isKnownWriteTool(toolName: string): boolean {
    return WRITE_TOOLS.has(toolName);
  }

  static isDestructive(toolName: string): boolean {
    return WRITE_TOOLS.get(toolName)?.destructive === true;
  }

  /**
   * B-OD-8: a write tool admitted through L3 approval this cycle. Conservative
   * v1.2 admits only the non-destructive write tool (`create_artifact`); the
   * 3 destructive tools stay rejected. Composed from the existing predicates
   * so the classification data (WRITE_TOOLS) remains the single source of truth.
   */
  static isL3GatedWrite(toolName: string): boolean {
    return WRITE_TOOLS.has(toolName) && !this.isDestructive(toolName);
  }

  static getReadOnlyTools(): readonly string[] {
    return Array.from(READ_ONLY_TOOLS).sort();
  }

  static getWriteTools(): readonly string[] {
    return Array.from(WRITE_TOOLS.keys()).sort();
  }

  static getDestructiveTools(): readonly string[] {
    return Array.from(WRITE_TOOLS.entries())
      .filter(([, meta]) => meta.destructive)
      .map(([name]) => name)
      .sort();
  }
}
