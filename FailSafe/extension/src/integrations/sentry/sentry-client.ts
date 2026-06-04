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
    Promise<{ status: number; body: string }>;
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
}

export interface SentryFetchResult {
  ok: boolean;
  /** True when we deliberately did NOT call the network (disabled/no-config). */
  localOnly?: boolean;
  risks: Array<Record<string, unknown>>;
  count: number;
  status?: number;
  error?: string;
}

/** Pure builder for the project-issues path + query. */
export function buildIssuesPath(org: string, project: string, opts: { environment?: string; query?: string } = {}): string {
  const params = new URLSearchParams();
  params.set('query', opts.query?.trim() || 'is:unresolved');
  if (opts.environment?.trim()) params.set('environment', opts.environment.trim());
  return `/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?${params.toString()}`;
}

/**
 * Fetch a Sentry project's issues → FailSafe risk records. Returns a structured,
 * non-throwing result. Degrades to `localOnly` (no network) when disabled or
 * when token/org/project are not all configured. The token never appears in
 * the result.
 */
export async function fetchSentryRisks(
  opts: SentryOptions,
  get: SentryGetFn,
): Promise<SentryFetchResult> {
  if (!opts.enabled) return { ok: true, localOnly: true, risks: [], count: 0, error: 'integration disabled' };
  if (!opts.token?.trim() || !opts.org?.trim() || !opts.project?.trim()) {
    return { ok: true, localOnly: true, risks: [], count: 0, error: 'token, org, and project must all be configured' };
  }

  const base = (opts.apiBaseUrl || SENTRY_API).replace(/\/$/, '');
  const url = `${base}${buildIssuesPath(opts.org.trim(), opts.project.trim(), { environment: opts.environment, query: opts.query })}`;
  try {
    const res = await get(url, {
      Accept: 'application/json',
      Authorization: `Bearer ${opts.token.trim()}`,
      'User-Agent': 'FailSafe',
    });
    if (res.status === 429) return { ok: false, status: 429, risks: [], count: 0, error: 'Sentry rate limit reached (HTTP 429).' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, risks: [], count: 0, error: 'Sentry auth failed — check the token / org / project scope.' };
    }
    if (res.status === 404) return { ok: false, status: 404, risks: [], count: 0, error: 'Sentry org/project not found (or no access).' };
    if (res.status < 200 || res.status >= 300) return { ok: false, status: res.status, risks: [], count: 0, error: `Sentry returned HTTP ${res.status}.` };

    let json: unknown;
    try { json = JSON.parse(res.body); } catch { return { ok: false, risks: [], count: 0, error: 'Invalid JSON from Sentry.' }; }
    const issues = parseIssuesResponse(json, opts.environment?.trim());
    const risks = sentryIssuesToRisks(issues);
    return { ok: true, risks, count: risks.length, status: res.status };
  } catch (e) {
    return { ok: false, risks: [], count: 0, error: e instanceof Error ? e.message : String(e) };
  }
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
    for (const r of result.risks) upsert(r);
  }
  return result;
}

/** Default https transport (used in production; tests inject their own). */
export const defaultSentryGet: SentryGetFn = (url, headers) =>
  new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, timeout: 8000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
