/**
 * Shared fixtures for the #478 Sentry import suites: a routing fake Sentry
 * (list pages by cursor, issue-detail calls by id) and an import context with a
 * recording sleep on an advancing clock, so no suite waits for real.
 */

import type { ImportCtx } from '../../../integrations/sentry/sentry-import';
import type { SentryGetFn, SentryResponse } from '../../../integrations/sentry/sentry-transport';

export const OPTS = { enabled: true, token: 'private-token', org: 'acme', project: 'backend', maxReleaseLookups: 50 };
export const SCOPE = { org: 'acme', project: 'backend', query: 'is:unresolved' };

export const issue = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, title: `Issue ${id}`, level: 'error', lastSeen: '2026-06-01T00:00:00Z', ...extra });

export const detail = (first: string | null, last: string | null): SentryResponse => ({
  status: 200,
  body: JSON.stringify({
    id: 'x',
    firstRelease: first && { version: first },
    lastRelease: last && { version: last, dateReleased: '2026-06-01T00:00:00Z', ref: 'abc123' },
  }),
});

export interface Server { get: SentryGetFn; list: string[]; details: string[] }

/** Routes list pages (by cursor) and issue-detail calls; detail ids not in `details` return 404. */
export function server(pages: unknown[][], details: Record<string, SentryResponse | (() => SentryResponse)> = {}, onDetail?: () => void): Server {
  const s: Server = { list: [], details: [], get: async () => ({ status: 500, body: '' }) };
  s.get = async (url) => {
    const u = new URL(url);
    const m = /\/organizations\/[^/]+\/issues\/(\d+)\/$/.exec(u.pathname);
    if (m) {
      s.details.push(url);
      onDetail?.();
      const d = details[m[1]];
      return typeof d === 'function' ? d() : d ?? { status: 404, body: '' };
    }
    s.list.push(url);
    const page = Number(u.searchParams.get('cursor') ?? '0');
    const next = page + 1 < pages.length
      ? `<${url.replace(/&cursor=\d+/, '')}&cursor=${page + 1}>; rel="next"; results="true"` : undefined;
    return { status: 200, body: JSON.stringify(pages[page]), headers: next ? { link: next } : {} };
  };
  return s;
}

export type TestCtx = ImportCtx & { sleeps: number[]; cancel: { cancelled: boolean; onCancel: () => () => void } };

/** Import context whose sleep records, advances the clock, and can cancel after N sleeps. */
export function context(cancelAfterSleeps = Infinity): TestCtx {
  let now = Date.parse('2026-10-15T00:00:00Z');
  const sleeps: number[] = [];
  const cancel = { cancelled: false, onCancel: () => () => undefined };
  return {
    sleeps, cancel,
    policy: {
      now: () => now,
      sleep: async (ms) => { sleeps.push(ms); now += ms; if (sleeps.length >= cancelAfterSleeps) cancel.cancelled = true; },
    },
  };
}
