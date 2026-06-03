/**
 * linear-client — thin, injectable transport for FailSafe's read-only Linear
 * import (B-INT-11 / #97). Resolves a URL/identifier → POSTs the GraphQL query
 * → returns an UNCOMMITTED intent preview. The `post` transport is injected so
 * tests use NO live network. The API key is a SECRET: it is placed only in the
 * outbound Authorization header and is NEVER returned in the result or logged.
 *
 * Per the contract review: honor rate-limit response headers, never hardcode a
 * ceiling (the docs are internally inconsistent). We surface the headers; v1
 * does not enforce a fixed limit. Non-mutating, non-webhook, read-only.
 */

import * as https from 'https';
import {
  parseLinearIssueId, buildIssueQuery, parseIssueResponse, toIntentPreview,
  type LinearIntentPreview,
} from './linear-import';

const LINEAR_GRAPHQL = 'https://api.linear.app/graphql';

export interface LinearPostFn {
  (url: string, headers: Record<string, string>, body: string):
    Promise<{ status: number; body: string; headers?: Record<string, string> }>;
}

export interface LinearRateLimit { remaining?: number; limit?: number; resetAt?: string }

export interface LinearFetchResult {
  ok: boolean;
  preview?: LinearIntentPreview;
  status?: number;
  rateLimit?: LinearRateLimit;
  error?: string;
}

/** Read Linear's rate-limit headers if present (never hardcode a ceiling). */
export function readRateLimit(headers?: Record<string, string>): LinearRateLimit | undefined {
  if (!headers) return undefined;
  const h = (k: string) => headers[k] ?? headers[k.toLowerCase()];
  const remaining = h('X-RateLimit-Requests-Remaining');
  const limit = h('X-RateLimit-Requests-Limit');
  const resetAt = h('X-RateLimit-Requests-Reset');
  const out: LinearRateLimit = {};
  if (remaining != null) out.remaining = Number(remaining);
  if (limit != null) out.limit = Number(limit);
  if (resetAt != null) out.resetAt = String(resetAt);
  return Object.keys(out).length ? out : undefined;
}

/**
 * Resolve + fetch a Linear issue → uncommitted intent preview. Returns a
 * structured, non-throwing result. The apiKey never appears in the result.
 */
export async function fetchLinearIssue(
  input: string,
  apiKey: string | undefined,
  post: LinearPostFn,
  endpoint: string = LINEAR_GRAPHQL,
): Promise<LinearFetchResult> {
  const id = parseLinearIssueId(input);
  if (!id) return { ok: false, error: 'Not a Linear issue URL or identifier (expected e.g. ENG-123).' };
  if (!apiKey || !apiKey.trim()) return { ok: false, error: 'No Linear API key configured.' };

  const req = buildIssueQuery(id);
  try {
    const res = await post(
      endpoint,
      { 'Content-Type': 'application/json', Authorization: apiKey },
      JSON.stringify(req),
    );
    const rateLimit = readRateLimit(res.headers);
    if (res.status === 429) return { ok: false, status: 429, error: 'Linear rate limit reached (HTTP 429).', rateLimit };
    if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, error: 'Linear auth failed — check the API key / token scope.', rateLimit };
    if (res.status < 200 || res.status >= 300) return { ok: false, status: res.status, error: `Linear returned HTTP ${res.status}.`, rateLimit };

    let json: unknown;
    try { json = JSON.parse(res.body); } catch { return { ok: false, error: 'Invalid JSON from Linear.', rateLimit }; }
    const issue = parseIssueResponse(json);
    if (!issue) return { ok: false, error: `Issue ${id} not found (or no access).`, rateLimit };
    return { ok: true, preview: toIntentPreview(issue), rateLimit };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Default https transport (used in production; tests inject their own). */
export const defaultLinearPost: LinearPostFn = (url, headers, body) =>
  new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }, timeout: 8000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers as Record<string, string>,
          }));
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.write(body);
      req.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
