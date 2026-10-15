/**
 * sentry-releases — release association from Sentry issue-detail responses
 * (#478, LD5). List responses carry no release fields, so each issue needs
 * `GET {base}/api/0/organizations/{org}/issues/{id}/`, whose `firstRelease` /
 * `lastRelease` hold the versions. Lookups are capped per import, run in list
 * order, and stop at a rate limit, a cancellation, or three consecutive
 * failures. Release data is recorded only from a detail response, tagged with
 * its source and the time of the lookup; nothing is inferred.
 */

import type { CanonicalSentryIssue } from './sentry-to-risk';
import { requestWithRetry, type SentryGetFn, type TransportCtx } from './sentry-transport';

export const RELEASE_SOURCE = 'sentry-issue-detail';
const RELEASE_KEYS = new Set(['source', 'first', 'last', 'lastReleasedAt', 'ref', 'verifiedAt']);
const STOP_AFTER_FAILURES = 3;

export interface ReleaseProvenance {
  source: typeof RELEASE_SOURCE;
  first?: string;
  last?: string;
  lastReleasedAt?: string;
  ref?: string;
  verifiedAt: string;
}

export type LookupResult = { kind: 'enriched'; release: ReleaseProvenance } | { kind: 'none' } | { kind: 'failed' } | { kind: 'notAttempted' };

export interface ReleaseLookups {
  byId: Map<string, LookupResult>;
  stoppedBy?: 'rate_limited' | 'failures' | 'cancelled';
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const obj = (v: unknown): Record<string, unknown> | undefined =>
  (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** Classify a 200 detail body: enriched, none (both releases null), or failed. */
export function parseDetail(body: string, verifiedAt: string): LookupResult {
  let issue: Record<string, unknown> | undefined;
  try { issue = obj(JSON.parse(body)); } catch { return { kind: 'failed' }; }
  if (!issue || !('firstRelease' in issue) || !('lastRelease' in issue)) return { kind: 'failed' };
  const first = obj(issue.firstRelease);
  const last = obj(issue.lastRelease);
  if (issue.firstRelease === null && issue.lastRelease === null) return { kind: 'none' };
  if (!str(first?.version) && !str(last?.version)) return { kind: 'failed' };
  const release: ReleaseProvenance = { source: RELEASE_SOURCE, verifiedAt };
  const fields: Array<[keyof ReleaseProvenance, unknown]> = [
    ['first', first?.version], ['last', last?.version], ['lastReleasedAt', last?.dateReleased], ['ref', last?.ref],
  ];
  for (const [k, v] of fields) if (str(v)) (release as unknown as Record<string, unknown>)[k] = v;
  return { kind: 'enriched', release };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** A stored release may be carried forward only in exactly the shape a detail lookup writes. */
export function carriedRelease(stored: unknown): ReleaseProvenance | undefined {
  const r = obj(stored);
  if (!r || r.source !== RELEASE_SOURCE || typeof r.verifiedAt !== 'string' || !ISO.test(r.verifiedAt)) return undefined;
  if (Object.keys(r).some((k) => !RELEASE_KEYS.has(k))) return undefined;
  for (const k of ['first', 'last', 'lastReleasedAt', 'ref']) {
    if (r[k] !== undefined && typeof r[k] !== 'string') return undefined;
  }
  return r as unknown as ReleaseProvenance;
}

interface LookupArgs { org: string; max: number; token: string; get: SentryGetFn; ctx: TransportCtx; verifiedAt: string }

async function lookupOne(id: string, a: LookupArgs): Promise<LookupResult | 'rate_limited' | 'cancelled'> {
  const url = `${a.ctx.base}/api/0/organizations/${encodeURIComponent(a.org)}/issues/${id}/`;
  const r = await requestWithRetry(url, { Accept: 'application/json', Authorization: `Bearer ${a.token}`, 'User-Agent': 'FailSafe' }, a.get, a.ctx);
  if (r.kind === 'rate_limited' || r.kind === 'cancelled') return r.kind;
  return r.kind === 'ok' ? parseDetail(r.res.body, a.verifiedAt) : { kind: 'failed' };
}

/** Detail lookups for deduplicated issues, in list order, under the cap and stop rules. */
export async function lookupReleases(issues: CanonicalSentryIssue[], a: LookupArgs): Promise<ReleaseLookups> {
  const out: ReleaseLookups = { byId: new Map() };
  let attempted = 0;
  let consecutiveFailures = 0;
  for (const issue of issues) {
    if (out.stoppedBy || attempted >= a.max || !/^\d+$/.test(issue.id)) {
      out.byId.set(issue.id, { kind: 'notAttempted' });
      continue;
    }
    const r = await lookupOne(issue.id, a);
    if (r === 'rate_limited' || r === 'cancelled') {
      out.stoppedBy = r;
      out.byId.set(issue.id, { kind: 'notAttempted' });
      continue;
    }
    attempted++;
    out.byId.set(issue.id, r);
    consecutiveFailures = r.kind === 'failed' ? consecutiveFailures + 1 : 0;
    if (consecutiveFailures >= STOP_AFTER_FAILURES) out.stoppedBy = 'failures';
  }
  return out;
}
