// Tracker resilience for non-semver / PR-incremental repos (GH #174).
//
// The Development Tracker's release axis is discovered ONLY from semver
// CHANGELOG headers (`tracker-model.ts:discoverReleases`). A repo that ships by
// merging PRs with no semver tags / Keep-a-Changelog CHANGELOG therefore renders
// an empty timeline. This module adds a FALLBACK signal: merged PRs parsed from
// `git log`, surfaced as `pr-<N>` anchors so the tracker shows throughput when
// no formal releases exist — plus a cadence detector that picks the best
// available signal.
//
// PURE: no git/fs/network — the caller runs `git log` and passes the text. The
// expected input is one line per commit in `<date>\t<subject>` form, e.g.
// `git log --no-merges=false --pretty=format:'%ad%x09%s' --date=short`.

import type { TrackerRc } from './tracker-model';

/** A squash-merge subject ends with `(#123)`; a GitHub merge-commit subject is
 *  `Merge pull request #123 from owner/branch`. Both carry the PR number. */
const SQUASH_RE = /\(#(\d+)\)\s*$/;
const MERGE_RE = /^Merge pull request #(\d+) from \S+(?:\s+(.*))?$/;

interface ParsedCommit { date?: string; subject: string; }

/** Split a `git log` text (one `<date>\t<subject>` line per commit) into
 *  structured commits. A line without a tab is treated as subject-only. */
function parseLogLines(gitLogText: string): ParsedCommit[] {
  const out: ParsedCommit[] = [];
  for (const raw of String(gitLogText ?? '').split(/\r?\n/)) {
    if (!raw) continue;
    const tab = raw.indexOf('\t');
    if (tab >= 0) {
      out.push({ date: raw.slice(0, tab).trim() || undefined, subject: raw.slice(tab + 1).trim() });
    } else {
      out.push({ subject: raw.trim() });
    }
  }
  return out;
}

/** A clean, human title for a PR anchor: squash subjects keep their text minus
 *  the trailing `(#N)`; merge-commit subjects keep the merged branch hint. */
function titleFor(subject: string, prNumber: string): string {
  const squash = subject.replace(SQUASH_RE, '').trim();
  if (squash && squash !== subject) return squash;
  const m = MERGE_RE.exec(subject);
  if (m) return (m[2]?.trim() || `Merge #${prNumber}`);
  return subject;
}

/**
 * Discover merged PRs from `git log` text as fallback timeline anchors. Returns
 * `pr-<N>` anchors (state `pr`) deduped by PR number, oldest first. Each anchor
 * is a self-valuable record (title + date) even with no program-progress data.
 */
export function discoverMergedPrs(gitLogText: string): TrackerRc[] {
  const commits = parseLogLines(gitLogText);
  const byNumber = new Map<number, TrackerRc>();
  // git log is newest-first; iterate so the FIRST (newest) wins the title, but
  // keep the oldest date — we re-sort ascending at the end.
  for (const c of commits) {
    const squash = SQUASH_RE.exec(c.subject);
    const merge = MERGE_RE.exec(c.subject);
    const numStr = squash?.[1] ?? merge?.[1];
    if (!numStr) continue;
    const n = parseInt(numStr, 10);
    if (!Number.isFinite(n)) continue;
    const existing = byNumber.get(n);
    const anchor: TrackerRc = {
      id: `pr-${n}`,
      state: 'pr',
      note: c.date,
      summary: titleFor(c.subject, numStr) || undefined,
      progressEligible: false,
    };
    if (!existing) {
      byNumber.set(n, anchor);
    } else if (c.date && (!existing.note || c.date < existing.note)) {
      // keep the earlier (merge) date; preserve the already-chosen title
      existing.note = c.date;
    }
  }
  return [...byNumber.values()].sort((a, b) => {
    if (a.note && b.note && a.note !== b.note) return a.note < b.note ? -1 : 1;
    // fall back to PR number order when dates are equal/absent
    return parseInt(a.id.slice(3), 10) - parseInt(b.id.slice(3), 10);
  });
}

/** The cadence a repo ships by — drives which timeline the tracker renders. */
export type TrackerCadence = 'semver' | 'pr-incremental' | 'empty';

/**
 * Pick the best available signal: semver releases win; else merged PRs; else
 * empty (the tracker shows guidance). `releases` is `discoverReleases(...)`
 * output; `prs` is `discoverMergedPrs(...)` output.
 */
export function detectCadence(releases: TrackerRc[], prs: TrackerRc[]): TrackerCadence {
  if (releases.length > 0) return 'semver';
  if (prs.length > 0) return 'pr-incremental';
  return 'empty';
}
