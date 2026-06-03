/**
 * jira-client — thin, injectable transport for FailSafe's read-only Jira Cloud
 * import (#98). Resolves a URL/key → GETs the issue resource → returns an
 * UNCOMMITTED intent preview. The `get` transport is injected so tests use NO
 * live network. Auth = Jira Cloud Basic auth (email + API token, base64); the
 * API token is a SECRET: it is encoded only into the outbound Authorization
 * header and is NEVER returned in the result or logged. Read-only, non-webhook.
 */

import * as https from 'https';
import {
  parseJiraIssueKey, buildIssuePath, parseIssueResponse, toIntentPreview,
  type JiraIntentPreview,
} from './jira-import';

export interface JiraGetFn {
  (url: string, headers: Record<string, string>):
    Promise<{ status: number; body: string }>;
}

export interface JiraAuth {
  baseUrl?: string;
  email?: string;
  apiToken?: string;
}

export interface JiraFetchResult {
  ok: boolean;
  preview?: JiraIntentPreview;
  status?: number;
  error?: string;
}

/** Base64 Basic-auth value for Jira Cloud (email:apiToken). */
function basicAuth(email: string, apiToken: string): string {
  return 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
}

/**
 * Resolve + fetch a Jira issue → uncommitted intent preview. Returns a
 * structured, non-throwing result. The apiToken never appears in the result.
 */
export async function fetchJiraIssue(
  input: string,
  auth: JiraAuth,
  get: JiraGetFn,
): Promise<JiraFetchResult> {
  const key = parseJiraIssueKey(input);
  if (!key) return { ok: false, error: 'Not a Jira issue URL or key (expected e.g. PROJ-123).' };
  const baseUrl = auth.baseUrl?.trim().replace(/\/$/, '');
  if (!baseUrl) return { ok: false, error: 'No Jira base URL configured (e.g. https://your-site.atlassian.net).' };
  if (!auth.email?.trim() || !auth.apiToken?.trim()) {
    return { ok: false, error: 'No Jira credentials configured (email + API token).' };
  }

  const url = `${baseUrl}${buildIssuePath(key)}`;
  try {
    const res = await get(url, {
      Accept: 'application/json',
      Authorization: basicAuth(auth.email.trim(), auth.apiToken.trim()),
      'User-Agent': 'FailSafe',
    });
    if (res.status === 429) return { ok: false, status: 429, error: 'Jira rate limit reached (HTTP 429).' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, error: 'Jira auth failed — check the email / API token / permissions.' };
    }
    if (res.status === 404) return { ok: false, status: 404, error: `Issue ${key} not found (or no access).` };
    if (res.status < 200 || res.status >= 300) return { ok: false, status: res.status, error: `Jira returned HTTP ${res.status}.` };

    let json: unknown;
    try { json = JSON.parse(res.body); } catch { return { ok: false, error: 'Invalid JSON from Jira.' }; }
    const issue = parseIssueResponse(json);
    if (!issue) return { ok: false, error: `Issue ${key} not found (or no access).` };
    return { ok: true, preview: toIntentPreview(issue, baseUrl) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Default https transport (used in production; tests inject their own). */
export const defaultJiraGet: JiraGetFn = (url, headers) =>
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
