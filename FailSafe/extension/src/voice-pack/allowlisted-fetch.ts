// Voice-pack allowlisted fetch — follows redirects one hop at a time (#538, B261).
// Every hop is checked before it is requested (https, an allowlisted host, no
// userinfo, the default port), and every response is checked for a redirect
// the fetch in use followed by itself (a wrapper or polyfill that ignores
// `redirect: 'manual'`). Error text names only the requested URL's origin and
// path, or a refused hop's host, so a signed asset query never reaches an
// error, a progress event or a log line.

import { ALLOWED_REDIRECT_HOSTS, MAX_VOICE_PACK_REDIRECTS } from './types';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface AllowlistedResponse {
  response: Response;
  /** The URL that was asked for, as given. */
  requestedUrl: string;
  /** The last hop, origin plus path only (no query, no fragment). */
  finalUrl: string;
}

/** Origin plus path of a URL; never its userinfo, query or fragment. */
export function originAndPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '<malformed URL>';
  }
}

function withoutFragment(url: string): string {
  const u = new URL(url);
  u.hash = '';
  return u.href;
}

/** Refuse a hop before it is requested. Messages carry the host only. */
export function assertAllowedUrl(url: string, prefix: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`${prefix}: redirect target rejected: malformed URL`);
  }
  if (u.protocol !== 'https:') {
    throw new Error(`${prefix}: redirect target rejected: ${u.protocol} is not https`);
  }
  if (!ALLOWED_REDIRECT_HOSTS.includes(u.hostname)) {
    throw new Error(`${prefix}: redirect target rejected: host ${u.hostname} not in allowlist`);
  }
  if (u.username || u.password) {
    throw new Error(`${prefix}: redirect target rejected: credentials in the URL for ${u.hostname}`);
  }
  if (u.port) {
    throw new Error(`${prefix}: redirect target rejected: non-default port on ${u.hostname}`);
  }
}

/** Refuse a response the fetch redirected by itself, or an opaque redirect. */
function assertNotFollowed(res: Response, hop: string, prefix: string): void {
  if (res.type === 'opaqueredirect' || res.status === 0) {
    throw new Error(`${prefix}: manual redirects are not supported by this fetch`);
  }
  let sameUrl = false;
  try {
    sameUrl = !!res.url && withoutFragment(res.url) === withoutFragment(hop);
  } catch {
    sameUrl = false;
  }
  if (res.redirected === true || !sameUrl) {
    throw new Error(`${prefix}: the fetch followed a redirect itself (response URL does not match the requested hop)`);
  }
}

async function requestHop(hop: string, prefix: string, requestedUrl: string): Promise<Response> {
  try {
    return await fetch(hop, { redirect: 'manual' });
  } catch {
    throw new Error(`${prefix}: network error for ${originAndPath(requestedUrl)}`);
  }
}

function nextHop(res: Response, current: string, prefix: string): string {
  const location = res.headers.get('location');
  if (!location) throw new Error(`${prefix}: redirect without a Location header`);
  try {
    return new URL(location, current).toString();
  } catch {
    throw new Error(`${prefix}: redirect with a malformed Location header`);
  }
}

/**
 * GET `url`, following at most MAX_VOICE_PACK_REDIRECTS redirects by hand.
 * Returns the first non-redirect response; throws `<prefix>: ...` otherwise.
 */
export async function fetchAllowlisted(url: string, prefix: string): Promise<AllowlistedResponse> {
  let current = url;
  for (let redirects = 0; ; redirects++) {
    assertAllowedUrl(current, prefix);
    const res = await requestHop(current, prefix, url);
    assertNotFollowed(res, current, prefix);
    if (!REDIRECT_STATUSES.has(res.status)) {
      if (!res.ok) throw new Error(`${prefix}: HTTP ${res.status} for ${originAndPath(url)}`);
      return { response: res, requestedUrl: url, finalUrl: originAndPath(current) };
    }
    if (redirects >= MAX_VOICE_PACK_REDIRECTS) {
      throw new Error(`${prefix}: too many redirects (limit ${MAX_VOICE_PACK_REDIRECTS}) for ${originAndPath(url)}`);
    }
    const next = nextHop(res, current, prefix);
    await res.body?.cancel().catch(() => undefined);
    current = next;
  }
}
