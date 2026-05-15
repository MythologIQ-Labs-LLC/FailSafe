// Phase 3: per-host skill enumeration via `qorlogic list-skills --json`.
// Returns a typed list of skills available for a given host/scope, or a
// `degraded` flag when the upstream CLI does not support enumeration.
//
// The CLI invocation seam is injected via `SkillEnumerationDeps` so unit
// tests can stub the subprocess without spawning Python.

import type { QorLogicSkillIngestor } from "./QorLogicSkillIngestor";

export type SkillKind = "skill" | "agent" | "command";

export interface SkillEntry {
  name: string;
  kind: SkillKind;
  path: string;
}

export interface SkillEnumerationResult {
  skills: SkillEntry[];
  degraded: boolean;
  reason?: string;
}

export interface SkillEnumerationDeps {
  runQorlogicCommand: (
    ingestor: QorLogicSkillIngestor,
    args: ReadonlyArray<string>,
  ) => Promise<{ stdout: string; stderr: string; code: number | null }>;
  warn: (msg: string) => void;
}

const UNRECOGNIZED_RE = /unrecognized arguments:[^\n]*list-skills/i;

function normalizeKind(raw: unknown): SkillKind {
  if (raw === "agent" || raw === "command") return raw;
  return "skill";
}

function isValidEntry(raw: unknown): raw is { name: string; kind?: unknown; path: string } {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  const hasName = typeof r.name === "string" && r.name.length > 0;
  const hasPath = typeof r.path === "string" && r.path.length > 0;
  return hasName && hasPath;
}

function parseSkills(stdout: string, warn: (msg: string) => void): SkillEntry[] {
  let payload: unknown;
  try { payload = JSON.parse(stdout); } catch { return []; }
  const list = payload && typeof payload === "object"
    ? (payload as { skills?: unknown[] }).skills
    : undefined;
  if (!Array.isArray(list)) return [];
  const valid: SkillEntry[] = [];
  let dropped = 0;
  for (const item of list) {
    if (isValidEntry(item)) {
      valid.push({ name: item.name, kind: normalizeKind(item.kind), path: item.path });
    } else {
      dropped += 1;
    }
  }
  if (dropped > 0) warn(`skillEnumeration: dropped ${dropped} malformed skill entries`);
  return valid;
}

export async function enumerateSkillsForHost(
  ingestor: QorLogicSkillIngestor,
  host: string,
  scope: "repo" | "global" | undefined,
  deps: SkillEnumerationDeps,
): Promise<SkillEnumerationResult> {
  const effectiveScope: "repo" | "global" = scope === "global" ? "global" : "repo";
  const args = ["list-skills", "--host", host, "--scope", effectiveScope, "--json"];
  const result = await deps.runQorlogicCommand(ingestor, args);
  if (result.code !== 0) {
    if (UNRECOGNIZED_RE.test(result.stderr || "")) {
      return { skills: [], degraded: true, reason: "cli-subcommand-not-supported" };
    }
    return { skills: [], degraded: true, reason: `exit-code-${result.code}` };
  }
  const skills = parseSkills(result.stdout || "", deps.warn);
  return { skills, degraded: false };
}
