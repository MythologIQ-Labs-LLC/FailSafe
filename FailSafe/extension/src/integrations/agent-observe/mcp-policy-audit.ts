/**
 * mcp-policy-audit — pure, read-only auditor for Cline / Roo / Kilo MCP & tool
 * permission config (#106). Parses an MCP settings document defensively (these
 * agents share the standard `mcpServers` shape but differ on the auto-approve
 * field name — `alwaysAllow` vs `autoApprove` — so both are read), REDACTS all
 * secret material (env values dropped, URL reduced to host), and flags risky
 * posture: remote MCP servers, wildcard auto-approval, and shell-capable tools.
 *
 * Everything here is pure — no fs, no network. The command layer reads the
 * files and feeds the text in. Risk records key-idempotently so re-auditing
 * upserts rather than duplicates (same shape as the SARIF / Sentry ingests).
 */

export type RiskSeverity = 'high' | 'warn' | 'info';

export interface McpServerPolicy {
  name: string;
  transport: 'local' | 'remote';
  /** Local stdio command (basename only — no args/secrets). */
  command?: string;
  /** Remote host only — never the full URL (which can carry tokens). */
  urlHost?: string;
  /** Tool names this server auto-approves (no values). `*` = wildcard. */
  autoApprove: string[];
  /** ENV variable KEYS only — values are redacted (they are often secrets). */
  envKeys: string[];
}

export interface McpPolicy {
  servers: McpServerPolicy[];
  /** Document-level auto-approve, if the agent stores it globally. */
  globalAutoApprove: string[];
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : [];
}
/** Read whichever auto-approve field this agent variant uses. */
function readAutoApprove(node: Record<string, unknown>): string[] {
  return [...strArray(node.alwaysAllow), ...strArray(node.autoApprove), ...strArray(node.autoApproved)];
}
function hostOf(url: string): string | undefined {
  try { return new URL(url).host; } catch { return undefined; }
}

const SHELL_HINTS = ['sh', 'bash', 'zsh', 'cmd', 'powershell', 'pwsh', 'exec', 'shell', 'node', 'python', 'deno', 'bun'];

/** Defensive parse of an MCP settings document → normalized, redacted policy. */
export function parseMcpPolicyConfig(json: unknown): McpPolicy {
  const root = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const serversNode = root.mcpServers && typeof root.mcpServers === 'object'
    ? (root.mcpServers as Record<string, unknown>)
    : {};
  const servers: McpServerPolicy[] = [];
  for (const [name, raw] of Object.entries(serversNode)) {
    const node = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const url = str(node.url);
    const command = str(node.command);
    const isRemote = !!url || /^(sse|http|streamable-http|websocket)$/i.test(str(node.type) ?? '');
    const envKeys = node.env && typeof node.env === 'object' && !Array.isArray(node.env)
      ? Object.keys(node.env as Record<string, unknown>)
      : [];
    servers.push({
      name,
      transport: isRemote ? 'remote' : 'local',
      command: command ? command.split(/[\\/]/).pop() : undefined, // basename only
      urlHost: url ? hostOf(url) : undefined,
      autoApprove: readAutoApprove(node),
      envKeys,
    });
  }
  return { servers, globalAutoApprove: readAutoApprove(root) };
}

export interface PolicyRisk { id: string; title: string; severity: RiskSeverity; source: 'mcp-policy'; status: 'open'; provenance: Record<string, unknown> }

function isShellCapable(s: McpServerPolicy): boolean {
  const cmd = (s.command ?? '').toLowerCase();
  if (SHELL_HINTS.some((h) => cmd === h || cmd === `${h}.exe`)) return true;
  return s.autoApprove.some((t) => SHELL_HINTS.some((h) => t.toLowerCase().includes(h)) || /shell|exec|terminal|command|run/i.test(t));
}

/** Flag risky MCP posture for one agent's parsed policy → keyed risk records. */
export function flagMcpRisks(policy: McpPolicy, agent: string): PolicyRisk[] {
  const risks: PolicyRisk[] = [];
  const add = (server: string, flag: string, severity: RiskSeverity, title: string, detail: Record<string, unknown>) =>
    risks.push({ id: `mcp-policy:${agent}:${server}:${flag}`, title, severity, source: 'mcp-policy', status: 'open', provenance: { agent, server, flag, ...detail } });

  const wildcardGlobal = policy.globalAutoApprove.includes('*');
  if (wildcardGlobal) add('*', 'wildcard-auto-approve', 'high', `${agent}: wildcard auto-approval (all tools)`, { scope: 'global' });

  for (const s of policy.servers) {
    if (s.autoApprove.includes('*')) add(s.name, 'wildcard-auto-approve', 'high', `${agent}: server "${s.name}" auto-approves all tools (*)`, { transport: s.transport });
    if (s.transport === 'remote') add(s.name, 'remote-mcp', 'warn', `${agent}: remote MCP server "${s.name}"${s.urlHost ? ` (${s.urlHost})` : ''}`, { urlHost: s.urlHost });
    if (isShellCapable(s)) add(s.name, 'shell-capable', 'high', `${agent}: shell/exec-capable MCP server "${s.name}"`, { command: s.command });
    if (!s.autoApprove.includes('*') && s.autoApprove.length > 0) add(s.name, 'broad-auto-approve', 'info', `${agent}: server "${s.name}" auto-approves ${s.autoApprove.length} tool(s)`, { count: s.autoApprove.length });
  }
  return risks;
}

/** Audit one agent's config text → risk records (parse + flag). Dedup by id. */
export function auditMcpConfig(agent: string, text: string): PolicyRisk[] {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return []; }
  const policy = parseMcpPolicyConfig(json);
  const seen = new Set<string>();
  const out: PolicyRisk[] = [];
  for (const r of flagMcpRisks(policy, agent)) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
