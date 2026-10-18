/**
 * github-checks-client — the generic publisher for FailSafe's GitHub Checks
 * integration (#96, v1). Publishes a single allowlisted Check Run to a commit
 * through check-run-transport.ts, the only module that builds the Checks API
 * URL (#476). The `post` transport is injected so tests use NO live network. Off-by-default: with no token (or disabled), the
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

import * as http from 'http';
import * as https from 'https';
import { isPublishable, parseRepoSlug, type CheckRunPayload } from './github-checks-map';
import { postCheckRun, toWirePayload } from './check-run-transport';
import { INVALID_API_BASE_ERROR, NOT_PUBLISHABLE_ERROR } from './check-run-errors';
import { apiBaseFor, githubAuthHeaders } from './github-host-affinity';
import { bareHost, guardedLookup, isLoopbackHostName } from '../../shared/net/addressPolicy';

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
   *  missing context). Nothing was published. */
  localOnly?: boolean;
  status?: number;
  /** The created check-run id, when GitHub confirms one. */
  checkRunId?: number;
  error?: string;
}

export interface PublishOptions {
  enabled: boolean;
  token?: string;
  apiBaseUrl?: string;
}

/** Resolve the API base URL, its hostname and origin; undefined when refused (#538: https, or http on this machine). */
export function resolveApiBase(apiBaseUrl: string | undefined): { baseUrl: string; apiHost: string; origin: string } | undefined {
  const api = apiBaseFor(apiBaseUrl);
  return api.ok ? api.base : undefined;
}

/**
 * Publish a PRE-BUILT Check Run payload: the generic path shared by the manual
 * advisory and the #154 PR-linkage check. Only (name, conclusion) pairs in
 * PUBLISHABLE_CHECKS are posted (#476); the SHIELD name is never publishable
 * here. Off-by-default + fork-safe; the token appears only in the
 * Authorization header, never in the result.
 */
export async function publishCheckRunPayload(
  payload: CheckRunPayload,
  ctx: GitContext,
  opts: PublishOptions,
  post: GitHubPostFn,
): Promise<PublishCheckResult> {
  // Guard a fresh checked copy, never the caller's object (#476): toJSON,
  // getters or a Proxy must not change what is checked versus what is posted.
  const wire = toWirePayload(payload);
  if (!wire || !isPublishable(wire.name, wire.conclusion)) {
    return { ok: false, error: NOT_PUBLISHABLE_ERROR };
  }
  if (!opts.enabled) return { ok: true, localOnly: true, error: 'integration disabled' };
  if (!opts.token || !opts.token.trim()) return { ok: true, localOnly: true, error: 'no token configured' };
  if (ctx.isFork) return { ok: true, localOnly: true, error: 'fork PR context — local-only' };

  const slug = ctx.remoteUrl ? parseRepoSlug(ctx.remoteUrl) : null;
  if (!slug) return { ok: true, localOnly: true, error: 'no GitHub remote resolved' };
  if (!ctx.headSha || !ctx.headSha.trim()) return { ok: true, localOnly: true, error: 'no HEAD sha resolved' };

  const api = apiBaseFor(opts.apiBaseUrl);
  if (!api.ok) return { ok: false, error: api.error };
  const res = await postCheckRun(wire, { repo: `${slug.owner}/${slug.repo}`, baseUrl: api.base.baseUrl, apiHost: api.base.apiHost }, opts.token, post);
  return { ok: res.ok, status: res.status, checkRunId: res.checkRunId, error: res.error };
}

export interface CreatePullRequestOptions {
  token?: string;
  apiBaseUrl?: string;
  remoteUrl?: string;
  head: string;   // branch to merge from
  base: string;   // branch to merge into (e.g. main)
  title: string;
  body: string;
}

export interface CreatePullRequestResult {
  ok: boolean;
  /** True when we deliberately did NOT call the network (no token / no remote). */
  localOnly?: boolean;
  status?: number;
  url?: string;     // the created PR's html_url
  number?: number;
  error?: string;
}

/**
 * Open a pull request via `POST /repos/{owner}/{repo}/pulls`. Same transport +
 * degrade-safe contract as `publishCheckRunPayload`: no token or no GitHub remote
 * → `localOnly` (the caller's branch is still pushed); the token appears only in
 * the Authorization header, never in the result. Non-throwing.
 */
