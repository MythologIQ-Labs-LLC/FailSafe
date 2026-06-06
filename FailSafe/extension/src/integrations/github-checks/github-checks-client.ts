/**
 * github-checks-client — thin, injectable transport for FailSafe's GitHub
 * Checks integration (#96, v1). Publishes a single Check Run to a commit via
 * `POST /repos/{owner}/{repo}/check-runs`. The `post` transport is injected so
 * tests use NO live network. Off-by-default: with no token (or disabled), the
 * call short-circuits to a `localOnly` result and makes NO network call —
 * satisfying "no network unless explicitly enabled" + "fork/PR edge cases
 * degrade to local-only". The token is a SECRET: it is placed only in the
 * outbound Authorization header and is NEVER returned in the result or logged.
 *
 * Auth note: the Checks API requires GitHub-App-oriented write access. v1
 * accepts a pre-minted token (App installation token or a PAT where the org
 * permits checks:write) via config; minting the App installation token from a
 * private key is a documented runtime prerequisite, not a build dependency.
 */

import * as https from 'https';
import { buildCheckRunPayload, parseRepoSlug, type CheckRunInput, type CheckRunPayload } from './github-checks-map';

const GITHUB_API = 'https://api.github.com';

export interface GitHubPostFn {
  (url: string, headers: Record<string, string>, body: string):
    Promise<{ status: number; body: string }>;
}

/** Local git context, gathered by the caller (command layer) — pure data. */
export interface GitContext {
  remoteUrl?: string;
  headSha?: string;
  /** True when the HEAD is from a fork PR context (publish degrades to local). */
  isFork?: boolean;
}

export interface PublishCheckResult {
  ok: boolean;
  /** True when we deliberately did NOT call the network (disabled/no-auth/fork/
   *  missing context). The verdict still stands locally. */
  localOnly?: boolean;
  status?: number;
  /** The created check-run id, when GitHub returns one. */
  checkRunId?: number;
  error?: string;
}

export interface PublishOptions {
  enabled: boolean;
  token?: string;
  apiBaseUrl?: string;
  name?: string;
  summary?: string;
  detailsUrl?: string;
}

/**
 * Publish a SHIELD verdict as a GitHub Check Run. Returns a structured,
 * non-throwing result. Degrades to `localOnly` (no network) when disabled, when
 * no token is configured, on a fork PR context, or when git context is missing.
 * The token never appears in the result.
 */
export async function publishCheckRun(
  verdict: string,
  ctx: GitContext,
  opts: PublishOptions,
  post: GitHubPostFn,
): Promise<PublishCheckResult> {
  const input: CheckRunInput = {
    verdict, headSha: (ctx.headSha || '').trim(), name: opts.name, summary: opts.summary, detailsUrl: opts.detailsUrl,
  };
  return publishCheckRunPayload(buildCheckRunPayload(input), ctx, opts, post);
}

/**
 * Publish a PRE-BUILT Check Run payload. The generic publish path shared by the
 * #96 SHIELD-verdict check and the #154 PR-linkage check. Off-by-default +
 * fork-safe; the token appears only in the Authorization header, never in the
 * result.
 */
export async function publishCheckRunPayload(
  payload: CheckRunPayload,
  ctx: GitContext,
  opts: PublishOptions,
  post: GitHubPostFn,
): Promise<PublishCheckResult> {
  if (!opts.enabled) return { ok: true, localOnly: true, error: 'integration disabled' };
  if (!opts.token || !opts.token.trim()) return { ok: true, localOnly: true, error: 'no token configured' };
  if (ctx.isFork) return { ok: true, localOnly: true, error: 'fork PR context — local-only' };

  const slug = ctx.remoteUrl ? parseRepoSlug(ctx.remoteUrl) : null;
  if (!slug) return { ok: true, localOnly: true, error: 'no GitHub remote resolved' };
  if (!ctx.headSha || !ctx.headSha.trim()) return { ok: true, localOnly: true, error: 'no HEAD sha resolved' };

  const base = (opts.apiBaseUrl || GITHUB_API).replace(/\/$/, '');
  const url = `${base}/repos/${slug.owner}/${slug.repo}/check-runs`;

  try {
    const res = await post(
      url,
      {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        Authorization: `token ${opts.token}`,
        'User-Agent': 'FailSafe',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      JSON.stringify(payload),
    );
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, error: 'GitHub auth failed — check the token / Checks write permission.' };
    }
    if (res.status === 422) {
      return { ok: false, status: 422, error: 'GitHub rejected the check run (422) — head_sha or repo invalid.' };
    }
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, status: res.status, error: `GitHub returned HTTP ${res.status}.` };
    }
    let id: number | undefined;
    try { const j = JSON.parse(res.body); if (j && typeof j.id === 'number') id = j.id; } catch { /* tolerate */ }
    return { ok: true, status: res.status, checkRunId: id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Default https transport (used in production; tests inject their own). */
export const defaultGitHubPost: GitHubPostFn = (url, headers, body) =>
  new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }, timeout: 8000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
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

/** Injected GET transport (read-only; the #154 linkage audit fetches PR + issues). */
export interface GitHubGetFn {
  (url: string, headers: Record<string, string>): Promise<{ status: number; body: string }>;
}

/** Default https GET transport (production; tests inject their own). */
export const defaultGitHubGet: GitHubGetFn = (url, headers) =>
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
