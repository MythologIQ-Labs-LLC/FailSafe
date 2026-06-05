/**
 * tracker-model — pure builder + validator for the Development Tracker data
 * (the /api/v1/tracker payload the premium dashboard fetches).
 *
 * The manifest (docs/roadmap/programs.yaml) is the PLANNED layer: dynamic-N
 * programs + weighted phases + verticals + the release axis. This module
 * overlays the LIVE layer — which releases actually shipped (from META_LEDGER
 * DELIVER + git tags) force their rc to `prod` — and validates the weighted
 * model so the client-side cumulative() calculator is trustworthy.
 *
 * Pure (no fs/yaml/git/network) → deterministically unit-tested; the loader
 * (TrackerRoute) does the I/O and calls buildTrackerModel.
 */

export type RcState = 'prod' | 'staging' | 'pr' | 'forecast';

export interface TrackerRc {
  id: string; state: RcState; tag?: string; note?: string;
  /** Traceability link to where this release is documented (GitHub tag/release,
   *  CHANGELOG). Governance doesn't expire — older releases stay traceable. */
  ref?: string;
  /** What shipped in this release (CHANGELOG entry summary) — makes every pip a
   *  self-valuable record even where program-progress data is absent (Option A). */
  summary?: string;
  /** Whether weighted program-progress is populated for this release under the
   *  tiered policy (majors: full history; minors: recent window; patches: recent
   *  window). When false, the release shows only its traceable record. */
  progressEligible?: boolean;
}
export interface TrackerProgram { key: string; name: string; accent: string }
/** issue/pr resolve against the repo; `url` is an arbitrary link (Linear, docs,
 *  a spec) so the specifics of older decisions are never a dead end. */
export type TrackerPhaseLink =
  | { t: 'issue' | 'pr'; n: number; label?: string }
  | { t: 'url'; href: string; label?: string };
export interface TrackerPhase {
  prog: string; key: string; rc: string; w: number; title: string;
  what?: string; benefit?: string;
  breakdown?: Array<{ n: string; how?: string; val?: string }>;
  links?: TrackerPhaseLink[];
}
export interface TrackerVertical {
  key: string; name: string; accent: string; summary?: string;
  functionality?: string[];
  components?: Array<{ c: string; w: string; a: 'paid' | 'admin' | 'public' }>;
  access?: Array<{ a: string; t: string }>;
  backend?: string[]; background?: string;
}
export interface TrackerMeta {
  eyebrow?: string; title?: string; titleEm?: string; sub?: string;
  metaRow?: Array<{ label: string; value: string }>;
  preamble?: string; footer?: string;
  /** The §06 Decisions ledger — read by the dashboard; authored in the manifest. */
  decisions?: Array<{ decision: string; drivenBy: string; evidence: string }>;
}
export interface TrackerManifest {
  repo?: string;
  meta?: TrackerMeta;
  /** Operator-configurable retroactive windows for tiered program-progress
   *  (minors within minorDays, patches within patchDays). Default 60 / 30. */
  progressWindows?: { minorDays?: number; patchDays?: number };
  rcs?: TrackerRc[];
  programs?: TrackerProgram[];
  phases?: TrackerPhase[];
  verticals?: TrackerVertical[];
  convergence?: unknown[];
  promotion?: unknown[];
  levers?: unknown[];
}

export type TrackerModel = TrackerManifest & { rcs: TrackerRc[]; programs: TrackerProgram[]; phases: TrackerPhase[]; verticals: TrackerVertical[] };

export interface TrackerLintFinding { severity: 'warn' | 'abort'; code: string; detail: string }

/** Numeric semver compare on `vX.Y.Z` ids (missing parts → 0). Ascending. */
function cmpSemver(a: string, b: string): number {
  const parse = (s: string) => s.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  return a1 - b1 || a2 - b2 || a3 - b3;
}

/**
 * Discover the COMPLETE release axis from the repo's CHANGELOG — the only
 * artifact that spans the full history (META_LEDGER only covers recent cycles,
 * git tags are incomplete, GitHub Releases are stale). Parses
 * `## [X.Y.Z] - YYYY-MM-DD` headers → prod releases, ascending (oldest first),
 * so the timeline is a complete picture from v0.1.0 to current.
 */
