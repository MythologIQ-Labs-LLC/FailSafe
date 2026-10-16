/**
 * SkillRegistry - Manages skill registry manifests, approval sets, and ingestion.
 * Extracted from ConsoleServer.ts for modularity.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { powershellFor, trustedExecutablePath } from "../../shared/exec/trustedExecutable";
import {
  type InstalledSkill, type SkillRoot,
  collectSkillMarkdownFiles, toComparablePath,
} from "./SkillParser";
import { adaptSkillsForModel } from "./ModelAdapter";
import { BUILTIN_ADAPTER_CONFIGS } from "./ModelAdapterConfigs";

export { toComparablePath } from "./SkillParser";

export type SkillRegistryEntry = {
  id?: string; timestamp?: string; skillName?: string; skillPath?: string;
  source?: string; owner?: string; versionPin?: string;
  declaredVersion?: string; declaredPermissions?: string[];
  intendedWorkflows?: string[]; compatibilityMap?: string[];
  riskTier?: string; trustTier?: string; runtimeEligibility?: string;
};

export function getSkillRegistryDir(ws: string): string {
  return path.join(ws, ".failsafe", "skill-registry");
}
export function getLegacySkillRegistryPath(ws: string): string {
  return path.join(getSkillRegistryDir(ws), "registry.json");
}
export function getAppSkillManifestPath(ws: string): string {
  return path.join(getSkillRegistryDir(ws), "app-manifest.json");
}
export function getPersonalSkillManifestPath(ws: string): string {
  return path.join(getSkillRegistryDir(ws), "personal-manifest.json");
}

export function readRegistryEntries(paths: string[]): SkillRegistryEntry[] {
  const entries: SkillRegistryEntry[] = [];
  for (const rp of paths) {
    if (!fs.existsSync(rp)) continue;
    let raw = "";
    try { raw = fs.readFileSync(rp, "utf8"); } catch { continue; }
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw) as SkillRegistryEntry[] | SkillRegistryEntry;
      entries.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch { continue; }
  }
  return entries;
}

export function ensureAppSkillManifest(ws: string, skillRoots: SkillRoot[]): void {
  fs.mkdirSync(getSkillRegistryDir(ws), { recursive: true });
  const now = new Date().toISOString();
  const entries: SkillRegistryEntry[] = [];
  const roots = skillRoots.filter(
    (r) => r.sourceType === "project-canonical" && fs.existsSync(r.root),
  );
  for (const root of roots) {
    for (const sf of collectSkillMarkdownFiles(root.root)) {
      entries.push({
        id: crypto.createHash("sha1").update(sf).digest("hex").slice(0, 12),
        timestamp: now, skillName: path.basename(path.dirname(sf)),
        skillPath: path.relative(ws, sf), source: "app",
        owner: "FailSafe", trustTier: "verified", runtimeEligibility: "allowed",
      });
    }
  }
  try {
    fs.writeFileSync(getAppSkillManifestPath(ws), JSON.stringify(entries, null, 2), "utf8");
  } catch { /* Non-fatal. Canonical skills are still admitted by sourceType. */ }
}

export function getApprovedSkillFileSet(ws: string, skillRoots: SkillRoot[]): Set<string> {
  ensureAppSkillManifest(ws, skillRoots);
  const parsed = readRegistryEntries([
    getAppSkillManifestPath(ws), getPersonalSkillManifestPath(ws), getLegacySkillRegistryPath(ws),
  ]);
  if (parsed.length === 0) return new Set<string>();
  const latestByPath = buildLatestByPathMap(parsed, ws);
  return filterApprovedPaths(latestByPath);
}

function buildLatestByPathMap(
  parsed: SkillRegistryEntry[], ws: string,
): Map<string, SkillRegistryEntry> {
  const latest = new Map<string, SkillRegistryEntry>();
  for (const entry of parsed) {
    const rel = String(entry?.skillPath || "").trim();
    if (!rel) continue;
    const key = toComparablePath(path.resolve(ws, rel));
    const existing = latest.get(key);
    const existingTs = Date.parse(String(existing?.timestamp || ""));
    const nextTs = Date.parse(String(entry?.timestamp || ""));
    const isNewer = !existing ||
      (Number.isFinite(nextTs) && (!Number.isFinite(existingTs) || nextTs > existingTs));
    if (isNewer) latest.set(key, entry);
  }
  return latest;
}

function filterApprovedPaths(latest: Map<string, SkillRegistryEntry>): Set<string> {
  const approved = new Set<string>();
  for (const [absPath, entry] of latest.entries()) {
    const tier = String(entry.trustTier || "").toLowerCase();
    const elig = String(entry.runtimeEligibility || "").toLowerCase();
    const isTrusted = tier === "verified" || tier === "conditional";
    if (isTrusted && elig === "allowed") approved.add(toComparablePath(absPath));
  }
  return approved;
}

