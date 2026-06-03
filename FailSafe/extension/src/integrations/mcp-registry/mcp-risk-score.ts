/**
 * mcp-risk-score — local risk scoring for MCP Registry metadata (B-INT-9 / #108, v1).
 *
 * Per the contract review (INTEGRATION_MCP_REGISTRY_CONTRACT_REVIEW.md): the
 * registry is a good read-only discovery + LOCAL-scoring source and a bad v1
 * install surface. This module is the day-one value: pure, offline risk scoring
 * over a server's registry metadata + a sanitizer for the registry's stored-XSS
 * advisory (render every registry field as inert text). No network, no install.
 *
 * Pure (no fs/network) → deterministically testable; `now` is injected.
 */

export interface McpServerMeta {
  name: string;
  publisher?: string;          // or verified namespace owner
  repositoryUrl?: string;
  transports?: string[];       // e.g. ['stdio'] | ['streamable-http']
  version?: string;
  publishedAt?: string;        // ISO date of the cited version
  tools?: Array<{ name: string } | string>;
}

export type RiskSeverity = 'low' | 'med' | 'high';
export interface McpRiskSignal { id: string; severity: RiskSeverity; detail: string }
export interface McpRiskAssessment { score: number; level: RiskSeverity; signals: McpRiskSignal[] }

const WEIGHT: Record<RiskSeverity, number> = { low: 1, med: 2, high: 3 };
const REMOTE_TRANSPORTS = new Set(['http', 'https', 'sse', 'streamable-http', 'streamablehttp']);
const DANGEROUS_TOOL_RE = /(write|delete|remove|exec|shell|eval|spawn|sudo|run[_-]?command|kill|chmod|rmdir|unlink)/i;
const DEFAULT_STALE_DAYS = 365;

function toolName(t: { name: string } | string): string {
  return typeof t === 'string' ? t : (t?.name ?? '');
}

/** Local risk assessment from registry metadata. Higher score = higher risk. */
export function scoreMcpServer(meta: McpServerMeta, opts?: { now?: Date; staleDays?: number }): McpRiskAssessment {
  const now = opts?.now ?? new Date();
  const staleDays = opts?.staleDays ?? DEFAULT_STALE_DAYS;
  const signals: McpRiskSignal[] = [];

  if (!meta.publisher || !meta.publisher.trim()) {
    signals.push({ id: 'unknown-publisher', severity: 'med', detail: 'no verified publisher/namespace on the registry entry' });
  }
  if (!meta.repositoryUrl || !meta.repositoryUrl.trim()) {
    signals.push({ id: 'missing-repository', severity: 'med', detail: 'no source repository link to audit' });
  }
  const transports = (meta.transports ?? []).map((t) => t.toLowerCase());
  if (transports.some((t) => REMOTE_TRANSPORTS.has(t))) {
    signals.push({ id: 'remote-transport', severity: 'med', detail: `remote transport broadens attack surface vs stdio (${transports.join(', ')})` });
  }
  const dangerous = (meta.tools ?? []).map(toolName).filter((n) => DANGEROUS_TOOL_RE.test(n));
  if (dangerous.length) {
    signals.push({ id: 'broad-tool-names', severity: 'high', detail: `mutating/exec-capable tool name(s): ${dangerous.join(', ')}` });
  }
  if (meta.publishedAt) {
    const published = new Date(meta.publishedAt);
    const ageDays = Number.isNaN(published.getTime()) ? null : Math.floor((now.getTime() - published.getTime()) / 86_400_000);
    if (ageDays !== null && ageDays > staleDays) {
      signals.push({ id: 'stale-version', severity: 'low', detail: `cited version published ${ageDays}d ago (> ${staleDays}d)` });
    }
  } else {
    signals.push({ id: 'unknown-recency', severity: 'low', detail: 'no publish date to assess version recency' });
  }

  const score = signals.reduce((acc, s) => acc + WEIGHT[s.severity], 0);
  const level: RiskSeverity = signals.some((s) => s.severity === 'high') || score >= 6 ? 'high' : score >= 3 ? 'med' : 'low';
  return { score, level, signals };
}

/**
 * Render a registry-returned string as inert text — escape HTML and neutralize
 * active URI schemes — to close the registry stored-XSS advisory before display.
 */
export function sanitizeField(value: string): string {
  if (value == null) return '';
  let s = String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  s = s.replace(/\b(javascript|data|vbscript):/gi, 'blocked:');
  return s;
}
