/**
 * sentry-client — read-only listing of a Sentry project's issues (#102, #478).
 *
 * Lists `GET {base}/api/0/organizations/{org}/issues/` (the project-issues
 * endpoint is deprecated) filtered by project, with `sort=date` pinned because
 * Sentry documents no default order. Every request goes through
 * `requestWithRetry`, which waits on rate limits, retries transient failures
 * and refuses anything outside the configured HTTPS base. Off-by-default: with
 * no token/org/project (or disabled) nothing is requested. The token is sent
 * only as the Authorization header and never returned or logged.
 */

import {
  defaultSentryGet, header, normalizeBase, RateLimiter, requestWithRetry,
  type CancelSignal, type RetryPolicy, type SentryGetFn, type TransportCtx, type TransportResult,
} from './sentry-transport';

export { defaultSentryGet };
export type { SentryGetFn };

const SENTRY_API = 'https://sentry.io';
const ORG_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface SentryOptions {
  enabled: boolean;
  token?: string;
  org?: string;
  project?: string;
  environment?: string;
  apiBaseUrl?: string;
  /** `is:unresolved` by default — limits import to live regressions. */
  query?: string;
  /** Bounded multi-page import. Default 10, hard cap 20. */
  maxPages?: number;
  /** Issue-detail lookups per import (LD5). */
  maxReleaseLookups?: number;
}

export interface ListDeps { policy: RetryPolicy; cancel: CancelSignal }

export interface ListResult {
  ok: boolean;
  localOnly?: boolean;
  cancelled?: boolean;
  error?: string;
  status?: number;
  items: unknown[];
  pagesFetched: number;
  /** `cursor` of the first page not fetched, when the listing stopped early. */
  nextCursor?: string;
  /** Validated request context, reused for issue-detail lookups. */
  ctx?: TransportCtx;
  org?: string;
}

/** Organization-issues path + query for one project. */
export function buildIssuesPath(org: string, project: string, opts: { environment?: string; query?: string } = {}): string {
  const params = new URLSearchParams();
  params.set('project', project);
  params.set('query', opts.query?.trim() || 'is:unresolved');
  params.set('sort', 'date');
  params.set('limit', '100');
  const env = opts.environment?.trim();
  if (env) params.set('environment', env);
  return `/api/0/organizations/${encodeURIComponent(org)}/issues/?${params.toString()}`;
}

/** Treat Sentry's Link URL as an untrusted cursor carrier, not a new import scope.
 * Cursor-only Link URLs are supported, but returned filters can only repeat
 * values from the original request. All requests retain their original filters. */
export function nextSentryPage(link: string | undefined, currentUrl: string, firstUrl: string): string | null {
  if (!link) return null;
  const first = new URL(firstUrl);
  const originalFilters = new URLSearchParams(first.search);
  if (originalFilters.has('cursor')) throw new Error('Unexpected cursor in initial Sentry request');
  let chosen: string | null = null;
  for (const part of link.split(/,(?=\s*<)/)) {
    if (!/\brel="?next"?(?:;|\s|$)/i.test(part) || !/\bresults="?true"?(?:;|\s|$)/i.test(part)) continue;
    if (chosen !== null) throw new Error('Ambiguous Sentry next page');
    const match = part.match(/<([^>]*)>/);
    if (!match) throw new Error('Malformed Sentry pagination Link');
    const next = new URL(match[1], currentUrl);
    if (next.protocol !== 'https:' || next.origin !== first.origin || next.pathname !== first.pathname ||
        next.username || next.password || next.hash) {
      throw new Error('Untrusted Sentry pagination destination');
    }
    const cursors = next.searchParams.getAll('cursor');
    if (cursors.length !== 1 || !cursors[0] || cursors[0].length > 2048) {
      throw new Error('Invalid Sentry pagination cursor');
    }
    const allowed = [...originalFilters.entries()];
    for (const [key, value] of next.searchParams.entries()) {
      if (key === 'cursor') continue;
      const i = allowed.findIndex(([k, v]) => k === key && v === value);
      if (i < 0) throw new Error('Untrusted Sentry pagination filters');
      allowed.splice(i, 1);
    }
    const target = new URL(first);
    target.searchParams.set('cursor', cursors[0]);
    chosen = target.toString();
  }
  return chosen;
}

const empty = (extra: Partial<ListResult>): ListResult => ({ ok: false, items: [], pagesFetched: 0, ...extra });

const cursorOf = (url: string): string | undefined => new URL(url).searchParams.get('cursor') ?? undefined;

