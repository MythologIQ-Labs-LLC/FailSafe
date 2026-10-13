/**
 * sentry-client — thin, injectable transport for FailSafe's read-only Sentry
 * import (#102). Fetches a project's issues → maps them to FailSafe risk
 * records. The `get` transport is injected so tests use NO live network.
 * Off-by-default: with no token/org/project (or disabled) the call short-circuits
 * and makes NO network call. The auth token is a SECRET: it is placed only in
 * the outbound Authorization header and is NEVER returned in the result or
 * logged. Read-only; no mutation of Sentry.
 */

import * as https from 'https';
import { parseIssuesResponse, sentryIssuesToRisks } from './sentry-to-risk';

const SENTRY_API = 'https://sentry.io';

export interface SentryGetFn {
  (url: string, headers: Record<string, string>):
    Promise<{ status: number; body: string; headers?: Record<string, string | string[] | undefined> }>;
}

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
}

export interface SentryFetchResult {
  ok: boolean;
  /** True when we deliberately did NOT call the network (disabled/no-config). */
  localOnly?: boolean;
  risks: Array<Record<string, unknown>>;
  count: number;
  status?: number;
  error?: string;
  /** #241 (FX915): risk-sink writes that threw during import (never loop-aborting). */
  failed?: number;
  /** Successfully persisted sink rows, distinct from the fetched unique count. */
  persisted?: number;
  pagesFetched?: number;
}

/** Pure builder for the project-issues path + query. The project-issues
 *  endpoint does NOT accept a standalone `environment` query param (verified
 *  against docs.sentry.io/api/events/list-a-projects-issues/) — environment is
 *  expressed inside the search `query` as `environment:<name>`. */
export function buildIssuesPath(org: string, project: string, opts: { environment?: string; query?: string } = {}): string {
  let query = opts.query?.trim() || 'is:unresolved';
  const env = opts.environment?.trim();
  if (env) query += ` environment:${env}`;
  const params = new URLSearchParams();
  params.set('query', query);
  return `/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?${params.toString()}`;
}

/**
 * Fetch a Sentry project's issues → FailSafe risk records. Returns a structured,
 * non-throwing result. Degrades to `localOnly` (no network) when disabled or
 * when token/org/project are not all configured. The token never appears in
 * the result.
 */
/** Returns the next page only when Sentry explicitly marks next results true.
 * Never follow arbitrary off-origin or unrelated-path Link destinations with a Bearer token. */
export function nextSentryPage(link: string | undefined, currentUrl: string, firstUrl: string): string | null {
  if (!link) return null;
  for (const part of link.split(/,(?=\\s*<)/)) {
    if (!/\\brel="?next"?/i.test(part) || !/\\bresults="?true"?/i.test(part)) continue;
    const match = part.match(/<([^>]+)>/);
    if (!match) throw new Error('Malformed Sentry pagination Link');
    const next = new URL(match[1], currentUrl);
    const first = new URL(firstUrl);
    if (next.protocol !== 'https:' || next.origin !== first.origin || next.pathname !== first.pathname) {
      throw new Error('Untrusted Sentry pagination destination');
    }
    return next.toString();
  }
  return null;
}

