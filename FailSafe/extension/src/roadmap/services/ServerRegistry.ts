/**
 * ServerRegistry — Multi-workspace server tracking
 *
 * Maintains a registry of active FailSafe servers at ~/.failsafe/servers.json
 * enabling workspace switching in Command Center and preventing port conflicts.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface ServerEntry {
  port: number;
  workspaceName: string;
  workspacePath: string;
  pid: number;
  startedAt: string; // ISO 8601
  status: "active" | "disconnected";
}

interface RegistryFile {
  servers: ServerEntry[];
}

function getRegistryDir(): string {
  return path.join(os.homedir(), ".failsafe");
}

function getRegistryPath(): string {
  return path.join(getRegistryDir(), "servers.json");
}

function ensureRegistryDir(): void {
  const dir = getRegistryDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readRegistryFile(): RegistryFile {
  ensureRegistryDir();
  const registryPath = getRegistryPath();
  if (!fs.existsSync(registryPath)) {
    return { servers: [] };
  }
  try {
    const content = fs.readFileSync(registryPath, "utf-8");
    return JSON.parse(content) as RegistryFile;
  } catch {
    return { servers: [] };
  }
}

function writeRegistryFile(data: RegistryFile): void {
  ensureRegistryDir();
  const registryPath = getRegistryPath();
  const tmpPath = `${registryPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpPath, registryPath); // Atomic replace
  } catch (err) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // Best-effort cleanup; preserve the original write/rename failure.
    }
    throw err;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 checks existence without killing
    return true;
  } catch {
    return false;
  }
}

function cleanStaleEntries(entries: ServerEntry[]): ServerEntry[] {
  return entries.filter((e) => isProcessAlive(e.pid));
}

export function registerServer(
  entry: Omit<ServerEntry, "status">,
): void {
  const registry = readRegistryFile();
  // Clean stale entries (crashed processes)
  registry.servers = cleanStaleEntries(registry.servers);
  // Remove any existing entry for this port or workspace
  registry.servers = registry.servers.filter(
    (s) => s.port !== entry.port && s.workspacePath !== entry.workspacePath,
  );
  // Add new entry
  registry.servers.push({ ...entry, status: "active" });
  writeRegistryFile(registry);
}

export function unregisterServer(port: number): void {
  const registry = readRegistryFile();
  registry.servers = registry.servers.filter((s) => s.port !== port);
  writeRegistryFile(registry);
}

export function markDisconnected(port: number): void {
  const registry = readRegistryFile();
  const entry = registry.servers.find((s) => s.port === port);
  if (entry) {
    entry.status = "disconnected";
    writeRegistryFile(registry);
  }
}

export function readRegistry(): ServerEntry[] {
  const registry = readRegistryFile();
  // Clean stale entries on read
  const cleaned = cleanStaleEntries(registry.servers);
  if (cleaned.length !== registry.servers.length) {
    registry.servers = cleaned;
    writeRegistryFile(registry);
  }
  return cleaned;
}
