// FX891 — Tracker Taxonomy config routes. GET serves the operator config
// (tracker-config.yaml wins; else derived from programs.yaml); POST is a governed
// local write that persists tracker-config.yaml AND emits the governed directive.
// Every handler short-circuits remote requests (mirrors BrainstormRoute).
// #548: both answers carry `drift` — where each declared vertical's functionality
// differs from the Console navigation (CONSOLE_VERTICALS). It is a report only: GET
// never writes, normalizes or re-serializes the operator's file.

import express, { Request, Response } from "express";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type { ApiRouteDeps } from "./types";
import { rateLimit } from "express-rate-limit";
import { consoleRequestGuard } from "./consoleRequestGuard";
import type { TrackerManifest, TrackerLintFinding } from "../tracker/tracker-model";
import {
  parseTrackerConfigStrict, serializeTrackerConfig, deriveConfigFromManifest,
  buildTaxonomyDirective, lintConfig, type TrackerConfig,
} from "../tracker/tracker-config";
import { computeTaxonomyDrift, type TaxonomyDrift } from "../tracker/taxonomy-drift";

const CONFIG_RELPATH = "docs/roadmap/tracker-config.yaml";
const DIRECTIVE_RELPATH = ".failsafe/governance/tracker-taxonomy.directive.md";

type ConfigFile =
  | { state: "absent" }
  | { state: "present"; bytes: Buffer }
  | { state: "refused"; error: string };

/** #548: what is at the config path, without following a link. Absent only when lstat
 *  says ENOENT/ENOTDIR AND the nearest existing ancestor is a folder (Windows reports
 *  ENOENT under a regular file, so the ancestor is checked on every OS). A link at the
 *  path, a non-folder ancestor or a read failure is refused, never absent, so neither
 *  GET nor POST falls back to programs.yaml or writes through it. */
function readConfigFile(file: string, root: string): ConfigFile {
  let st: fs.Stats;
  try { st = fs.lstatSync(file); } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT" && code !== "ENOTDIR") return { state: "refused", error: `${CONFIG_RELPATH} exists but could not be read` };
    return ancestorBlocks(file, root) ?? { state: "absent" };
  }
  if (st.isSymbolicLink()) return { state: "refused", error: `${CONFIG_RELPATH} is a symbolic link; FailSafe does not follow it` };
  try { return { state: "present", bytes: fs.readFileSync(file) }; } catch {
    return { state: "refused", error: `${CONFIG_RELPATH} exists but could not be read` };
  }
}

/** The nearest existing ancestor of an absent file must be a folder (or a link, B330). */
function ancestorBlocks(file: string, root: string): ConfigFile | undefined {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    let st: fs.Stats | undefined;
    try { st = fs.lstatSync(dir); } catch { /* keep walking up */ }
    if (st) {
      if (st.isDirectory() || st.isSymbolicLink()) return undefined;
      return { state: "refused", error: `${path.relative(root, dir).split(path.sep).join("/")} is not a folder` };
    }
    if (dir === root || path.dirname(dir) === dir) return undefined;
  }
}

/** Optimistic-concurrency fingerprint: sha256 of the file's bytes, or null when absent. */
const sha256 = (data: Buffer): string => crypto.createHash("sha256").update(data).digest("hex");
const fingerprintOf = (f: ConfigFile): string | null => (f.state === "present" ? sha256(f.bytes) : null);

/** Lint and Console drift, each in its own guard: a failure leaves that field out. */
function guardedReport(config: TrackerConfig): { lint?: TrackerLintFinding[]; drift?: TaxonomyDrift } {
  const out: { lint?: TrackerLintFinding[]; drift?: TaxonomyDrift } = {};
  try { out.lint = lintConfig(config); } catch { /* malformed rows — lint left out */ }
  try { out.drift = computeTaxonomyDrift(config.verticals); } catch { /* left out */ }
  return out;
}

