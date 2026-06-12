// FX891 — Tracker Taxonomy config routes. GET serves the operator config
// (tracker-config.yaml wins; else derived from programs.yaml); POST is a governed
// local write that persists tracker-config.yaml AND emits the governed directive.
// Every handler short-circuits remote requests (mirrors BrainstormRoute).

import express, { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type { ApiRouteDeps } from "./types";
import type { TrackerManifest } from "../tracker/tracker-model";
import {
  parseTrackerConfig, serializeTrackerConfig, deriveConfigFromManifest,
  buildTaxonomyDirective, lintConfig, type TrackerConfig,
} from "../tracker/tracker-config";

const CONFIG_RELPATH = "docs/roadmap/tracker-config.yaml";
const DIRECTIVE_RELPATH = ".failsafe/governance/tracker-taxonomy.directive.md";

export function setupTrackerConfigRoutes(
  app: express.Application,
  deps: ApiRouteDeps,
): void {
  const configPath = () => path.join(deps.workspaceRoot, "docs", "roadmap", "tracker-config.yaml");
  const manifestPath = () => path.join(deps.workspaceRoot, "docs", "roadmap", "programs.yaml");
  const directivePath = () => path.join(deps.workspaceRoot, ".failsafe", "governance", "tracker-taxonomy.directive.md");

  // GET — current operator taxonomy. tracker-config.yaml is authoritative; absent,
  // derive from programs.yaml (+ FX887-proposed agents); absent, honest-empty.
  app.get("/api/v1/tracker/config", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    try {
      const config = parseTrackerConfig(fs.readFileSync(configPath(), "utf-8"));
      res.json({ config, source: "config", lint: lintConfig(config) });
      return;
    } catch { /* no config file — fall through to derive */ }
    try {
      const manifest = (yaml.load(fs.readFileSync(manifestPath(), "utf-8")) || {}) as TrackerManifest;
      const config = deriveConfigFromManifest(manifest);
      res.json({ config, source: "derived", lint: lintConfig(config) });
      return;
    } catch { /* no manifest either */ }
    res.json({ config: { programs: [], verticals: [], agents: [] }, source: "empty", lint: [] });
  });

  // POST — governed write: persist tracker-config.yaml + emit the directive record.
  app.post("/api/v1/tracker/config", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const body = (req.body || {}) as Partial<TrackerConfig>;
    const config: TrackerConfig = {
      programs: Array.isArray(body.programs) ? body.programs : [],
      verticals: Array.isArray(body.verticals) ? body.verticals : [],
      agents: Array.isArray(body.agents) ? body.agents : [],
    };
    const written: string[] = [];
    try {
      const cfgP = configPath();
      fs.mkdirSync(path.dirname(cfgP), { recursive: true });
      fs.writeFileSync(cfgP, serializeTrackerConfig(config), "utf-8");
      written.push(CONFIG_RELPATH);

      const dirP = directivePath();
      fs.mkdirSync(path.dirname(dirP), { recursive: true });
      fs.writeFileSync(dirP, buildTaxonomyDirective(config, { at: new Date().toISOString() }), "utf-8");
      written.push(DIRECTIVE_RELPATH);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }
    deps.broadcast({ type: "tracker.config.updated", payload: { written } });
    res.json({ ok: true, written, lint: lintConfig(config) });
  });
}