/** Validates settings and builds the request context; nothing is requested here. */
function prepare(opts: SentryOptions, deps: ListDeps): { firstUrl: string; ctx: TransportCtx; org: string } | ListResult {
  if (!opts.enabled) return empty({ ok: true, localOnly: true, error: 'integration disabled' });
  const token = opts.token?.trim(); const org = opts.org?.trim(); const project = opts.project?.trim();
  if (!token || !org || !project) return empty({ ok: true, localOnly: true, error: 'token, org, and project must all be configured' });
  if (!ORG_SLUG.test(org)) return empty({ error: 'Sentry org must be an organization slug; nothing was requested.' });
  let base: string;
  try { base = normalizeBase(opts.apiBaseUrl || SENTRY_API); } catch { return empty({ error: 'Invalid Sentry API base URL.' }); }
  if (!base.startsWith('https:')) return empty({ error: 'Sentry API URL must use HTTPS.' });
  const ctx: TransportCtx = { base, policy: deps.policy, cancel: deps.cancel, limiter: new RateLimiter() };
  return { firstUrl: `${base}${buildIssuesPath(org, project, { environment: opts.environment, query: opts.query })}`, ctx, org };
}

function failure(r: Exclude<TransportResult, { kind: 'ok' }>): Partial<ListResult> {
  switch (r.kind) {
    case 'cancelled': return { cancelled: true, error: 'Sentry import cancelled.' };
    case 'refused': return { error: 'Untrusted or insecure Sentry URL; no risks imported.' };
    case 'rate_limited': return { status: 429, error: 'Sentry rate limit persisted after retries (HTTP 429); no risks imported.' };
    case 'transport': return { error: 'Sentry transport failed; no risks imported.' };
    case 'http':
      if (r.status === 401 || r.status === 403) return { status: r.status, error: 'Sentry auth failed — check token/project scope; no risks imported.' };
      if (r.status === 404) return { status: 404, error: 'Sentry org/project not found (or no access).' };
      return { status: r.status, error: `Sentry returned HTTP ${r.status}; no risks imported.` };
  }
}

type Page = { items: unknown[]; next: string | null } | { fail: Partial<ListResult> };

/** One list page: request, status mapping, JSON shape, trusted Link. */
export async function fetchIssuePage(url: string, firstUrl: string, token: string, get: SentryGetFn, ctx: TransportCtx): Promise<Page> {
  const r = await requestWithRetry(url, { Accept: 'application/json', Authorization: `Bearer ${token}`, 'User-Agent': 'FailSafe' }, get, ctx);
  if (r.kind !== 'ok') return { fail: failure(r) };
  let page: unknown;
  try { page = JSON.parse(r.res.body); } catch { return { fail: { error: 'Invalid JSON from Sentry; no risks imported.' } }; }
  if (!Array.isArray(page)) return { fail: { error: 'Unexpected Sentry issue list; no risks imported.' } };
  try {
    return { items: page, next: nextSentryPage(header(r.res, 'link'), url, firstUrl) };
  } catch {
    return { fail: { error: 'Untrusted or malformed Sentry pagination; no risks imported.' } };
  }
}

/** Every page of the project's issues, or a failure with nothing returned. */
export async function fetchSentryIssues(opts: SentryOptions, get: SentryGetFn, deps: ListDeps): Promise<ListResult> {
  const prep = prepare(opts, deps);
  if (!('firstUrl' in prep)) return prep;
  const maxPages = Math.max(1, Math.min(20, Number.isSafeInteger(opts.maxPages) ? (opts.maxPages as number) : 10));
  const visited = new Set<string>();
  const items: unknown[] = [];
  let url: string | null = prep.firstUrl;
  let pagesFetched = 0;
  while (url) {
    const stop = (extra: Partial<ListResult>): ListResult => empty({ pagesFetched, nextCursor: cursorOf(url as string), ...extra });
    if (visited.has(url)) return stop({ error: 'Sentry pagination cursor loop; no risks imported.' });
    visited.add(url);
    const page = await fetchIssuePage(url, prep.firstUrl, opts.token?.trim() ?? '', get, prep.ctx);
    if ('fail' in page) return stop(page.fail);
    items.push(...page.items);
    pagesFetched++;
    if (page.next && pagesFetched >= maxPages) return empty({ pagesFetched, nextCursor: cursorOf(page.next), error: 'Sentry pagination limit reached; no partial risks imported.' });
    url = page.next;
  }
  return { ok: true, items, pagesFetched, status: 200, ctx: prep.ctx, org: prep.org };
}
