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

async function runPreviewBatch(
  hosts: string[],
  scope: "repo" | "global",
  skillFilter: Record<string, string[]>,
  preview: QorlogicRouteDeps["previewInstall"],
): Promise<Record<string, QorlogicPreviewResult>> {
  const results: Record<string, QorlogicPreviewResult> = {};
  for (const host of hosts) {
    const filter = Array.isArray(skillFilter[host]) ? skillFilter[host] : undefined;
    results[host] = await preview(host, scope, filter);
  }
  return results;
}

function registerPreview(app: Application, deps: QorlogicRouteDeps): void {
  app.post("/api/actions/scaffold-skills/preview", async (req: Request, res: Response) => {
    const hosts: string[] = Array.isArray(req.body?.hosts) ? req.body.hosts : [];
    const scope = parseScope(req.body?.scope);
    const skillFilter: Record<string, string[]> = req.body?.skillFilter || {};
    if (hosts.length === 0) {
      res.status(400).json({ error: "no hosts specified" });
      return;
    }
    try {
      const byHost = await runPreviewBatch(hosts, scope, skillFilter, deps.previewInstall);
      res.json({ ok: true, byHost });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}

export function registerQorlogicRoutes(app: Application, deps: QorlogicRouteDeps): void {
  registerListSkills(app, deps);
  registerPreview(app, deps);
}
