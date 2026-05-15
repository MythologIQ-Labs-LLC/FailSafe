// Phase 4: dry-run preview of `qorlogic install` via `--dry-run --json`.
// Returns the set of files the CLI would write (and optionally delete) without
// touching the workspace. Mirrors the DI seam used by skillEnumeration so
// tests can stub the subprocess without spawning Python.

import type { QorLogicSkillIngestor } from "./QorLogicSkillIngestor";

export interface DryRunFileEntry {
  path: string;
  sha256?: string;
}

export interface DryRunResult {
  wouldWrite: DryRunFileEntry[];
  wouldDelete?: DryRunFileEntry[];
  degraded?: boolean;
  reason?: string;
}

export interface InstallDryRunDeps {
  runQorlogicCommand: (
    ingestor: QorLogicSkillIngestor,
    args: ReadonlyArray<string>,
  ) => Promise<{ stdout: string; stderr: string; code: number | null }>;
  warn: (msg: string) => void;
}

const UNRECOGNIZED_RE = /unrecognized arguments:[^\n]*--dry-run/i;

function isValidEntry(raw: unknown): raw is { path: string; sha256?: unknown } {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return typeof r.path === "string" && r.path.length > 0;
}

function normalizeEntry(raw: { path: string; sha256?: unknown }): DryRunFileEntry {
  const entry: DryRunFileEntry = { path: raw.path };
  if (typeof raw.sha256 === "string") entry.sha256 = raw.sha256;
  return entry;
}

function pickEntries(list: unknown, warn: (msg: string) => void): DryRunFileEntry[] {
  if (!Array.isArray(list)) return [];
  const valid: DryRunFileEntry[] = [];
  let dropped = 0;
  for (const item of list) {
    if (isValidEntry(item)) valid.push(normalizeEntry(item));
    else dropped += 1;
  }
  if (dropped > 0) warn(`installDryRun: dropped ${dropped} malformed entries`);
  return valid;
}

function buildArgs(host: string, scope: "repo" | "global", skillFilter?: string[]): string[] {
  const args = ["install", "--host", host, "--scope", scope, "--dry-run", "--json"];
  if (Array.isArray(skillFilter)) {
    for (const name of skillFilter) {
      if (typeof name === "string" && name.length > 0) args.push("--include", name);
    }
  }
  return args;
}

function parseJsonPayload(stdout: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function defaultDeps(): InstallDryRunDeps {
  return {
    runQorlogicCommand: async () => ({ stdout: "", stderr: "runQorlogicCommand seam not wired", code: 127 }),
    warn: () => undefined,
  };
}

export async function previewInstall(
  ingestor: QorLogicSkillIngestor,
  host: string,
  scope: "repo" | "global" | undefined = "repo",
  skillFilter?: string[],
  deps: InstallDryRunDeps = defaultDeps(),
): Promise<DryRunResult> {
  const effectiveScope: "repo" | "global" = scope === "global" ? "global" : "repo";
  const args = buildArgs(host, effectiveScope, skillFilter);
  const result = await deps.runQorlogicCommand(ingestor, args);
  if (result.code !== 0) {
    if (UNRECOGNIZED_RE.test(result.stderr || "")) {
      return { wouldWrite: [], degraded: true, reason: "dry-run-flag-not-supported" };
    }
    return { wouldWrite: [], degraded: true, reason: `exit-code-${result.code}` };
  }
  const payload = parseJsonPayload(result.stdout || "");
  if (!payload) {
    return { wouldWrite: [], degraded: true, reason: "invalid-json" };
  }
  const wouldWrite = pickEntries(payload.would_write, deps.warn);
  const wouldDelete = pickEntries(payload.would_delete, deps.warn);
  const out: DryRunResult = { wouldWrite, degraded: false };
  if (wouldDelete.length > 0) out.wouldDelete = wouldDelete;
  return out;
}
