import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as yaml from 'js-yaml';
import { buildTrackerModel, validateManifest, discoverReleases, type TrackerManifest } from '../tracker/tracker-model';
import { discoverMergedPrs, detectCadence } from '../tracker/tracker-pr-discovery';
import { projectTrackerManifest } from '../tracker/governance-projection';
import { nodeSidecarDeps } from '../tracker/governance-sidecar';
import { GIT_LOG_MAX_COMMITS } from '../tracker/git-log-window';

/**
 * TrackerRoute — serves the Development Tracker (standard:
 * docs/design/DEVELOPMENT_TRACKER_STANDARD.md).
 *
 *   GET /console/tracker  → the premium dashboard ENGINE (static HTML; fetches
 *                            its data from /api/v1/tracker at runtime)
 *   GET /api/v1/tracker   → { model, lint, ok } — the PLANNED manifest
 *                            (docs/roadmap/programs.yaml) overlaid with the LIVE
 *                            layer (shipped releases from git tags force prod)
 *
 * The dashboard is data-driven: editing the tracker = editing the manifest, not
 * markup. The engine is a single static file; this route only supplies data.
 */

export interface TrackerRouteDeps {
  workspaceRoot: string;
  uiDir: string;
  /** Program-progress retroactive windows (operator-configurable via VS Code
   *  settings failsafe.tracker.{minor,patch}WindowDays). Default 60 / 30. */
  minorWindowDays?: number;
  patchWindowDays?: number;
}

const TEMPLATE_CANDIDATES = (deps: TrackerRouteDeps): string[] => [
  path.join(deps.uiDir, 'tracker', 'tracker-dashboard.html'),
  // src fallback (Playwright/dev resolve uiDir to a src tree)
  path.join(deps.uiDir, '..', '..', 'roadmap', 'ui', 'tracker', 'tracker-dashboard.html'),
  path.join(deps.workspaceRoot, 'FailSafe', 'extension', 'src', 'roadmap', 'ui', 'tracker', 'tracker-dashboard.html'),
];

const MANIFEST_PATH = (workspaceRoot: string): string =>
  path.join(workspaceRoot, 'docs', 'roadmap', 'programs.yaml');

/**
 * Project a manifest from the governance ledger (A.2b, #202) — the GOVERNED-repo
 * fallback when the operator has no hand-authored programs.yaml. Reuses the FX865
 * sidecar I/O seam (nodeSidecarDeps) to read META_LEDGER + FEATURE_INDEX + plans.
 * `knownReleaseIds` (the discovered axis) lets plan phases anchor only to real
 * releases. Ungoverned repo (no META_LEDGER) → {} → discovered-only, as before.
 */
function projectGovernanceManifest(workspaceRoot: string, knownReleaseIds: string[]): TrackerManifest {
  const d = nodeSidecarDeps(workspaceRoot);
  const metaLedger = d.readFile('docs/META_LEDGER.md');
  if (!metaLedger || !metaLedger.trim()) return {};
  return projectTrackerManifest({
    metaLedger,
    featureIndex: d.readFile('docs/FEATURE_INDEX.md') ?? '',
    plans: d.readPlans(),
    repo: d.repoSlug(),
    knownReleaseIds,
  });
}