export async function createPullRequest(
  opts: CreatePullRequestOptions,
  post: GitHubPostFn,
): Promise<CreatePullRequestResult> {
  if (!opts.token || !opts.token.trim()) return { ok: true, localOnly: true, error: 'no token configured' };
  const slug = opts.remoteUrl ? parseRepoSlug(opts.remoteUrl) : null;
  if (!slug) return { ok: true, localOnly: true, error: 'no GitHub remote resolved' };

  // #538: a refused base is an error (not a local-only skip); nothing is sent.
  const api = apiBaseFor(opts.apiBaseUrl);
  if (!api.ok) return { ok: false, error: api.error };
  const url = `${api.base.baseUrl}/repos/${slug.owner}/${slug.repo}/pulls`;
  const headers = githubAuthHeaders(api.base, url, opts.token, {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    'User-Agent': 'FailSafe',
    'X-GitHub-Api-Version': '2022-11-28',
  });
  if (!headers) return { ok: false, error: INVALID_API_BASE_ERROR };
  try {
    const res = await post(url, headers, JSON.stringify({ title: opts.title, head: opts.head, base: opts.base, body: opts.body }));
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, error: 'GitHub auth failed — check the token / pull-request write permission.' };
    }
    if (res.status === 422) {
      // 422 also fires when a PR for this head already exists — not a hard failure.
      return { ok: false, status: 422, error: 'GitHub rejected the PR (422) — branch may be unpushed or a PR already exists for it.' };
    }
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, status: res.status, error: `GitHub returned HTTP ${res.status}.` };
    }
    let prUrl: string | undefined;
    let num: number | undefined;
    try { const j = JSON.parse(res.body); if (j && typeof j.html_url === 'string') prUrl = j.html_url; if (j && typeof j.number === 'number') num = j.number; } catch { /* tolerate */ }
    return { ok: true, status: res.status, url: prUrl, number: num };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Request options for a GitHub API URL (#538, B279): the port is kept, IPv6
 * brackets are stripped, https is used, and http only for a host on this
 * machine (resolved through the loopback guard). Undefined for anything else.
 */
export function githubRequestOptions(
  url: string, method: 'GET' | 'POST', headers: Record<string, string>,
): { protocol: 'http:' | 'https:'; options: http.RequestOptions } | undefined {
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }
  const options: http.RequestOptions = {
    hostname: bareHost(u.hostname),
    port: u.port ? Number(u.port) : undefined,
    path: u.pathname + u.search,
    method,
    headers,
    timeout: 8000,
    agent: false,
  };
  if (u.protocol === 'https:') return { protocol: 'https:', options };
  if (u.protocol === 'http:' && isLoopbackHostName(u.hostname)) {
    return { protocol: 'http:', options: { ...options, lookup: guardedLookup('loopback') } };
  }
  return undefined;
}

/** Cap on a GitHub response body (an issue page of 100 items is far smaller). */
export const MAX_GITHUB_RESPONSE_BYTES = 16 * 1024 * 1024;
/** One deadline for the whole request, whatever the socket activity. */
const GITHUB_REQUEST_DEADLINE_MS = 8000;

/** One GitHub request; a 3xx is returned to the caller and never followed. Settles exactly once. */
function sendGitHubRequest(
  url: string, method: 'GET' | 'POST', headers: Record<string, string>, body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const deadline: { timer?: NodeJS.Timeout } = {};
    const finish = (err: Error | undefined, value?: { status: number; body: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline.timer);
      if (err) reject(err); else resolve(value as { status: number; body: string });
    };
    try {
      const built = githubRequestOptions(url, method, body === undefined ? headers : { ...headers, 'Content-Length': String(Buffer.byteLength(body)) });
      if (!built) { finish(new Error('GitHub request refused: only https, or http on this machine')); return; }
      const onResponse = (res: http.IncomingMessage) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_GITHUB_RESPONSE_BYTES) {
            req.destroy();
            finish(new Error(`GitHub response too large (over ${MAX_GITHUB_RESPONSE_BYTES} bytes)`));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => finish(undefined, { status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', (e) => finish(e));
        res.on('aborted', () => finish(new Error('GitHub response aborted')));
        res.on('close', () => { if (!res.complete) finish(new Error('GitHub response closed before it was complete')); });
      };
      const req = built.protocol === 'http:' ? http.request(built.options, onResponse) : https.request(built.options, onResponse);
      deadline.timer = setTimeout(() => {
        finish(new Error('timeout'));
        req.destroy();
      }, GITHUB_REQUEST_DEADLINE_MS);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => finish(e));
      req.end(body);
    } catch (e) {
      finish(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Default POST transport (used in production; tests inject their own). */
export const defaultGitHubPost: GitHubPostFn = (url, headers, body) => sendGitHubRequest(url, 'POST', headers, body);

/** Injected GET transport (read-only; the #154 linkage audit fetches PR + issues). */
export interface GitHubGetFn {
  (url: string, headers: Record<string, string>): Promise<{ status: number; body: string }>;
}

/** Default GET transport (production; tests inject their own). */
export const defaultGitHubGet: GitHubGetFn = (url, headers) => sendGitHubRequest(url, 'GET', headers);
