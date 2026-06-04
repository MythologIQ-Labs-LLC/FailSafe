/**
 * jira-import — pure logic for FailSafe's read-only Jira Cloud issue → intent
 * preview import (#98, v1). Mirrors the Linear import shape. READ-ONLY: resolve
 * a Jira issue URL or bare key → fetch the canonical fields → present an
 * UNCOMMITTED intent preview. NO mutation, NO webhooks (phase two). The API
 * token is a secret handled only by the injectable transport (jira-client.ts);
 * none of these pure functions ever see or carry it.
 *
 * Uses the Jira Cloud REST v2 issue resource (description returned as a string,
 * not ADF) so the preview is a plain summary. Defensive field access: tolerates
 * missing/null fields and ignores unknown custom fields (no schema assumption).
 */

/** A Jira issue key is PROJECTKEY-NUMBER, e.g. PROJ-123 / AB1-7. */
const KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

/**
 * Resolve a Jira issue URL or a bare key to the canonical issue key.
 *   https://site.atlassian.net/browse/PROJ-123        → PROJ-123
 *   https://site.atlassian.net/browse/PROJ-123?x=1     → PROJ-123
 *   PROJ-123                                           → PROJ-123
 * Returns null for anything without a valid key (rejects garbage).
 */
export function parseJiraIssueKey(input: string): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  // URL form: pull the segment after /browse/.
  const urlMatch = /\/browse\/([A-Za-z][A-Za-z0-9]+-\d+)(?:[/?#]|$)/.exec(s);
  if (urlMatch) return urlMatch[1].toUpperCase();
  // Bare key (must be the whole token, not embedded in prose noise).
  const m = KEY_RE.exec(s.toUpperCase());
  if (m && /^[A-Za-z0-9-]+$/.test(s)) return m[1].toUpperCase();
  return null;
}

/** Canonical fields v1 reads, requested explicitly to keep the payload small. */
export const JIRA_ISSUE_FIELDS = ['summary', 'description', 'status', 'priority', 'assignee', 'labels', 'components'] as const;

/** Pure builder for the issue REST path (v2 → string description). */
export function buildIssuePath(key: string): string {
  return `/rest/api/2/issue/${encodeURIComponent(key)}?fields=${JIRA_ISSUE_FIELDS.join(',')}`;
}

export interface CanonicalJiraIssue {
  key: string;
  summary: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  labels: string[];
  components: string[];
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Best-effort plain text from a description that may be a string (v2) or, if a
 *  caller pointed at v3, an ADF document object. Returns undefined when neither. */
function descriptionText(v: unknown): string | undefined {
  const s = str(v);
  if (s) return s;
  // ADF fallback: walk `content[].content[].text` defensively.
  if (v && typeof v === 'object') {
    const parts: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      const t = str(n.text);
      if (t) parts.push(t);
      if (Array.isArray(n.content)) n.content.forEach(walk);
    };
    walk(v);
    const joined = parts.join(' ').trim();
    return joined || undefined;
  }
  return undefined;
}

/**
 * Defensive parse of a Jira issue response → CanonicalJiraIssue. Tolerates
 * missing/null relations and ignores unknown custom fields. Returns null when
 * there is no issue (404 / error body). Never reads beyond the canonical
 * fields, so no token could leak through.
 */
export function parseIssueResponse(json: unknown): CanonicalJiraIssue | null {
  const root = (json && typeof json === 'object') ? (json as Record<string, unknown>) : null;
  if (!root) return null;
  const key = str(root.key);
  if (!key) return null;
  const fields = root.fields && typeof root.fields === 'object' ? (root.fields as Record<string, unknown>) : {};

  const status = fields.status && typeof fields.status === 'object' ? (fields.status as Record<string, unknown>) : null;
  const priority = fields.priority && typeof fields.priority === 'object' ? (fields.priority as Record<string, unknown>) : null;
  const assignee = fields.assignee && typeof fields.assignee === 'object' ? (fields.assignee as Record<string, unknown>) : null;

  const labels = Array.isArray(fields.labels)
    ? (fields.labels as unknown[]).map(str).filter((l): l is string => !!l)
    : [];
  const components = Array.isArray(fields.components)
    ? (fields.components as unknown[])
        .map((c) => (c && typeof c === 'object' ? str((c as Record<string, unknown>).name) : undefined))
        .filter((c): c is string => !!c)
    : [];

  return {
    key,
    summary: str(fields.summary) ?? '(no summary)',
    description: descriptionText(fields.description),
    status: status ? str(status.name) : undefined,
    priority: priority ? str(priority.name) : undefined,
    assignee: assignee ? (str(assignee.displayName) ?? str(assignee.name)) : undefined,
    labels,
    components,
  };
}

export interface JiraIntentPreview {
  source: 'jira';
  /** UNCOMMITTED: shown to the operator; nothing is persisted. */
  committed: false;
  key: string;
  summary: string;
  /** A concise intent line derived from the issue (no raw secrets, by construction). */
  intent: string;
  /** The human browse URL for the issue (acceptance: preview shows source URL). */
  sourceUrl?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  labels: string[];
  components: string[];
}

/** Pure mapper: canonical issue → an UNCOMMITTED FailSafe intent preview. */
export function toIntentPreview(issue: CanonicalJiraIssue, baseUrl?: string): JiraIntentPreview {
  const base = baseUrl ? baseUrl.replace(/\/$/, '') : undefined;
  return {
    source: 'jira',
    committed: false,
    key: issue.key,
    summary: issue.summary,
    intent: [issue.key, issue.summary].filter(Boolean).join(' — '),
    sourceUrl: base ? `${base}/browse/${issue.key}` : undefined,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
    labels: issue.labels,
    components: issue.components,
  };
}
