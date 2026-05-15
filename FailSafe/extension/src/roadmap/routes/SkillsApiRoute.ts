/**
 * SkillsApiRoute - Express handlers for `/api/skills*` endpoints.
 *
 * Extracted from ConsoleServer.registerSkillRoutes plus the four
 * helper methods (getInstalledSkills, autoIngestWorkspaceSkills,
 * manualIngestSkillPayload, buildSkillRelevance) that backed them.
 * The helpers are intentionally file-scope private functions, not
 * class methods or exports — their only callers live in this module.
 *
 * B166 Phase 2 / plan-v4.10.1a-no-b132. Behavior preserved verbatim.
 */
import type { Application, Request, Response } from "express";
import {
  discoverAllSkills, buildSkillRoots, buildWorkspaceDiscoveryRoots,
} from "../services/SkillDiscovery";
import { autoIngest, manualIngest } from "../services/SkillRegistry";
import { rankSkillForPhase, type SkillRelevance } from "../services/SkillRanker";
import { type InstalledSkill } from "../services/SkillParser";
import type { ApiRouteDeps } from "./types";

function getInstalledSkills(workspaceRoot: string, dirname: string): InstalledSkill[] {
  return discoverAllSkills(workspaceRoot, dirname);
}

function autoIngestWorkspaceSkills(
  workspaceRoot: string,
  dirname: string,
): Record<string, unknown> {
  return autoIngest(
    workspaceRoot,
    buildWorkspaceDiscoveryRoots(workspaceRoot),
    () => getInstalledSkills(workspaceRoot, dirname),
    buildSkillRoots(workspaceRoot, dirname),
  );
}

function manualIngestSkillPayload(
  items: unknown[],
  mode: "file" | "folder",
  workspaceRoot: string,
  dirname: string,
): Record<string, unknown> {
  return manualIngest(
    items, mode, workspaceRoot,
    () => getInstalledSkills(workspaceRoot, dirname),
  );
}

function buildSkillRelevance(
  phase: string,
  workspaceRoot: string,
  dirname: string,
): Record<string, unknown> {
  const catalog = getInstalledSkills(workspaceRoot, dirname);
  const ranked: SkillRelevance[] = catalog
    .map((skill) => rankSkillForPhase(skill, phase))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  let allRelevant = ranked.filter((item) => item.score > 1);
  if (allRelevant.length === 0) allRelevant = ranked.slice();
  const recommended = allRelevant.slice(0, Math.min(4, allRelevant.length));
  const relevantKeys = new Set(allRelevant.map((item) => item.key));
  const otherAvailable = ranked.filter((item) => !relevantKeys.has(item.key));
  return { phase, recommended, allRelevant, otherAvailable };
}

function pickIngestMode(raw: unknown): "file" | "folder" {
  return String(raw || "file").toLowerCase() === "folder" ? "folder" : "file";
}

export function registerSkillsApiRoute(
  app: Application,
  deps: ApiRouteDeps,
): void {
  const ws = deps.workspaceRoot;
  const dn = deps.workspaceDirname;

  app.get("/api/skills", (_req: Request, res: Response) => {
    res.json({ skills: getInstalledSkills(ws, dn) });
  });

  app.post("/api/skills/ingest/auto", (_req: Request, res: Response) => {
    try {
      res.json(autoIngestWorkspaceSkills(ws, dn));
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  app.post("/api/skills/ingest/manual", (req: Request, res: Response) => {
    try {
      const mode = pickIngestMode(req.body?.mode);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      res.json(manualIngestSkillPayload(items, mode, ws, dn));
    } catch (error) {
      res.status(400).json({ ok: false, error: String(error) });
    }
  });

  app.get("/api/skills/relevance", (req: Request, res: Response) => {
    const phase = String(req.query.phase || "").trim().toLowerCase();
    if (!phase) {
      res.status(400).json({ error: "phase is required" });
      return;
    }
    res.json(buildSkillRelevance(phase, ws, dn));
  });
}
