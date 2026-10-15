/**
 * sentry-to-risk — pure mapping from Sentry issues to FailSafe runtime-regression
 * risk records (#102). Mirrors the SARIF ingest shape: defensive parse → canonical
 * issue → risk record for RiskRegisterManager.upsertRisk (keyed-idempotent by
 * `id`, so re-importing the same Sentry project upserts rather than duplicates).
 * WARN-only governance signal; the operator triages, and the import never
 * overwrites the triage status (sentry-import.ts).
 *
 * Privacy: reads ONLY the canonical fields named below — NEVER the raw event
 * payload (acceptance: "No raw event payloads are stored unless explicitly
 * enabled"). Release data comes only from issue-detail responses
 * (sentry-releases.ts), never from list items; no commit correlation (#478).
 */

import type { ReleaseProvenance } from './sentry-releases';

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
  shortId?: string;
  title: string;
  culprit?: string;
  level?: string;
  status?: string;
  sourceUrl?: string;
  project?: string;
  environment?: string;
  firstSeen?: string;
  lastSeen?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
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
    shortId: str(issue.shortId),
    title: str(issue.title) ?? str(issue.culprit) ?? `Sentry issue ${id}`,
    culprit: str(issue.culprit),
    level: str(issue.level),
    status: str(issue.status),
    sourceUrl: str(issue.permalink),
    project,
    environment: str(issue.environment) ?? environment,
    firstSeen: str(issue.firstSeen),
    lastSeen: str(issue.lastSeen),
  };
}

/**
 * Pure mapper: canonical Sentry issue -> the Sentry-owned fields of a risk
 * record (#478 LD6). No `status`: that belongs to whoever triages the risk.
 * `release` is set only from an issue-detail lookup.
 */
export function sentryIssueToRisk(
  issue: CanonicalSentryIssue,
  extra: { release?: ReleaseProvenance; importedAt: string },
): Record<string, unknown> {
  const provenance: Record<string, unknown> = { tool: 'sentry' };
  const fields: Array<[string, string | undefined]> = [
    ['project', issue.project], ['environment', issue.environment], ['shortId', issue.shortId],
    ['status', issue.status], ['firstSeen', issue.firstSeen], ['lastSeen', issue.lastSeen],
  ];
  for (const [k, v] of fields) if (v) provenance[k] = v;
  if (extra.release) provenance.release = extra.release;

  const risk: Record<string, unknown> = {
    id: `sentry:${issue.id}`,
    title: issue.title.slice(0, 160),
    severity: sentryLevelToSeverity(issue.level),
    source: 'sentry',
    provenance,
    updatedAt: extra.importedAt,
  };
  if (issue.sourceUrl) risk.location = { url: issue.sourceUrl };
  return risk;
}