export function admitSkill(
  skillFile: string, source: string, ws: string,
): { ok: boolean; error: string } {
  const scriptPath = path.join(ws, "tools", "reliability", "admit-skill.ps1");
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `admission script not found: ${scriptPath}` };
  }
  // B211: never a PowerShell found in the workspace (the cwd of this run).
  let shell: string;
  try {
    shell = trustedExecutablePath(powershellFor(process.platform), ws);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const args = [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
    "-SkillPath", skillFile, "-Source", source,
    "-Owner", "FailSafe", "-VersionPin", "local-main",
    "-RegistryPath", getPersonalSkillManifestPath(ws),
  ];
  const result = spawnSync(shell, args, { cwd: ws, encoding: "utf8" }); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute PowerShell path, argv array, no shell
  const ok = result.status === 0;
  const errMsg = String(result.stderr || "").trim() ||
    String(result.stdout || "").trim() ||
    `admit-skill exited with code ${String(result.status ?? "unknown")}`;
  return { ok, error: ok ? "" : errMsg };
}

export function autoIngest(
  ws: string, discoveryRoots: string[],
  getInstalledSkills: () => InstalledSkill[], skillRoots: SkillRoot[],
): Record<string, unknown> {
  const roots = discoveryRoots.filter((r) => fs.existsSync(r));
  const skillFiles = roots.flatMap((r) => collectSkillMarkdownFiles(r));
  const approved = getApprovedSkillFileSet(ws, skillRoots);
  const failures: Array<{ file: string; error: string }> = [];
  let admitted = 0;
  let skipped = 0;
  for (const sf of skillFiles) {
    if (approved.has(toComparablePath(sf))) { skipped += 1; continue; }
    const res = admitSkill(sf, "workspace", ws);
    if (res.ok) admitted += 1;
    else failures.push({ file: sf, error: res.error });
  }
  // Propagate admitted skills to all detected agent config spaces
  const installed = getInstalledSkills();
  const propagation: Record<string, unknown> = {};
  for (const [id, cfg] of Object.entries(BUILTIN_ADAPTER_CONFIGS)) {
    if (id === "claude") continue; // source format — skip
    const outDir = path.join(ws, cfg.outputDir);
    if (!fs.existsSync(path.dirname(outDir))) continue;
    propagation[id] = adaptSkillsForModel(installed, cfg, ws);
  }

  return {
    ok: true, mode: "auto", rootsScanned: roots,
    discovered: skillFiles.length, admitted, skipped,
    failed: failures.length, failures, skills: installed, propagation,
  };
}

export function manualIngest(
  items: unknown[], mode: "file" | "folder", ws: string,
  getInstalledSkills: () => InstalledSkill[],
): Record<string, unknown> {
  const normalized = normalizeIngestItems(items);
  if (normalized.length === 0) throw new Error("No files were provided for manual ingest.");
  if (normalized.length > 300) throw new Error("Manual ingest payload is too large.");
  const batchRoot = path.join(
    ws, ".failsafe", "manual-skills",
    `manual-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  fs.mkdirSync(batchRoot, { recursive: true });
  const written = writeIngestFiles(normalized, batchRoot);
  if (written.length === 0) throw new Error("Manual ingest did not include any SKILL.md files.");
  const failures: Array<{ file: string; error: string }> = [];
  let admitted = 0;
  for (const sf of written) {
    const src = mode === "folder" ? "manual-folder" : "manual-file";
    const res = admitSkill(sf, src, ws);
    if (res.ok) admitted += 1;
    else failures.push({ file: sf, error: res.error });
  }
  return {
    ok: true, mode: "manual", importedTo: batchRoot,
    filesWritten: normalized.length, discovered: written.length,
    admitted, failed: failures.length, failures, skills: getInstalledSkills(),
  };
}

function normalizeIngestItems(items: unknown[]): Array<{ path: string; content: string }> {
  return items
    .map((i) => ({
      path: String((i as { path?: unknown }).path || "").trim(),
      content: String((i as { content?: unknown }).content || ""),
    }))
    .filter((i) => i.path.length > 0);
}

function writeIngestFiles(
  items: Array<{ path: string; content: string }>, batchRoot: string,
): string[] {
  const written: string[] = [];
  for (const item of items) {
    const safe = sanitizeRelativePath(item.path);
    if (!safe) continue;
    const target = path.join(batchRoot, safe);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, item.content, "utf8");
    if (path.basename(target).toLowerCase() === "skill.md") written.push(target);
  }
  return written;
}

export function sanitizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "")
    .split("/").map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "." && s !== "..")
    .join(path.sep);
}
