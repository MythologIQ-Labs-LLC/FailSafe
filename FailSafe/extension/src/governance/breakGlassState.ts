// Persisted mirror of BreakGlassProtocol's in-flight override, so an
// extension-host restart (crash, "Reload Window", or an ordinary reactivation)
// while an override is still active does not orphan it. Without this mirror,
// the override's *effect* (a weakened governance.mode) survives durably in
// workspace settings while the *transaction envelope* that says "this is
// temporary, revert at expiresAt" existed only as an in-memory field and a
// setTimeout handle on the previous BreakGlassProtocol instance — silently
// leaving governance downgraded forever with no revert timer.
//
// File shape mirrors BreakGlassRecord verbatim; only status "active" is ever
// considered live evidence on read.

import * as fs from "fs";
import * as path from "path";
import type { BreakGlassRecord } from "./BreakGlassProtocol";

export function breakGlassStatePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".failsafe", "governance", "break-glass-state.json");
}

/** Read the persisted override record. Missing/unreadable/malformed/non-active -> null (fail-safe). */
export function readBreakGlassState(workspaceRoot: string): BreakGlassRecord | null {
  try {
    const raw = fs.readFileSync(breakGlassStatePath(workspaceRoot), "utf8");
    const parsed = JSON.parse(raw) as Partial<BreakGlassRecord>;
    if (parsed && parsed.status === "active" && typeof parsed.expiresAt === "string") {
      return parsed as BreakGlassRecord;
    }
  } catch {
    /* missing/unreadable/malformed -> no persisted override */
  }
  return null;
}

/** Persist (atomic temp+rename) or clear (record === null) the override mirror. */
export function writeBreakGlassState(workspaceRoot: string, record: BreakGlassRecord | null): void {
  const target = breakGlassStatePath(workspaceRoot);
  if (record === null) {
    try {
      fs.unlinkSync(target);
    } catch {
      /* already absent */
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, target);
}
