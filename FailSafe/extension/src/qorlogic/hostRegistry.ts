// Operator-configurable host registry. Loads `.failsafe/governance/host-registry.json`
// from a workspace and merges it onto the built-in HOST_INSTALL_LAYOUTS. Operator
// entries override built-ins on key collision; built-ins not mentioned are preserved.
//
// On malformed overlay JSON, the loader logs a warning and returns the built-in
// registry untouched (with source: 'overlay-invalid') — fail-soft. Pure module:
// no VS Code dependency; safe for unit tests.

import * as fs from "fs";
import * as path from "path";
import { HOST_INSTALL_LAYOUTS, type HostInstallLayout } from "./hostLayouts";

export type RegistrySource = "built-in" | "overlay-merged" | "overlay-invalid";

export interface HostRegistry {
  layouts: Record<string, HostInstallLayout>;
  hosts: string[];
  source: RegistrySource;
}

interface OverlayShape {
  hosts?: Record<string, Partial<HostInstallLayout>>;
}

const OVERLAY_REL = ".failsafe/governance/host-registry.json";

interface CacheEntry {
  mtimeMs: number;
  registry: HostRegistry;
}

const cache = new Map<string, CacheEntry>();

function builtInRegistry(source: RegistrySource): HostRegistry {
  const layouts: Record<string, HostInstallLayout> = { ...HOST_INSTALL_LAYOUTS };
  return { layouts, hosts: Object.keys(layouts), source };
}

function readOverlayFile(overlayPath: string): string | null {
  if (!fs.existsSync(overlayPath)) return null;
  try { return fs.readFileSync(overlayPath, "utf8"); }
  catch { return null; }
}

function parseOverlay(raw: string): OverlayShape | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as OverlayShape;
  } catch {
    return null;
  }
}

function isCompleteLayout(value: Partial<HostInstallLayout>): value is HostInstallLayout {
  return (
    typeof value.base === "string" &&
    typeof value.recordPath === "string" &&
    typeof value.installMap === "object" && value.installMap !== null &&
    Array.isArray(value.discoveryRoots)
  );
}

function mergeOverlay(overlay: OverlayShape): Record<string, HostInstallLayout> {
  const merged: Record<string, HostInstallLayout> = { ...HOST_INSTALL_LAYOUTS };
  const overlayHosts = overlay.hosts || {};
  for (const [name, entry] of Object.entries(overlayHosts)) {
    if (!entry || typeof entry !== "object") continue;
    const base = merged[name];
    if (base && !isCompleteLayout(entry)) {
      merged[name] = { ...base, ...entry } as HostInstallLayout;
      continue;
    }
    if (isCompleteLayout(entry)) merged[name] = entry;
  }
  return merged;
}

function getOverlayMtime(overlayPath: string): number {
  try { return fs.statSync(overlayPath).mtimeMs; }
  catch { return 0; }
}

function cacheKey(workspaceRoot: string, mtimeMs: number): string {
  return `${workspaceRoot}::${mtimeMs}`;
}

export function loadHostRegistry(workspaceRoot: string): HostRegistry {
  const overlayPath = path.join(workspaceRoot, OVERLAY_REL);
  const mtimeMs = getOverlayMtime(overlayPath);
  const key = cacheKey(workspaceRoot, mtimeMs);
  const cached = cache.get(key);
  if (cached) return cached.registry;

  const raw = readOverlayFile(overlayPath);
  if (raw === null) {
    const reg = builtInRegistry("built-in");
    cache.set(key, { mtimeMs, registry: reg });
    return reg;
  }

  const overlay = parseOverlay(raw);
  if (!overlay) {
    // eslint-disable-next-line no-console
    console.warn(`[hostRegistry] Overlay at ${overlayPath} is malformed; falling back to built-in.`);
    const reg = builtInRegistry("overlay-invalid");
    cache.set(key, { mtimeMs, registry: reg });
    return reg;
  }

  const layouts = mergeOverlay(overlay);
  const reg: HostRegistry = { layouts, hosts: Object.keys(layouts), source: "overlay-merged" };
  cache.set(key, { mtimeMs, registry: reg });
  return reg;
}

export function clearHostRegistryCache(): void {
  cache.clear();
}
