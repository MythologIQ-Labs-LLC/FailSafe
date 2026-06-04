/**
 * sentry-to-risk — pure mapping from Sentry issues to FailSafe runtime-regression
 * risk records (#102). Mirrors the SARIF ingest shape: defensive parse → canonical
 * issue → risk record for RiskRegisterManager.upsertRisk (keyed-idempotent by
 * `id`, so re-importing the same Sentry project upserts rather than duplicates).
 * WARN-only governance signal (status 'open'; the operator triages).
 *
 * Privacy: reads ONLY the canonical fields named below — NEVER the raw event
 * payload (acceptance: "No raw event payloads are stored unless explicitly
 * enabled"). Release / suspect-commit are included only when present on the
 * issue object (tolerant of the common case where they are absent on the
 * project-issues list endpoint).
 */

/** FailSafe risk severity vocabulary (shared with the SARIF ingest). */
export type RiskSeverity = 'high' | 'warn' | 'info';

/** Sentry `level` → FailSafe risk severity. Unknown → 'warn' (fail-safe). */
const LEVEL_TO_SEVERITY: Record<string, RiskSeverity> = {
  fatal: 'high', error: 'high', warning: 'warn', info: 'info', debug: 'info', sample: 'info',
};

export function sentryLevelToSeverity(level: string | undefined): RiskSeverity {
  return LEVEL_TO_SEVERITY[(level || '').toLowerCase()] ?? 'warn';
}

export interface CanonicalSentryIssue {
  id: string;
  title: string;
  culprit?: string;
  level?: string;
  status?: string;
  sourceUrl?: string;
  project?: string;
  environment?: string;
  release?: string;
  suspectCommit?: string;
  firstSeen?: string;
  lastSeen?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Defensively read a release version from the issue's first/last-release nodes.
 *  NOTE: `firstRelease`/`lastRelease` are present only on the issue-DETAIL
 *  endpoint (`/issues/{id}/`), NOT on the project-issues LIST endpoint this
 *  client calls — so on the v1 list path this is always undefined. Kept so a
 *  future detail-enrichment pass populates it without a schema change. Verified
 *  against docs.sentry.io/api/events/retrieve-an-issue/. */
function readRelease(issue: Record<string, unknown>): string | undefined {
  for (const k of ['lastRelease', 'firstRelease'] as const) {
    const node = issue[k];
    if (node && typeof node === 'object') {
      const v = str((node as Record<string, unknown>).version);
      if (v) return v;
    }
  }
  return undefined;
}

/** Defensively read a suspect-commit id ONLY if a caller pre-enriched the issue.
 *  Sentry does NOT expose a `suspectCommits` array on the issues-list or
 *  issue-detail response (suspect commits come from a separate committers
 *  surface); this never populates from the v1 list path and is inert unless an
 *  enrichment caller attaches it. Acceptance #102 "suspect commit if present"
 *  is satisfied by absence. Not a documented field — treat as opportunistic. */
function readSuspectCommit(issue: Record<string, unknown>): string | undefined {
  const sc = issue.suspectCommit ?? issue.suspectCommits;
  if (typeof sc === 'string') return str(sc);
  if (Array.isArray(sc) && sc.length) {
    const first = sc[0];
    if (first && typeof first === 'object') {
      const c = first as Record<string, unknown>;
      return str(c.id) ?? (c.commit && typeof c.commit === 'object' ? str((c.commit as Record<string, unknown>).id) : undefined);
    }
    if (typeof first === 'string') return str(first);
  }
  return undefined;
}

/** Parse one Sentry issue object → CanonicalSentryIssue (null when no id). */
export function parseSentryIssue(raw: unknown, environment?: string): CanonicalSentryIssue | null {
  const issue = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!issue) return null;
  const id = str(issue.id);
  if (!id) return null;
  const project = issue.project && typeof issue.project === 'object'
    ? str((issue.project as Record<string, unknown>).slug)
    : str(issue.project);
  return {
    id,
    title: str(issue.title) ?? str(issue.culprit) ?? `Sentry issue ${id}`,
    culprit: str(issue.culprit),
    level: str(issue.level),
    status: str(issue.status),
    sourceUrl: str(issue.permalink),
    project,
    environment: str(issue.environment) ?? environment,
    release: readRelease(issue),
    suspectCommit: readSuspectCommit(issue),
    firstSeen: str(issue.firstSeen),
    lastSeen: str(issue.lastSeen),
  };
}

/** Parse a Sentry project-issues list response (an array) → canonical issues. */
export function parseIssuesResponse(json: unknown, environment?: string): CanonicalSentryIssue[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((i) => parseSentryIssue(i, environment))
    .filter((i): i is CanonicalSentryIssue => !!i);
}

/** Pure mapper: canonical Sentry issue → FailSafe risk record. */
export function sentryIssueToRisk(issue: CanonicalSentryIssue): Record<string, unknown> {
  const provenance: Record<string, unknown> = { tool: 'sentry' };
  if (issue.project) provenance.project = issue.project;
  if (issue.environment) provenance.environment = issue.environment;
  if (issue.release) provenance.release = issue.release;
  if (issue.suspectCommit) provenance.suspectCommit = issue.suspectCommit;
  if (issue.firstSeen) provenance.firstSeen = issue.firstSeen;
  if (issue.lastSeen) provenance.lastSeen = issue.lastSeen;
  if (issue.status) provenance.status = issue.status;

  const risk: Record<string, unknown> = {
    id: `sentry:${issue.id}`,
    title: issue.title.slice(0, 160),
    severity: sentryLevelToSeverity(issue.level),
    source: 'sentry',
    status: 'open',
    provenance,
  };
  if (issue.sourceUrl) risk.location = { url: issue.sourceUrl };
  return risk;
}

/** Map + dedup canonical issues to risk records (first occurrence of each id wins). */
export function sentryIssuesToRisks(issues: CanonicalSentryIssue[]): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const out: Array<Record<string, unknown>> = [];
  for (const issue of issues) {
    const risk = sentryIssueToRisk(issue);
    const id = risk.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(risk);
  }
  return out;
}
