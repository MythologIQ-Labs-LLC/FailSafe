// FX891 — Tracker Taxonomy config routes. GET serves the operator config
// (tracker-config.yaml wins; else derived from programs.yaml); POST is a governed
// local write that persists tracker-config.yaml AND emits the governed directive.
// Every handler short-circuits remote requests (mirrors BrainstormRoute).
// #548: both answers carry `drift` — where each declared vertical's functionality
// differs from the Console navigation (CONSOLE_VERTICALS). It is a report only: GET
// never writes, normalizes or re-serializes the operator's file.
// B330: both targets are built from the real workspace root and pre-checked before any
// read, mkdir or write (trackerConfigWrite.ts); nothing is ever written, created or
// truncated outside the workspace through a linked folder, a linked or hard-linked target.

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
import { checkWriteTarget, prepareTargetFolder, writeContained, type TargetCheck, type TargetCode } from "./trackerConfigWrite";

const CONFIG_RELPATH = "docs/roadmap/tracker-config.yaml";
const DIRECTIVE_RELPATH = ".failsafe/governance/tracker-taxonomy.directive.md";

type ConfigFile =
  | { state: "absent"; check: Extract<TargetCheck, { ok: true }> }
  | { state: "present"; bytes: Buffer; check: Extract<TargetCheck, { ok: true }> }
  | { state: "refused"; code: TargetCode | "unreadable"; error: string };

/** #548 + B330: what is at the config path. The pre-check (checkWriteTarget) refuses a
 *  folder that resolves outside the real root, a non-folder ancestor, a link at the path,
 *  a non-file, a hard-linked file and a file with no identity; neither GET nor POST then
 *  falls back to programs.yaml or reads or writes through it. */
function readConfigFile(file: string, rootReal: string): ConfigFile {
  const check = checkWriteTarget(rootReal, file, "config");
  if (!check.ok) return { state: "refused", code: check.code, error: check.message };
  if (!check.present) return { state: "absent", check };
  try { return { state: "present", bytes: fs.readFileSync(file), check }; } catch {
    return { state: "refused", code: "unreadable", error: `${CONFIG_RELPATH} exists but could not be read` };
  }
}

/** The real workspace root, or null when it cannot be resolved. */
function realRoot(root: string): string | null {
  try { return fs.realpathSync.native(root); } catch { return null; }
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
  // B330: targets are built from the REAL workspace root.
  const configPath = (rootReal: string) => path.join(rootReal, "docs", "roadmap", "tracker-config.yaml");
  const manifestPath = (rootReal: string) => path.join(rootReal, "docs", "roadmap", "programs.yaml");
  const directivePath = (rootReal: string) => path.join(rootReal, ".failsafe", "governance", "tracker-taxonomy.directive.md");

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
      res.status(500).json({ error: chosen.error, code: chosen.code });
      return;
    }
    res.json({ config: chosen.config, source: chosen.source, fingerprint: chosen.fingerprint, ...guardedReport(chosen.config) });
  });

  function readConfigSource():
    | { config: TrackerConfig; source: "config" | "derived" | "empty"; fingerprint: string | null }
    | { error: string; code: string } {
    const rootReal = realRoot(deps.workspaceRoot);
    if (!rootReal) return { error: "the workspace folder could not be resolved", code: "unresolved-path" };
    const file = readConfigFile(configPath(rootReal), rootReal);
    if (file.state === "refused") return { error: file.error, code: file.code };
    if (file.state === "present") {
      try {
        return { config: parseTrackerConfigStrict(file.bytes.toString("utf-8")), source: "config", fingerprint: fingerprintOf(file) };
      } catch {
        return { error: `${CONFIG_RELPATH} exists but could not be parsed; fix the file, then reload the Console`, code: "unparseable" };
      }
    }
    try {
      const manifest = (yaml.load(fs.readFileSync(manifestPath(rootReal), "utf-8")) || {}) as TrackerManifest;
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
    const rootReal = realRoot(deps.workspaceRoot);
    if (!rootReal) {
      res.status(500).json({ ok: false, error: "unresolved-path", detail: "the workspace folder could not be resolved" });
      return;
    }
    const cfgP = configPath(rootReal);
    const dirP = directivePath(rootReal);
    // B330 (LD2): both targets are checked before anything is read, created or written.
    const dirCheck = checkWriteTarget(rootReal, dirP, "directive");
    const current = readConfigFile(cfgP, rootReal);
    if (current.state === "refused") {
      res.status(500).json({ ok: false, error: current.code, detail: current.error });
      return;
    }
    if (!dirCheck.ok) {
      res.status(500).json({ ok: false, error: dirCheck.code, detail: dirCheck.message });
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
    const fingerprint = sha256(Buffer.from(text, "utf-8"));
    // LD3 (a): both folders are prepared (realpath checked before and after mkdir) before
    // the config is opened; a folder that does not stay inside writes nothing.
    const cfgFolder = prepareTargetFolder(rootReal, cfgP);
    const dirFolder = cfgFolder ? prepareTargetFolder(rootReal, dirP) : null;
    if (!cfgFolder || !dirFolder) {
    const folderName = !cfgFolder ? "docs/roadmap" : ".failsafe/governance";
      res.status(500).json({ ok: false, error: "outside-workspace", detail: `${folderName} does not stay inside the workspace` });
      return;
    }
    // LD3 (b)-(d), config phase: a race (EEXIST, a folder or file changed, an identity or
    // link-count mismatch) is 409 changed-on-disk; any other I/O error is 500.
    const cfgWrite = writeContained(rootReal, cfgP, Buffer.from(text, "utf-8"), current.check, cfgFolder);
    if (!cfgWrite.ok) {
      if (cfgWrite.race) res.status(409).json({ ok: false, error: "changed-on-disk", detail: cfgWrite.detail });
      else res.status(500).json({ ok: false, error: "write-failed", detail: cfgWrite.detail });
      return;
    }
    written.push(CONFIG_RELPATH);
    // Directive phase: the taxonomy WAS written, so any failure is N-e directive-write-failed
    // with the new fingerprint (the editor adopts it; otherwise its next Save is a false 409).
    const directive = Buffer.from(buildTaxonomyDirective(config, { at: new Date().toISOString() }), "utf-8");
    const dirWrite = writeContained(rootReal, dirP, directive, dirCheck, dirFolder);
    if (!dirWrite.ok) {
      deps.broadcast({ type: "tracker.config.updated", payload: { written, fingerprint } });
      res.status(500).json({ ok: false, error: "directive-write-failed", detail: dirWrite.detail, written, fingerprint });
      return;
    }
    written.push(DIRECTIVE_RELPATH);
    deps.broadcast({ type: "tracker.config.updated", payload: { written, fingerprint } });
    res.json({ ok: true, written, fingerprint, ...guardedReport(config) });
  });
}
