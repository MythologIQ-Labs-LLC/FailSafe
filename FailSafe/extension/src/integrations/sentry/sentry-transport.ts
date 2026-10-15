/**
 * sentry-transport — every request FailSafe makes to Sentry (#478, LD2).
 *
 * `requestWithRetry` refuses before sending unless the URL is HTTPS and lies
 * under the configured base, so the Bearer token never leaves it. It waits on
 * Sentry's documented rate-limit headers (`X-Sentry-Rate-Limit-Reset`, epoch
 * seconds), retries 429, timeouts and 5xx at most 3 times (1 s, 2 s, 4 s
 * backoff; every wait capped at 60 s), never retries other 4xx, and stops on
 * cancellation. Sleep and clock are injected, so tests never wait for real.
 */

import * as https from 'https';

export interface SentryResponse {
  status: number;
  body: string;
  headers?: Record<string, string | string[] | undefined>;
}

export interface SentryGetFn {
  (url: string, headers: Record<string, string>): Promise<SentryResponse>;
}

export interface CancelSignal {
  readonly cancelled: boolean;
  /** Register a listener; returns a disposer. */
  onCancel(listener: () => void): () => void;
}

export interface RetryPolicy {
  now(): number;
  /** Resolves after `ms`, or earlier when `cancel` fires. */
  sleep(ms: number, cancel: CancelSignal): Promise<void>;
}

export interface TransportCtx {
  /** Normalized base (see `normalizeBase`); requests must lie under it. */
  base: string;
  policy: RetryPolicy;
  limiter: RateLimiter;
  cancel: CancelSignal;
}

export type TransportResult =
  | { kind: 'ok'; res: SentryResponse }
  | { kind: 'refused' }
  | { kind: 'cancelled' }
  | { kind: 'rate_limited'; status: 429 }
  | { kind: 'transport' }
  | { kind: 'http'; status: number };

export const MAX_RETRIES = 3;
export const MAX_WAIT_MS = 60_000;
const BACKOFF_MS = [1000, 2000, 4000];

/** Origin plus path, trailing slashes removed (host case and :443 normalized). */
export function normalizeBase(base: string): string {
  const u = new URL(base);
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

/** Case-insensitive header read; Node delivers names in lower case. */
export function header(res: SentryResponse, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(res.headers ?? {})) {
    if (k.toLowerCase() === want) return Array.isArray(v) ? v[0] : v;
  }
  return undefined;
}

/** Milliseconds until the documented reset, when it is a number in the future. */
function untilReset(res: SentryResponse, now: number): number | undefined {
  const raw = header(res, 'x-sentry-rate-limit-reset');
  const reset = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(reset)) return undefined;
  const ms = reset * 1000 - now;
  return ms > 0 ? ms : undefined;
}

/** Delays the next request after a response reported `Remaining: 0`. */
export class RateLimiter {
  private resumeAt = 0;

  note(res: SentryResponse, now: number): void {
    if (header(res, 'x-sentry-rate-limit-remaining')?.trim() !== '0') return;
    const wait = untilReset(res, now);
    if (wait !== undefined) this.resumeAt = now + Math.min(wait, MAX_WAIT_MS);
  }

  delay(now: number): number {
    return Math.max(0, this.resumeAt - now);
  }
}

/** True when `url` is HTTPS, carries no credentials and lies under `base`. */
export function isUnderBase(url: string, base: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  return `${u.origin}${u.pathname}`.startsWith(`${base}/`);
}

function retryWait(res: SentryResponse | undefined, attempt: number, now: number): number {
  if (res && res.status === 429) {
    const reset = untilReset(res, now);
    if (reset !== undefined) return reset;
    const after = header(res, 'retry-after');
    if (after && /^\d+$/.test(after.trim())) return Number(after.trim()) * 1000;
  }
  return BACKOFF_MS[attempt];
}

type Attempt = { done: TransportResult } | { retry: TransportResult; res?: SentryResponse };

async function attemptOnce(url: string, headers: Record<string, string>, get: SentryGetFn, ctx: TransportCtx): Promise<Attempt> {
  let res: SentryResponse;
  try { res = await get(url, headers); } catch { return { retry: { kind: 'transport' } }; }
  ctx.limiter.note(res, ctx.policy.now());
  if (res.status >= 200 && res.status < 300) return { done: { kind: 'ok', res } };
  if (res.status === 429) return { retry: { kind: 'rate_limited', status: 429 }, res };
  if (res.status >= 500) return { retry: { kind: 'http', status: res.status }, res };
  return { done: { kind: 'http', status: res.status } };
}

async function pause(ms: number, ctx: TransportCtx): Promise<boolean> {
  if (ms > 0) await ctx.policy.sleep(Math.min(ms, MAX_WAIT_MS), ctx.cancel);
  return !ctx.cancel.cancelled;
}

/** One logical request with rate-limit waits and bounded retries. */
export async function requestWithRetry(
  url: string, headers: Record<string, string>, get: SentryGetFn, ctx: TransportCtx,
): Promise<TransportResult> {
  if (!isUnderBase(url, ctx.base)) return { kind: 'refused' };
  let last: TransportResult = { kind: 'transport' };
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (ctx.cancel.cancelled) return { kind: 'cancelled' };
    if (!(await pause(ctx.limiter.delay(ctx.policy.now()), ctx))) return { kind: 'cancelled' };
    const a = await attemptOnce(url, headers, get, ctx);
    if ('done' in a) return a.done;
    last = a.retry;
    if (attempt === MAX_RETRIES) break;
    if (!(await pause(retryWait(a.res, attempt, ctx.policy.now()), ctx))) return { kind: 'cancelled' };
  }
  return last;
}

/** Minimal shapes of `https.request`, so tests can drive the real transport. */
interface ResponseLike extends NodeJS.EventEmitter {
  statusCode?: number;
  headers: Record<string, string | string[] | undefined>;
}
interface RequestLike extends NodeJS.EventEmitter {
  end(): void;
  destroy(err?: Error): void;
}
export type RequestFn = (options: https.RequestOptions, callback: (res: ResponseLike) => void) => RequestLike;

/** HTTPS GET returning status, body and every response header. */
export function makeHttpsGet(request: RequestFn = (o, cb) => https.request(o, cb)): SentryGetFn {
  return (url, headers) => new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = request(
        { hostname: u.hostname, port: u.port ? Number(u.port) : undefined, path: u.pathname + u.search, method: 'GET', headers, timeout: 8000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: { ...res.headers } }));
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Production transport (tests inject their own `get`). */
export const defaultSentryGet: SentryGetFn = makeHttpsGet();

/** Real-timer policy for the command. */
export const realTimePolicy: RetryPolicy = {
  now: () => Date.now(),
  sleep: (ms, cancel) => new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    const dispose = cancel.onCancel(done);
    function done(): void { clearTimeout(timer); dispose(); resolve(); }
  }),
};
