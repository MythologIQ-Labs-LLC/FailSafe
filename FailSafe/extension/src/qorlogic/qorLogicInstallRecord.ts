import * as fs from "fs";
import * as path from "path";
import {
  HOST_INSTALL_LAYOUTS,
  getQorLogicHosts,
  type HostInstallLayout,
  type QorLogicHost,
} from "./hostLayouts";
import { loadHostRegistry } from "./hostRegistry";

// `qorlogic install --host <H>` writes `<base>/.qorlogic-installed.json`
// containing `{ "files": [{ "path": "...", "sha256": "..." }] }`.
// That file is the source of truth. Read it. Don't infer from directory
// listings, don't synthesize provenance, don't pollute.

export interface QorLogicInstalledFile {
  path: string;
  sha256: string;
}

export interface QorLogicInstallRecord {
  files: QorLogicInstalledFile[];
}

export interface HostInstallStatus {
  // Widened from QorLogicHost to string to accommodate operator-defined hosts
  // registered via .failsafe/governance/host-registry.json. Canonical 4-host
  // callers keep their narrower type via inline assertions.
  host: string;
  installed: boolean;
  recordPath: string;
  fileCount: number;
  destinations: string[];
  recordMtime: string | null;
}

/** B197 surfacing: version-floor check resolved once per hub rebuild. */
export interface QorLogicVersionStatus {
  installed: string | null;
  minimum: string;
  meetsFloor: boolean;
}

export interface QorLogicInstallStatus {
  anyInstalled: boolean;
  hosts: HostInstallStatus[];
  totalFiles: number;
  destinations: string[];
  /** B197 surfacing: present when verifier was wired into the hub build. */
  installedVersion?: string | null;
  minimumVersion?: string;
  meetsFloor?: boolean;
}

function resolveLayout(workspaceRoot: string, host: string): HostInstallLayout | null {
  const builtIn = HOST_INSTALL_LAYOUTS[host as QorLogicHost];
  if (builtIn) return builtIn;
  const registry = loadHostRegistry(workspaceRoot);
  return registry.layouts[host] || null;
}

export function readInstallRecord(workspaceRoot: string, host: string): QorLogicInstallRecord | null {
  const layout = resolveLayout(workspaceRoot, host);
  if (!layout) return null;
  const fullPath = path.join(workspaceRoot, layout.recordPath);
  if (!fs.existsSync(fullPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    if (!parsed || !Array.isArray(parsed.files)) return null;
    return parsed as QorLogicInstallRecord;
  } catch {
    return null;
  }
}

function emptyStatus(host: string, recordPath: string): HostInstallStatus {
  return { host, installed: false, recordPath, fileCount: 0, destinations: [], recordMtime: null };
}

export function getHostInstallStatus(workspaceRoot: string, host: string): HostInstallStatus {
  const layout = resolveLayout(workspaceRoot, host);
  if (!layout) return emptyStatus(host, "");
  const recordPath = path.join(workspaceRoot, layout.recordPath);
  const record = readInstallRecord(workspaceRoot, host);
  if (!record) return emptyStatus(host, recordPath);
  return {
    host,
    installed: true,
    recordPath,
    fileCount: record.files.length,
    destinations: deriveDestinations(record),
    recordMtime: safeMtime(recordPath),
  };
}

export function getQorLogicInstallStatus(
  workspaceRoot: string,
  versionStatus?: QorLogicVersionStatus,
): QorLogicInstallStatus {
  const hosts = getQorLogicHosts(workspaceRoot).map((h) => getHostInstallStatus(workspaceRoot, h));
  const installed = hosts.filter((h) => h.installed);
  const status: QorLogicInstallStatus = {
    anyInstalled: installed.length > 0,
    hosts,
    totalFiles: installed.reduce((sum, h) => sum + h.fileCount, 0),
    destinations: dedupe(installed.flatMap((h) => h.destinations)),
  };
  if (versionStatus) {
    status.installedVersion = versionStatus.installed;
    status.minimumVersion = versionStatus.minimum;
    status.meetsFloor = versionStatus.meetsFloor;
  }
  return status;
}

function deriveDestinations(record: QorLogicInstallRecord): string[] {
  // Reduce per-file paths to their parent directories so the report shows
  // "<...>/skills/" and "<...>/agents/" rather than every file.
  const dirs = new Set<string>();
  for (const f of record.files) {
    if (typeof f.path !== "string" || f.path.length === 0) continue;
    dirs.add(parentDir(f.path));
  }
  return [...dirs].sort();
}

function parentDir(p: string): string {
  // Use forward-slash normalization since the record paths are emitted by
  // Python on the user's OS — could be `\` on Windows. Normalize to `/`.
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx >= 0 ? `${norm.slice(0, idx)}/` : norm;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)].sort();
}

function safeMtime(filePath: string): string | null {
  try { return fs.statSync(filePath).mtime.toISOString(); }
  catch { return null; }
}
