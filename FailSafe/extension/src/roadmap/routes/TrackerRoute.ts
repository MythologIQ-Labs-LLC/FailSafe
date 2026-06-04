import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as yaml from 'js-yaml';
import { buildTrackerModel, validateManifest, discoverReleases, type TrackerManifest } from '../tracker/tracker-model';

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
      // GH #167-followup: a missing planning manifest is NOT a failure. The
      // PLANNED layer (programs.yaml) is optional — the DISCOVERED layer
      // (CHANGELOG + git tags) is enough to render the tracker. Degrade to an
      // empty manifest + a non-blocking advisory so any workspace without a
      // programs.yaml still gets a populated (or honestly-empty) dashboard
      // instead of a hard 503.
      const manifestPresent = fs.existsSync(manifestPath);
      const manifest = (manifestPresent
        ? (yaml.load(fs.readFileSync(manifestPath, 'utf-8')) ?? {})
        : {}) as TrackerManifest;
      // Discover the complete release axis from the CHANGELOG (the governance
      // files don't span the full history); the manifest only adds forecasts.
      const discoveredReleases = discoverReleases(readChangelog(deps.workspaceRoot));
      // Retroactive windows: deps override (future VS Code settings) → manifest
      // progressWindows (user-editable today) → defaults 60 / 30.
      const pw = manifest.progressWindows ?? {};
      const model = buildTrackerModel(manifest, {
        discoveredReleases,
        shippedReleaseIds: shippedReleaseIds(deps.workspaceRoot),
        now: new Date(),
        minorDays: deps.minorWindowDays ?? pw.minorDays ?? 60,
        patchDays: deps.patchWindowDays ?? pw.patchDays ?? 30,
      });
      // Validate phases against the RESOLVED axis (discovered + manifest forecasts).
      const lint = validateManifest(manifest, model.rcs.map((r) => r.id));
      // Surface the absent planning manifest as a non-blocking advisory (never an
      // abort) so the dashboard can show guidance without failing.
      if (!manifestPresent) {
        lint.push({
          severity: 'warn',
          code: 'manifest-absent',
          detail: 'No planning manifest at docs/roadmap/programs.yaml — showing discovered releases only. Add the manifest to plan forecasts.',
        });
      }
      // The dashboard reads the data fields at the TOP LEVEL (data.rcs, data.meta,
      // …), so spread the model out; lint/ok/manifestPresent ride along.
      res.json({ ...model, lint, manifestPresent, ok: !lint.some((f) => f.severity === 'abort') });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  },
};
