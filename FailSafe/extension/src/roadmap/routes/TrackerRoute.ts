import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { TrackerGenerator } from '../tracker/TrackerGenerator';

/**
 * TrackerRoute — serves the Development Tracker (standard:
 * docs/design/DEVELOPMENT_TRACKER_STANDARD.md).
 *
 *   GET /console/tracker  → the interactive HTML template
 *   GET /api/v1/tracker   → { model, lint, ok } generated fresh per request
 *
 * `render` reads the canonical template from docs/design/templates via
 * workspaceRoot (present at runtime regardless of the UI build/copy step), so
 * serving does not depend on uiDir resolution or copy-ui-js.
 */

export interface TrackerRouteDeps {
  workspaceRoot: string;
  uiDir: string;
}

const TEMPLATE_CANDIDATES = (deps: TrackerRouteDeps): string[] => [
  path.join(deps.workspaceRoot, 'docs', 'design', 'templates', 'development-tracker.template.html'),
  path.join(deps.uiDir, 'development-tracker.html'),
];

export const TrackerRoute = {
  render(_req: Request, res: Response, deps: TrackerRouteDeps): void {
    const file = TEMPLATE_CANDIDATES(deps).find((f) => {
      try { return fs.existsSync(f); } catch { return false; }
    });
    if (!file) {
      res.status(503).send('Development Tracker template not found (docs/design/templates/development-tracker.template.html)');
      return;
    }
    res.type('html').send(fs.readFileSync(file, 'utf-8'));
  },

  async api(_req: Request, res: Response, deps: TrackerRouteDeps): Promise<void> {
    try {
      const gen = new TrackerGenerator({
        workspaceRoot: deps.workspaceRoot,
        now: () => new Date(),
      });
      const { model, lint } = await gen.generate();
      res.json({ model, lint, ok: !lint.some((f) => f.severity === 'abort') });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  },
};
