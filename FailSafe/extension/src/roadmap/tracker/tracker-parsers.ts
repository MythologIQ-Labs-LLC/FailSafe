/**
 * tracker-parsers — pure parsers for the Development Tracker's data sources
 * (docs/FEATURE_INDEX.md, docs/BACKLOG.md). No fs here; callers pass text so the
 * parsers are deterministically testable.
 */

export interface FeatureRow { id: string; status: 'verified' | 'unverified' | 'n/a'; testPath: string | null }
export interface BacklogItem { id: string; done: boolean; version: string | null; text: string }

const STATUS_VALUES = new Set(['verified', 'unverified', 'n/a']);

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * Parse FEATURE_INDEX.md table rows into FeatureRow[]. Robust to the column
 * count varying: the status is the cell whose value is verified/unverified/n/a,
 * and the test path is the cell that looks like a `*.test.*` / `*.spec.*` /
 * `src/test/...` path. Rows without an `FX###` id cell are skipped.
 */
export function parseFeatureIndex(text: string): FeatureRow[] {
  const out: FeatureRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/^\|\s*FX\d+/.test(line)) continue;
    const c = cells(line);
    const id = (c[0].match(/FX\d+/) || [])[0];
    if (!id) continue;
    let status: FeatureRow['status'] | null = null;
    for (const cell of c) {
      const v = cell.toLowerCase();
      if (STATUS_VALUES.has(v)) { status = v as FeatureRow['status']; break; }
    }
    if (!status) continue; // a row with no recognizable status is not a scorable feature
    const testCell = c.find((cell) => /\.(test|spec)\.|src[\\/]test/.test(cell));
    const testPath = testCell ? (testCell.match(/[\w./\\-]+\.(?:test|spec)\.[\w.]+/) || [testCell])[0] : null;
    out.push({ id, status, testPath });
  }
  return out;
}

/**
 * Parse BACKLOG.md checkbox items into BacklogItem[]. Matches
 * `- [x] [B123] ...` and `- [ ] **[B-INT-8]** ...`, capturing done-state, id,
 * the trailing `| <version>` tag, and the item text.
 */
export function parseBacklog(text: string): BacklogItem[] {
  const out: BacklogItem[] = [];
  const re = /^\s*-\s*\[([ xX])\]\s*\*{0,2}\[(B[A-Za-z0-9-]+)\]/;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const done = m[1].toLowerCase() === 'x';
    const id = m[2];
    // version is the last pipe-delimited segment when it looks like a version/tier tag.
    let version: string | null = null;
    const parts = line.split('|');
    if (parts.length > 1) {
      const last = parts[parts.length - 1].trim().replace(/_.*$/, '').trim();
      if (/^v?\d|FailSafe|later|or\b/i.test(last)) version = last;
    }
    const text2 = line.replace(re, '').replace(/^\s*/, '').trim();
    out.push({ id, done, version, text: text2 });
  }
  return out;
}

/**
 * Tally an FX/B set into the {verified, unverified, open} shape computePct wants.
 * FX rows count by status (n/a excluded); backlog items count done→verified,
 * open→open.
 */
export function tally(
  features: FeatureRow[],
  backlog: BacklogItem[],
): { verified: number; unverified: number; open: number } {
  let verified = 0, unverified = 0, open = 0;
  for (const f of features) {
    if (f.status === 'verified') verified += 1;
    else if (f.status === 'unverified') unverified += 1;
    // n/a excluded
  }
  for (const b of backlog) {
    if (b.done) verified += 1; else open += 1;
  }
  return { verified, unverified, open };
}
