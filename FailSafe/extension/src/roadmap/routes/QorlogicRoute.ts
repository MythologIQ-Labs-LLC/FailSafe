// Phase 3 / Phase 4 (V3 Path A): qorlogic-scoped routes registered directly
// on the Express app from bootstrapServers.ts via consoleServer.getExpressApp().
// Bypasses ConsoleRouteRegistrar (at-cap at 250L) per the plan's audit Entry
// #367 trade-off note. Owns:
//   GET  /api/qorlogic/list-skills        → enumerateSkillsForHost
//   POST /api/actions/scaffold-skills/preview → previewInstall (Phase 4)

import type { Application, Request, Response } from "express";

export interface QorlogicListSkillsResult {
  skills: Array<{ name: string; kind: string; path: string }>;
  degraded: boolean;
  reason?: string;
}

export interface QorlogicPreviewResult {
  wouldWrite?: Array<{ path: string; sha256?: string }>;
  wouldDelete?: Array<{ path: string }>;
  degraded?: boolean;
  reason?: string;
}

export interface QorlogicRouteDeps {
  enumerateSkillsForHost: (
    host: string,
    scope?: "repo" | "global",
  ) => Promise<QorlogicListSkillsResult>;
  previewInstall: (
    host: string,
    scope: "repo" | "global",
    skillFilter?: string[],
  ) => Promise<QorlogicPreviewResult>;
}

function parseScope(raw: unknown): "repo" | "global" {
  return raw === "global" ? "global" : "repo";
}

function registerListSkills(app: Application, deps: QorlogicRouteDeps): void {
  app.get("/api/qorlogic/list-skills", async (req: Request, res: Response) => {
    const host = String(req.query.host || "");
    if (!host) {
      res.status(400).json({ error: "missing host query param" });
      return;
    }
    const scope = parseScope(req.query.scope);
    try {
      const result = await deps.enumerateSkillsForHost(host, scope);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}

/**
 * #463: the frozen 0.176.1 CLI cannot provide an authoritative write-set.
 * No host-name parsing, subprocess, or fake per-host approval can occur here.
 */
function registerPreview(app: Application): void {
  app.post('/api/actions/scaffold-skills/preview', (_req: Request, res: Response) => {
    res.status(501).json({
      ok: false,
      degraded: true,
      reason: 'frozen-qor-logic-install-preview-unavailable',
    });
  });
}

export function registerQorlogicRoutes(app: Application, deps: QorlogicRouteDeps): void {
  registerListSkills(app, deps);
  registerPreview(app);
}