/** Best-effort: the git tags present in the repo (corroborate shipped state). */
function shippedReleaseIds(workspaceRoot: string): string[] {
  try {
    const out = execFileSync('git', ['tag'], { cwd: workspaceRoot, encoding: 'utf-8', timeout: 4000 });
    return out.split('\n').map((t) => t.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** The repo's CHANGELOG is the complete release-history source (v0.1.0 → now). */
function readChangelog(workspaceRoot: string): string {
  try {
    return fs.readFileSync(path.join(workspaceRoot, 'CHANGELOG.md'), 'utf-8');
  } catch {
    return '';
  }
}

/** Merged-PR git-log text (`<date>\t<subject>` per line) — the FALLBACK axis for
 *  PR-incremental repos with no semver CHANGELOG. Degrade-safe (no git / not a
 *  repo → ''), mirroring shippedReleaseIds. Matches discoverMergedPrs's expected
 *  input (GH #174). Bounded to GIT_LOG_MAX_COMMITS + 1 most recent commits
 *  (FailSafe#244 large-repo audit, FailSafe#393) so a deep history cannot block
 *  the extension host for multiple seconds or exceed the output buffer. The +1
 *  serves two purposes together: it gives the last IN-WINDOW commit a real
 *  `next` for discoverMergedPrs's titleFor lookahead (without it, a merge
 *  commit landing exactly at the window edge would wrongly fall back to a
 *  humanized branch name — call discoverMergedPrs with maxAnchors:
 *  GIT_LOG_MAX_COMMITS so that extra commit is lookahead-only, never its own
 *  anchor), and its mere presence signals truncation with no second git call
 *  (see readGitLogTruncated). */
function readGitLog(workspaceRoot: string): string {
  try {
    return execFileSync('git', [
      'log', `--max-count=${GIT_LOG_MAX_COMMITS + 1}`, '--pretty=format:%ad%x09%s', '--date=short',
    ], {
      cwd: workspaceRoot, encoding: 'utf-8', timeout: 4000, maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

/** Whether readGitLog's text actually received its +1 lookahead line — i.e.
 *  history is deeper than GIT_LOG_MAX_COMMITS and the window is truncated.
 *  (Received exactly GIT_LOG_MAX_COMMITS + 1 lines is ambiguous — the repo
 *  could have exactly that many commits, not more — but that ambiguity only
 *  affects the exact boundary and errs toward disclosing, not toward silence.
 *  The exact total (M in "N of M") is no longer known without a second git
 *  call; the message is honest about the window without claiming the total.) */
function readGitLogTruncated(gitLogText: string): boolean {
  if (!gitLogText) return false;
  let lines = 1;
  for (let i = 0; i < gitLogText.length; i++) if (gitLogText.charCodeAt(i) === 10) lines++;
  return lines > GIT_LOG_MAX_COMMITS;
}

export const TrackerRoute = {
  render(_req: Request, res: Response, deps: TrackerRouteDeps): void {
    const file = TEMPLATE_CANDIDATES(deps).find((f) => {
      try { return fs.existsSync(f); } catch { return false; }
    });
    if (!file) {
      res.status(503).send('Development Tracker dashboard not found (src/roadmap/ui/tracker/tracker-dashboard.html)');
      return;
    }
    res.type('html').send(fs.readFileSync(file, 'utf-8'));
  },

  api(_req: Request, res: Response, deps: TrackerRouteDeps): void {
    try {
      const manifestPath = MANIFEST_PATH(deps.workspaceRoot);
      // Discover the complete release axis from the CHANGELOG (the governance
      // files don't span the full history); the manifest only adds forecasts.
      // Computed FIRST so a governance projection can anchor plan phases to it.
      const discoveredReleases = discoverReleases(readChangelog(deps.workspaceRoot));
      // GH #174 Part 2: PR-incremental fallback. A repo with no semver releases
      // (e.g. only `## Unreleased` + merged-PR git history) would otherwise show a
      // blank shell. Detect the cadence and, when it's pr-incremental, use the
      // merged-PR anchors as the timeline axis. Semver repos are unaffected.
      const gitLogText = readGitLog(deps.workspaceRoot);
      const prAnchors = discoverMergedPrs(gitLogText, GIT_LOG_MAX_COMMITS);
      const cadence = detectCadence(discoveredReleases, prAnchors);
      const axis = cadence === 'pr-incremental' ? prAnchors : discoveredReleases;

      // Manifest source (A.2b, #202): operator programs.yaml is authoritative; absent
      // on a GOVERNED repo → project the manifest from the governance ledger
      // (META_LEDGER + FEATURE_INDEX + plans) so the dashboard populates from
      // governance instead of showing a bare timeline; absent + ungoverned → {}.
      // GH #167-followup: a missing planning manifest is NEVER a hard failure.
      const manifestPresent = fs.existsSync(manifestPath);
      let manifestSource: 'operator' | 'projection' | 'none' = 'none';
      let manifest: TrackerManifest;
      if (manifestPresent) {
        manifest = (yaml.load(fs.readFileSync(manifestPath, 'utf-8')) ?? {}) as TrackerManifest;
        manifestSource = 'operator';
      } else {
        manifest = projectGovernanceManifest(deps.workspaceRoot, axis.map((r) => r.id));
        if ((manifest.programs?.length ?? 0) || (manifest.verticals?.length ?? 0) || (manifest.meta?.decisions?.length ?? 0)) {
          manifestSource = 'projection';
        }
      }
      // Retroactive windows: deps override (future VS Code settings) → manifest
      // progressWindows (user-editable today) → defaults 60 / 30.
      const pw = manifest.progressWindows ?? {};
      const model = buildTrackerModel(manifest, {
        discoveredReleases: axis,
        shippedReleaseIds: shippedReleaseIds(deps.workspaceRoot),
        now: new Date(),
        minorDays: deps.minorWindowDays ?? pw.minorDays ?? 60,
        patchDays: deps.patchWindowDays ?? pw.patchDays ?? 30,
      });
      // Validate phases against the RESOLVED axis (discovered + manifest forecasts).
      const lint = validateManifest(manifest, model.rcs.map((r) => r.id));
      // Disclose a bounded git-log window (FailSafe#244 large-repo audit).
      // MUST NOT gate on cadence === 'pr-incremental': when the bounded window
      // drops every merge anchor, cadence silently collapses to 'empty' instead
      // — exactly the case that most needs disclosure. Gate on whether the
      // git-log axis was actually consulted for cadence resolution instead
      // (i.e. no semver releases won outright); skip the check only when
      // semver releases already make the git-log axis irrelevant.
      if (discoveredReleases.length === 0 && readGitLogTruncated(gitLogText)) {
        lint.push({
          severity: 'warn',
          code: 'git-log-truncated',
          detail: `Merged-PR anchor detection used only the most recent ${GIT_LOG_MAX_COMMITS} commits; older merged-PR anchors (and possibly earlier merge dates for anchors shown) are not represented on this axis.`,
        });
      }
      // Surface the manifest source as a non-blocking advisory (never an abort).
      if (!manifestPresent) {
        lint.push(manifestSource === 'projection'
          ? {
            severity: 'warn',
            code: 'manifest-projected',
            detail: 'No docs/roadmap/programs.yaml — projected the tracker from the governance ledger (META_LEDGER + FEATURE_INDEX + plans). Add a programs.yaml to override.',
          }
          : {
            severity: 'warn',
            code: 'manifest-absent',
            detail: 'No planning manifest at docs/roadmap/programs.yaml — showing discovered releases only. Add the manifest to plan forecasts.',
          });
      }
      // The dashboard reads the data fields at the TOP LEVEL (data.rcs, data.meta,
      // …), so spread the model out; lint/ok/manifestPresent/manifestSource ride along.
      res.json({ ...model, lint, manifestPresent, manifestSource, cadence, ok: !lint.some((f) => f.severity === 'abort') });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  },
};