export async function fetchSentryRisks(
  opts: SentryOptions,
  get: SentryGetFn,
): Promise<SentryFetchResult> {
  if (!opts.enabled) return { ok: true, localOnly: true, risks: [], count: 0, error: 'integration disabled' };
  if (!opts.token?.trim() || !opts.org?.trim() || !opts.project?.trim()) {
    return { ok: true, localOnly: true, risks: [], count: 0, error: 'token, org, and project must all be configured' };
  }

  const base = (opts.apiBaseUrl || SENTRY_API).replace(/\\/$/, '');
  const firstUrl = `${base}${buildIssuesPath(opts.org.trim(), opts.project.trim(), { environment: opts.environment, query: opts.query })}`;
  // Do not transmit credentials over HTTP, including for an operator-defined base URL.
  if (new URL(firstUrl).protocol !== 'https:') {
    return { ok: false, risks: [], count: 0, error: 'Sentry API URL must use HTTPS.' };
  }
  const maxPages = Math.max(1, Math.min(20, Number.isSafeInteger(opts.maxPages) ? opts.maxPages! : 10));
  const visited = new Set<string>();
  const issues: unknown[] = [];
  let currentUrl: string | null = firstUrl;
  let pagesFetched = 0;

  while (currentUrl) {
    if (visited.has(currentUrl)) {
      return { ok: false, risks: [], count: 0, pagesFetched, error: 'Sentry pagination cursor loop; no risks imported.' };
    }
    visited.add(currentUrl);
    let res: Awaited<ReturnType<SentryGetFn>>;
    try {
      res = await get(currentUrl, {
        Accept: 'application/json',
        Authorization: `Bearer ${opts.token.trim()}`,
        'User-Agent': 'FailSafe',
      });
    } catch {
      // Transport exceptions sometimes echo request URLs/headers. Do not echo secrets.
      return { ok: false, risks: [], count: 0, pagesFetched, error: 'Sentry transport failed; no risks imported.' };
    }
    if (res.status === 429) return { ok: false, status: 429, risks: [], count: 0, pagesFetched, error: 'Sentry rate limit reached (HTTP 429); no risks imported.' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, risks: [], count: 0, pagesFetched, error: 'Sentry auth failed — check token/project scope; no risks imported.' };
    }
    if (res.status === 404) return { ok: false, status: 404, risks: [], count: 0, pagesFetched, error: 'Sentry org/project not found (or no access).' };
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, status: res.status, risks: [], count: 0, pagesFetched, error: `Sentry returned HTTP ${res.status}; no risks imported.` };
    }

    let page: unknown;
    try { page = JSON.parse(res.body); } catch {
      return { ok: false, risks: [], count: 0, pagesFetched, error: 'Invalid JSON from Sentry; no risks imported.' };
    }
    if (!Array.isArray(page)) {
      return { ok: false, risks: [], count: 0, pagesFetched, error: 'Unexpected Sentry issue list; no risks imported.' };
    }
    issues.push(...page);
    pagesFetched++;
    let next: string | null;
    try {
      const rawLink = res.headers?.link ?? res.headers?.Link;
      next = nextSentryPage(Array.isArray(rawLink) ? rawLink.join(',') : rawLink, currentUrl, firstUrl);
    } catch {
      return { ok: false, risks: [], count: 0, pagesFetched, error: 'Untrusted or malformed Sentry pagination; no risks imported.' };
    }
    if (next && pagesFetched >= maxPages) {
      return { ok: false, risks: [], count: 0, pagesFetched, error: 'Sentry pagination limit reached; no partial risks imported.' };
    }
    currentUrl = next;
  }
  const risks = sentryIssuesToRisks(parseIssuesResponse(issues, opts.environment?.trim()));
  return { ok: true, risks, count: risks.length, pagesFetched, status: 200 };
}

/**
 * Orchestrate a Sentry import: fetch → upsert each risk via the injected
 * `upsert` (RiskRegisterManager.upsertRisk at runtime). The upsert sink is
 * injected so tests need no RiskRegisterManager. Returns the fetch result.
 */
export async function importSentryRisks(
  opts: SentryOptions,
  get: SentryGetFn,
  upsert: (risk: Record<string, unknown>) => void,
): Promise<SentryFetchResult> {
  const result = await fetchSentryRisks(opts, get);
  if (result.ok && !result.localOnly) {
    // #241 Tranche C (FX915): guarded per-item upsert — a failing write is
    // counted, never loop-aborting (FX910 pattern).
    let failed = 0;
    for (const r of result.risks) {
      try {
        upsert(r);
      } catch {
        failed++;
      }
    }
    return { ...result, failed, persisted: result.risks.length - failed };
  }
  return result;
}

/** Default https transport (used in production; tests inject their own). */
export const defaultSentryGet: SentryGetFn = (url, headers) =>
  new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = https.request(
        { hostname: u.hostname, port: u.port ? Number(u.port) : undefined, path: u.pathname + u.search, method: 'GET', headers, timeout: 8000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: { link: res.headers.link },
          }));
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
