import * as fs from "fs";
import * as path from "path";
import {
  HOST_INSTALL_LAYOUTS,
  QOR_LOGIC_HOSTS,
  type QorLogicHost,
} from "./hostLayouts";

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
  host: QorLogicHost;
  installed: boolean;
  recordPath: string;
  fileCount: number;
  destinations: string[];
  recordMtime: string | null;
}

export interface QorLogicInstallStatus {
  anyInstalled: boolean;
  hosts: HostInstallStatus[];
  totalFiles: number;
  destinations: string[];
}

export function readInstallRecord(workspaceRoot: string, host: QorLogicHost): QorLogicInstallRecord | null {
  const layout = HOST_INSTALL_LAYOUTS[host];
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

export function getHostInstallStatus(workspaceRoot: string, host: QorLogicHost): HostInstallStatus {
  const layout = HOST_INSTALL_LAYOUTS[host];
  const recordPath = path.join(workspaceRoot, layout.recordPath);
  const record = readInstallRecord(workspaceRoot, host);
  if (!record) {
    return { host, installed: false, recordPath, fileCount: 0, destinations: [], recordMtime: null };
  }
  return {
    host,
    installed: true,
    recordPath,
    fileCount: record.files.length,
    destinations: deriveDestinations(record),
    recordMtime: safeMtime(recordPath),
  };
}

export function getQorLogicInstallStatus(workspaceRoot: string): QorLogicInstallStatus {
  const hosts = QOR_LOGIC_HOSTS.map((h) => getHostInstallStatus(workspaceRoot, h));
  const installed = hosts.filter((h) => h.installed);
  return {
    anyInstalled: installed.length > 0,
    hosts,
    totalFiles: installed.reduce((sum, h) => sum + h.fileCount, 0),
    destinations: dedupe(installed.flatMap((h) => h.destinations)),
  };
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