export function setupTrackerConfigRoutes(
  app: express.Application,
  deps: ApiRouteDeps,
): void {
  const configPath = () => path.join(deps.workspaceRoot, "docs", "roadmap", "tracker-config.yaml");
  const manifestPath = () => path.join(deps.workspaceRoot, "docs", "roadmap", "programs.yaml");
  const directivePath = () => path.join(deps.workspaceRoot, ".failsafe", "governance", "tracker-taxonomy.directive.md");

  // GET — current operator taxonomy. tracker-config.yaml wins when it exists; absent,
  // derive from programs.yaml (+ FX887-proposed agents); absent, honest-empty.
  // #548: the source is decided FIRST, by the config file's existence (only ENOENT
  // means absent). A config that exists but cannot be read or parsed answers 500 and
  // never falls back to programs.yaml, so the editor's next Save cannot overwrite it.
  // Lint and the Console drift report each run in their own guard and can only be
  // left out, never change the source. GET writes nothing.
  app.get("/api/v1/tracker/config", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const chosen = readConfigSource();
    if ("error" in chosen) {
      res.status(500).json({ error: chosen.error });
      return;
    }
    res.json({ config: chosen.config, source: chosen.source, fingerprint: chosen.fingerprint, ...guardedReport(chosen.config) });
  });

  function readConfigSource():
    | { config: TrackerConfig; source: "config" | "derived" | "empty"; fingerprint: string | null }
    | { error: string } {
    const file = readConfigFile(configPath(), deps.workspaceRoot);
    if (file.state === "refused") return { error: file.error };
    if (file.state === "present") {
      try {
        return { config: parseTrackerConfigStrict(file.bytes.toString("utf-8")), source: "config", fingerprint: fingerprintOf(file) };
      } catch {
        return { error: `${CONFIG_RELPATH} exists but could not be parsed; fix the file, then reload the Console` };
      }
    }
    try {
      const manifest = (yaml.load(fs.readFileSync(manifestPath(), "utf-8")) || {}) as TrackerManifest;
      return { config: deriveConfigFromManifest(manifest), source: "derived", fingerprint: null };
    } catch { /* no usable manifest either */ }
    return { config: { programs: [], verticals: [], agents: [] }, source: "empty", fingerprint: null };
  }

  // POST — governed write: persist tracker-config.yaml + emit the directive record.
  // #538 (B293): loopback socket, loopback Host, same-origin Origin and a JSON body are
  // required; a body-less cross-site POST used to overwrite the taxonomy with an empty one.
  // The limiter runs after the guard, so refused cross-site requests do not spend it.
  const saveLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: false, legacyHeaders: false });
  app.post("/api/v1/tracker/config", consoleRequestGuard((req, res) => deps.rejectIfRemote(req, res)), saveLimiter, (req: Request, res: Response) => {
    const body = (req.body || {}) as Partial<TrackerConfig> & { fingerprint?: unknown };
    // #548: optimistic concurrency. The editor sends the fingerprint its GET returned
    // (null: the file was absent); a missing field counts as null. A file edited,
    // created or deleted on disk since then answers 409 and nothing is written.
    const expected = body.fingerprint === undefined ? null : body.fingerprint;
    if (expected !== null && (typeof expected !== "string" || !/^[0-9a-f]{64}$/.test(expected))) {
      res.status(400).json({ ok: false, error: "invalid-fingerprint" });
      return;
    }
    const current = readConfigFile(configPath(), deps.workspaceRoot);
    if (current.state === "refused") {
      res.status(500).json({ ok: false, error: current.error });
      return;
    }
    if (fingerprintOf(current) !== expected) {
      res.status(409).json({ ok: false, error: "changed-on-disk" });
      return;
    }
    const config: TrackerConfig = {
      programs: Array.isArray(body.programs) ? body.programs : [],
      verticals: Array.isArray(body.verticals) ? body.verticals : [],
      agents: Array.isArray(body.agents) ? body.agents : [],
    };
    const written: string[] = [];
    const text = serializeTrackerConfig(config);
    try {
      const cfgP = configPath();
      fs.mkdirSync(path.dirname(cfgP), { recursive: true });
      fs.writeFileSync(cfgP, text, "utf-8");
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
    res.json({ ok: true, written, fingerprint: sha256(Buffer.from(text, "utf-8")), ...guardedReport(config) });
  });
}
