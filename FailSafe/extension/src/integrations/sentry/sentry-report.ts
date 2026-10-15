/**
 * sentry-report — the operator message for a Sentry import outcome (#478, LD8).
 * Pure. The level is the first matching rule:
 *   list failure or invalid org -> error; cancelled -> warning; local-only ->
 *   warning; nothing to import -> info; every write failed -> error; some writes
 *   failed -> warning; release lookups stopped early -> warning; else info.
 * A failed write is never reported as persisted.
 */

import type { SentryImportOutcome } from './sentry-import';
import { DEFAULT_QUERY } from './sentry-settings';

export type MessageLevel = 'info' | 'warning' | 'error';
export interface ImportScope { org?: string; project?: string; query?: string }

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const STOPPED: Record<string, string> = {
  rate_limited: 'Sentry rate limit', failures: 'three consecutive failures', cancelled: 'cancellation',
};

function releaseText(o: SentryImportOutcome): string {
  const r = o.releases;
  const parts = [`${r.enriched} found`, `${r.none} without a release`];
  if (r.failed) parts.push(plural(r.failed, 'release lookup') + ' failed');
  if (r.notAttempted) parts.push(`${r.notAttempted} not looked up`);
  if (r.carried) parts.push(`${r.carried} kept from an earlier lookup`);
  if (r.discarded) parts.push(`${r.discarded} unverified stored release${r.discarded === 1 ? '' : 's'} dropped`);
  const stopped = r.stoppedBy ? ` Lookups stopped by ${STOPPED[r.stoppedBy]}.` : '';
  return ` Releases: ${parts.join(', ')}.${stopped}`;
}

function countsText(o: SentryImportOutcome, where: string): string {
  const head = `Sentry import from ${where} (${plural(o.pagesFetched, 'page')}): ${o.created} created, ${o.updated} updated, ${o.unchanged} unchanged`;
  const failed = o.failed ? `, ${o.failed} failed` : '';
  const extra = [o.skipped ? `${o.skipped} skipped` : '', o.duplicates ? plural(o.duplicates, 'duplicate') : ''].filter(Boolean);
  return `${head}${failed}.${extra.length ? ` ${extra.join(', ')}.` : ''}${releaseText(o)}`;
}

function emptyText(o: SentryImportOutcome, where: string, query: string): string {
  const what = query === DEFAULT_QUERY ? `no unresolved issues in ${where}` : `no issues in ${where} matched query "${query}"`;
  const skipped = o.skipped ? ` ${o.skipped} skipped (${o.skippedReasons.join('; ')}).` : '';
  return `Sentry: ${what}.${skipped}`;
}

export function describeSentryImport(o: SentryImportOutcome, scope: ImportScope): { level: MessageLevel; text: string } {
  const where = `${scope.org ?? '?'}/${scope.project ?? '?'}`;
  if (o.cancelled) {
    const cursor = o.nextCursor ? ` (next cursor ${o.nextCursor})` : '';
    return { level: 'warning', text: `Sentry import cancelled after ${plural(o.pagesFetched, 'page')}${cursor}. Nothing was imported.` };
  }
  if (!o.ok) return { level: 'error', text: `Sentry import failed: ${o.error ?? 'unknown error'} Nothing was imported.` };
  if (o.localOnly) return { level: 'warning', text: `Sentry import is not configured: ${o.error ?? 'disabled'}.` };
  if (o.unique === 0) return { level: 'info', text: emptyText(o, where, scope.query ?? DEFAULT_QUERY) };
  if (o.failed === o.unique) {
    return { level: 'error', text: `Sentry import from ${where}: every write failed (${o.failed} of ${o.unique}); nothing was saved.` };
  }
  const level: MessageLevel = o.failed > 0 || o.releases.stoppedBy ? 'warning' : 'info';
  return { level, text: countsText(o, where) };
}
