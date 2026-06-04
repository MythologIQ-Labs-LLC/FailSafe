/**
 * linear-import — pure logic for FailSafe's read-only Linear issue → intent
 * preview import (B-INT-11 / #97, v1). Per the contract review
 * (INTEGRATION_LINEAR_CONTRACT_REVIEW.md): READ-ONLY. v1 resolves a Linear issue
 * URL or bare identifier → fetches the canonical fields → presents an
 * UNCOMMITTED intent preview. NO mutation, NO webhooks (phase two). The auth
 * token is a secret handled only by the injectable transport (linear-client.ts);
 * none of these pure functions ever see or carry it.
 *
 * All four pieces are pure (no fs/network/secrets) → deterministically tested.
 */

/** A Linear issue identifier is a team key + number, e.g. ENG-123. Case-insensitive
 *  so a lowercased paste (`eng-123`) still resolves; the result is upper-cased. */
const IDENTIFIER_RE = /\b([A-Za-z][A-Za-z0-9]*-\d+)\b/;

/**
 * Resolve a Linear issue URL or a bare identifier to the canonical identifier.
 *   https://linear.app/acme/issue/ENG-123            → ENG-123
 *   https://linear.app/acme/issue/ENG-123/some-slug  → ENG-123
 *   ENG-123                                          → ENG-123
 * Returns null for anything without a valid identifier (rejects garbage).
 */
export function parseLinearIssueId(input: string): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  // URL form: pull the segment right after /issue/.
  const urlMatch = /\/issue\/([A-Z][A-Z0-9]*-\d+)(?:[/?#]|$)/i.exec(s);
  if (urlMatch) return urlMatch[1].toUpperCase();
  // Bare identifier (must be the whole token, not embedded in prose noise).
  const m = IDENTIFIER_RE.exec(s);
  if (m && /^[A-Za-z0-9-]+$/.test(s)) return m[1].toUpperCase();
  return null;
}

/** The canonical fields v1 reads. `issue(id:)` resolves either the UUID or the
 *  human identifier (ENG-123) per Linear's documented behavior. */
export const LINEAR_ISSUE_QUERY =
  'query FailSafeIssue($id: String!) { issue(id: $id) { ' +
  'identifier title description priority url ' +
  'state { name type } assignee { name } labels { nodes { name } } } }';

export interface LinearGraphQLRequest { query: string; variables: { id: string } }

/** Pure GraphQL request builder for a single issue by identifier. */
export function buildIssueQuery(identifier: string): LinearGraphQLRequest {
  return { query: LINEAR_ISSUE_QUERY, variables: { id: identifier } };
}

export interface CanonicalIssue {
  identifier: string;
  title: string;
  description?: string;
  state?: string;
  priority?: number;
  url?: string;
  assignee?: string;
  labels: string[];
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/**
 * Defensive parse of a Linear GraphQL response → CanonicalIssue. Tolerates
 * missing/null fields (Linear omits null relations); returns null when there is
 * no issue node (not found / GraphQL error). Never reads anything beyond the
 * canonical fields, so no secret/token in the response could leak through.
 */
export function parseIssueResponse(json: unknown): CanonicalIssue | null {
  const root = (json && typeof json === 'object') ? (json as Record<string, unknown>) : null;
  const data = root && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null;
  const issue = data && data.issue && typeof data.issue === 'object' ? (data.issue as Record<string, unknown>) : null;
  if (!issue) return null;
  const identifier = str(issue.identifier);
  if (!identifier) return null;

  const state = issue.state && typeof issue.state === 'object' ? (issue.state as Record<string, unknown>) : null;
  const assignee = issue.assignee && typeof issue.assignee === 'object' ? (issue.assignee as Record<string, unknown>) : null;
  const labelsNode = issue.labels && typeof issue.labels === 'object' ? (issue.labels as Record<string, unknown>) : null;
  const labelNodes = labelsNode && Array.isArray(labelsNode.nodes) ? (labelsNode.nodes as unknown[]) : [];
  const labels = labelNodes
    .map((n) => (n && typeof n === 'object' ? str((n as Record<string, unknown>).name) : undefined))
    .filter((n): n is string => !!n);

  return {
    identifier,
    title: str(issue.title) ?? '(untitled)',
    description: str(issue.description),
    state: state ? str(state.name) : undefined,
    priority: typeof issue.priority === 'number' ? issue.priority : undefined,
    url: str(issue.url),
    assignee: assignee ? str(assignee.name) : undefined,
    labels,
  };
}

export interface LinearIntentPreview {
  source: 'linear';
  /** UNCOMMITTED: this preview is shown to the operator; nothing is persisted. */
  committed: false;
  identifier: string;
  title: string;
  /** A concise intent line derived from the issue (no raw secrets, by construction). */
  intent: string;
  description?: string;
  state?: string;
  priority?: number;
  assignee?: string;
  labels: string[];
  url?: string;
}

const PRIORITY_LABEL = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];

/** Pure mapper: canonical issue → an UNCOMMITTED FailSafe intent preview. */
export function toIntentPreview(issue: CanonicalIssue): LinearIntentPreview {
  const prio = typeof issue.priority === 'number' ? PRIORITY_LABEL[issue.priority] ?? undefined : undefined;
  const bits = [issue.identifier, issue.title].filter(Boolean);
  return {
    source: 'linear',
    committed: false,
    identifier: issue.identifier,
    title: issue.title,
    intent: bits.join(' — '),
    description: issue.description,
    state: issue.state,
    priority: issue.priority,
    assignee: issue.assignee,
    labels: issue.labels,
    url: issue.url,
    ...(prio ? { priorityLabel: prio } : {}),
  } as LinearIntentPreview;
}