export function discoverReleases(changelogText: string): TrackerRc[] {
  const lines = changelogText.split(/\r?\n/);
  const headerRe = /^##\s*\[?(\d+\.\d+\.\d+)\]?\s*-\s*(\d{4}-\d{2}-\d{2})/;
  const seen = new Set<string>();
  const out: TrackerRc[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = headerRe.exec(lines[i]);
    if (!m) continue;
    const id = `v${m[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // Summary = the first chunk of content under the header (Option A: what
    // shipped), until the next release/section heading. Skips `### Added`-style
    // sub-headers; normalizes bullets; capped so the pip stays readable.
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && body.length < 8; j++) {
      if (/^##\s/.test(lines[j])) break;          // next release/major section
      const t = lines[j].trim();
      if (!t) { if (body.length) break; else continue; } // first paragraph only
      if (/^#{3,}\s/.test(t)) continue;            // skip "### Added" etc.
      body.push(t.replace(/^[-*]\s*/, '• '));
    }
    const summary = body.join(' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    out.push({ id, state: 'prod', tag: 'released', note: m[2], summary: summary || undefined });
  }
  return out.sort((a, b) => cmpSemver(a.id, b.id));
}

/**
 * Tiered program-progress eligibility: the weighted calculator is populated for
 * MAJOR releases across the full history, but for MINOR/PATCH releases only
 * within a recent window (so we don't owe weighted data for every old patch).
 * Pure — `now` is injected. Non-prod (forecast) + undated + unparseable → shown.
 */
export function isProgramEligible(
  rc: TrackerRc,
  opts: { now: Date; minorDays: number; patchDays: number },
): boolean {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(rc.id);
  if (!m) return true;
  const minor = parseInt(m[2], 10);
  const patch = parseInt(m[3], 10);
  if (rc.state !== 'prod') return true;          // forecast/planned → always tracked
  if (minor === 0 && patch === 0) return true;   // major → full history
  const date = rc.note ? new Date(rc.note) : null;
  if (!date || Number.isNaN(date.getTime())) return true;
  const ageDays = (opts.now.getTime() - date.getTime()) / 86_400_000;
  return patch > 0 ? ageDays <= opts.patchDays : ageDays <= opts.minorDays;
}

/**
 * Build the /api/v1/tracker model. The release axis is the DISCOVERED full
 * history (CHANGELOG) when provided, plus any manifest-declared releases that
 * aren't yet discovered (forecasts/future). Git-tagged ids force `prod`.
 */
export function buildTrackerModel(
  manifest: TrackerManifest,
  live: {
    discoveredReleases?: TrackerRc[]; shippedReleaseIds?: string[];
    now?: Date; minorDays?: number; patchDays?: number;
  } = {},
): TrackerModel {
  const shipped = new Set((live.shippedReleaseIds ?? []).map((s) => s.trim()).filter(Boolean));
  const discovered = live.discoveredReleases ?? [];
  const discoveredIds = new Set(discovered.map((r) => r.id));

  let rcs: TrackerRc[];
  if (discovered.length) {
    // Discovered full history (prod, ascending) + manifest releases not yet
    // discovered (future/forecast), appended after the discovered tail.
    const forecasts = (manifest.rcs ?? [])
      .filter((rc) => !discoveredIds.has(rc.id))
      .sort((a, b) => cmpSemver(a.id, b.id));
    rcs = [...discovered, ...forecasts];
  } else {
    // No CHANGELOG available — fall back to the manifest's declared axis.
    rcs = manifest.rcs ?? [];
  }
  rcs = rcs.map((rc) => (shipped.has(rc.id) && rc.state !== 'prod' ? { ...rc, state: 'prod' as RcState } : rc));

  // Traceability: every shipped release links to its record so older decisions
  // stay auditable (tagged → GitHub release/tag; changelog-only → CHANGELOG).
  const repo = manifest.repo ?? '';
  rcs = rcs.map((rc) => {
    if (rc.ref || !repo) return rc;
    if (shipped.has(rc.id)) return { ...rc, ref: `https://github.com/${repo}/releases/tag/${rc.id}` };
    if (rc.state === 'prod') return { ...rc, ref: `https://github.com/${repo}/blob/main/CHANGELOG.md` };
    return rc; // forecast: no ref unless the manifest declared one
  });

  // Tiered program-progress eligibility (majors always; minors/patches within
  // their recent window). Computed only when `now` is supplied — the live route
  // always supplies it; pure callers may omit, leaving progressEligible
  // undefined (the dashboard treats undefined as eligible for back-compat).
  if (live.now) {
    const minorDays = live.minorDays ?? 60;
    const patchDays = live.patchDays ?? 30;
    const now = live.now;
    rcs = rcs.map((rc) => ({ ...rc, progressEligible: isProgramEligible(rc, { now, minorDays, patchDays }) }));
  }

  return {
    repo,
    meta: manifest.meta ?? {},
    rcs,
    programs: manifest.programs ?? [],
    phases: manifest.phases ?? [],
    verticals: manifest.verticals ?? [],
    ...(manifest.convergence ? { convergence: manifest.convergence } : {}),
    ...(manifest.promotion ? { promotion: manifest.promotion } : {}),
    ...(manifest.levers ? { levers: manifest.levers } : {}),
  };
}

/**
 * Validate the weighted model so the timeline calculator is sound. `abort`
 * findings mean the data is structurally broken (dangling rc/prog refs);
 * `warn` findings (weights not ~100) are surfaced but non-fatal.
 */
export function validateManifest(m: TrackerManifest, knownReleaseIds?: string[]): TrackerLintFinding[] {
  const out: TrackerLintFinding[] = [];
  // Phases may target discovered (CHANGELOG) releases not declared in the
  // manifest — validate against the resolved axis when supplied.
  const rcIds = new Set(knownReleaseIds ?? (m.rcs ?? []).map((r) => r.id));
  const progKeys = new Set((m.programs ?? []).map((p) => p.key));

  for (const ph of m.phases ?? []) {
    if (!progKeys.has(ph.prog)) {
      out.push({ severity: 'abort', code: 'phase-unknown-program', detail: `phase ${ph.key} → program '${ph.prog}' not in programs[]` });
    }
    if (!rcIds.has(ph.rc)) {
      out.push({ severity: 'abort', code: 'phase-unknown-rc', detail: `phase ${ph.key} → release '${ph.rc}' not in rcs[]` });
    }
    if (typeof ph.w !== 'number' || ph.w < 0) {
      out.push({ severity: 'abort', code: 'phase-bad-weight', detail: `phase ${ph.key} → weight must be a non-negative number` });
    }
  }

  // Per-program weights should sum to ~100 so cumulative() reads as a percent.
  for (const prog of m.programs ?? []) {
    const sum = (m.phases ?? []).filter((p) => p.prog === prog.key).reduce((a, p) => a + (typeof p.w === 'number' ? p.w : 0), 0);
    if (sum !== 100) {
      out.push({ severity: 'warn', code: 'program-weight-sum', detail: `program '${prog.key}' phase weights sum to ${sum}, not 100` });
    }
  }
  return out;
}
