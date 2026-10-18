/**
 * github-host-affinity - the GitHub token goes only to the configured API origin (#538, B265).
 *
 * `apiBaseFor` resolves the API base URL once: https only (http only for a
 * host on this machine), no credentials, query or fragment. `githubAuthHeaders`
 * is the only builder of the GitHub Authorization header, and it attaches
 * the token only when the request URL has exactly the base's origin
 * (scheme, host and port). Pure.
 */

import { INVALID_API_BASE_ERROR } from './check-run-errors';
import { isLoopbackHostName } from '../../shared/net/addressPolicy';

export const GITHUB_API = 'https://api.github.com';

/** Shown when an http:// base names a network host. Before #538 such a base was silently sent over TLS on port 443. */
export const HTTP_API_BASE_ERROR =
  'The GitHub API base URL uses http:// for a host that is not this machine. FailSafe sends the token only over https: change failsafe.integrations.github.apiBaseUrl to https://.';

export interface ResolvedApiBase {
  /** The base URL without a trailing slash. */
  baseUrl: string;
  apiHost: string;
  /** `new URL(baseUrl).origin`: the only origin that may receive the token. */
  origin: string;
}

export function apiBaseFor(apiBaseUrl: string | undefined): { ok: true; base: ResolvedApiBase } | { ok: false; error: string } {
  const baseUrl = (apiBaseUrl || GITHUB_API).replace(/\/$/, '');
  let u: URL;
  try { u = new URL(baseUrl); } catch { return { ok: false, error: INVALID_API_BASE_ERROR }; }
  if (u.username || u.password || u.search || u.hash) return { ok: false, error: INVALID_API_BASE_ERROR };
  if (u.protocol === 'http:' && !isLoopbackHostName(u.hostname)) return { ok: false, error: HTTP_API_BASE_ERROR };
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: INVALID_API_BASE_ERROR };
  return { ok: true, base: { baseUrl, apiHost: u.hostname.toLowerCase(), origin: u.origin } };
}

/** `extra` plus the token header, or undefined (send nothing) when `requestUrl` is not on the base's origin. */
export function githubAuthHeaders(
  api: ResolvedApiBase, requestUrl: string, token: string, extra: Record<string, string>,
): Record<string, string> | undefined {
  let origin: string;
  try { origin = new URL(requestUrl).origin; } catch { return undefined; }
  if (origin !== api.origin) return undefined;
  return { ...extra, Authorization: `token ${token}` };
}
