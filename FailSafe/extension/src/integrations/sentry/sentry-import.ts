/**
 * sentry-import — the Sentry import outcome (#478, LD4/LD6/LD8).
 *
 * Stage order: list every page -> parse (count skipped) -> dedupe (count
 * duplicates) -> issue-detail release lookups -> write. Each record is merged
 * and written in one synchronous store call (`upsertWith`), so a risk the
 * operator closed or edited — even during the lookups — keeps its status and
 * fields; only the Sentry-owned fields are replaced. Nothing is written when
 * the list fails or the import is cancelled. The outcome counts what actually
 * happened: created / updated / unchanged / failed per unique issue.
 */

import { fetchSentryIssues, type ListDeps, type SentryGetFn, type SentryOptions } from './sentry-client';
import { carriedRelease, lookupReleases, type LookupResult, type ReleaseProvenance } from './sentry-releases';
import { parseSentryIssue, sentryIssueToRisk, type CanonicalSentryIssue } from './sentry-to-risk';
import type { UpsertOptions, UpsertOutcome } from '../../roadmap/services/RiskRegisterManager';

export type ImportCtx = ListDeps;

export interface RiskSink {
  upsertWith(id: string, build: (stored: Record<string, unknown> | undefined) => Record<string, unknown>, opts: UpsertOptions): UpsertOutcome;
}

export interface ReleaseCounts {
  enriched: number; none: number; failed: number; notAttempted: number; carried: number; discarded: number;
  stoppedBy?: 'rate_limited' | 'failures' | 'cancelled';
}

export interface SentryImportOutcome {
  ok: boolean;
  localOnly?: boolean;
  cancelled?: boolean;
  error?: string;
  status?: number;
  pagesFetched: number;
  nextCursor?: string;
  fetched: number;
  eligible: number;
  skipped: number;
  skippedReasons: string[];
  duplicates: number;
  unique: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  releases: ReleaseCounts;
}

const SENTRY_OWNED = ['id', 'title', 'severity', 'source', 'location', 'provenance', 'updatedAt'];
const IGNORE = ['updatedAt', 'provenance.release.verifiedAt'];
const MAX_REASONS = 20;

function blankOutcome(): SentryImportOutcome {
  return {
    ok: false, pagesFetched: 0, fetched: 0, eligible: 0, skipped: 0, skippedReasons: [], duplicates: 0, unique: 0,
    created: 0, updated: 0, unchanged: 0, failed: 0,
    releases: { enriched: 0, none: 0, failed: 0, notAttempted: 0, carried: 0, discarded: 0 },
  };
}

/** Parse and dedupe list items, counting what was skipped and repeated. */
export function collectEligible(items: unknown[], environment: string | undefined, out: SentryImportOutcome): CanonicalSentryIssue[] {
  const seen = new Set<string>();
  const unique: CanonicalSentryIssue[] = [];
  items.forEach((item, i) => {
    const issue = parseSentryIssue(item, environment);
    if (!issue) {
      out.skipped++;
      if (out.skippedReasons.length < MAX_REASONS) {
        out.skippedReasons.push(`item ${i + 1}: ${item && typeof item === 'object' ? 'no id' : 'not an object'}`);
      }
      return;
    }
    out.eligible++;
    if (seen.has(issue.id)) { out.duplicates++; return; }
    seen.add(issue.id);
    unique.push(issue);
  });
  out.unique = unique.length;
  return unique;
}

type ReleaseChoice = { release?: ReleaseProvenance; tally?: 'carried' | 'discarded' };

/** Fresh lookup wins; otherwise keep a stored release only in the exact detail shape. */
function chooseRelease(lookup: LookupResult | undefined, storedRelease: unknown): ReleaseChoice {
  if (lookup?.kind === 'enriched') return { release: lookup.release };
  if (lookup?.kind === 'none' || storedRelease === undefined) return {};
  const carried = carriedRelease(storedRelease);
  return carried ? { release: carried, tally: 'carried' } : { tally: 'discarded' };
}

/** Merge Sentry-owned fields over the record stored at write time (LD6). */
export function buildRecord(issue: CanonicalSentryIssue, lookup: LookupResult | undefined, importedAt: string, note: (c: ReleaseChoice) => void) {
  return (stored: Record<string, unknown> | undefined): Record<string, unknown> => {
    const storedProv = stored?.provenance as Record<string, unknown> | undefined;
    const choice = chooseRelease(lookup, storedProv?.release);
    note(choice);
    const kept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(stored ?? {})) if (!SENTRY_OWNED.includes(k)) kept[k] = v;
    if (typeof kept.status !== 'string') kept.status = 'open';
    return { ...kept, ...sentryIssueToRisk(issue, { release: choice.release, importedAt }) };
  };
}

function writeRecords(issues: CanonicalSentryIssue[], lookups: Map<string, LookupResult>, sink: RiskSink, importedAt: string, out: SentryImportOutcome): void {
  for (const issue of issues) {
    let choice: ReleaseChoice = {};
    try {
      const result = sink.upsertWith(`sentry:${issue.id}`, buildRecord(issue, lookups.get(issue.id), importedAt, (c) => { choice = c; }), { ignore: IGNORE });
      out[result]++;
      if (choice.tally) out.releases[choice.tally]++;
    } catch {
      out.failed++;
    }
  }
}

function countLookups(byId: Map<string, LookupResult>, out: SentryImportOutcome): void {
  for (const r of byId.values()) out.releases[r.kind]++;
}

/** Fetch, look up releases and write; see the module comment for the stage order. */
export async function importSentryRisks(opts: SentryOptions, get: SentryGetFn, sink: RiskSink, ctx: ImportCtx): Promise<SentryImportOutcome> {
  const out = blankOutcome();
  const list = await fetchSentryIssues(opts, get, ctx);
  Object.assign(out, { pagesFetched: list.pagesFetched, nextCursor: list.nextCursor, status: list.status, error: list.error, cancelled: list.cancelled, localOnly: list.localOnly });
  if (!list.ok || list.localOnly || !list.ctx || !list.org) return { ...out, ok: list.ok };
  out.fetched = list.items.length;
  const issues = collectEligible(list.items, opts.environment?.trim() || undefined, out);
  const importedAt = new Date(ctx.policy.now()).toISOString();
  const lookups = await lookupReleases(issues, {
    org: list.org, max: opts.maxReleaseLookups ?? 50, token: opts.token?.trim() ?? '', get, ctx: list.ctx, verifiedAt: importedAt,
  });
  out.releases.stoppedBy = lookups.stoppedBy;
  countLookups(lookups.byId, out);
  if (ctx.cancel.cancelled) return { ...out, ok: false, cancelled: true, error: 'Sentry import cancelled.' };
  writeRecords(issues, lookups.byId, sink, importedAt, out);
  return { ...out, ok: true };
}
