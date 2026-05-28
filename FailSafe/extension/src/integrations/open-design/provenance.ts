/**
 * Open Design file-path provenance extraction.
 *
 * Open Design's daemon emits artifacts under `.od/artifacts/<projectId>/`
 * relative to the project's cwd. FailSafe attributes a file-edit event to
 * Open Design provenance when the edited path lands inside that subtree.
 *
 * Detection is FILE-PATH-BASED ONLY in v1 — no env / PID / daemon-probe.
 * See `docs/INTEGRATIONS.md` (Open Design section) for v1.1 roadmap.
 */

import type { AgentProvenance } from "../../shared/types/agentRun";

// Matches both POSIX and Windows separators. The capture group is projectId.
// Examples:
//   /workspace/.od/artifacts/proj-abc/foo.html       -> projectId="proj-abc"
//   C:\repos\.od\artifacts\proj-xyz\deck\slide.html  -> projectId="proj-xyz"
//   .od/artifacts/proj-root/file.html                -> projectId="proj-root"
const OD_ARTIFACTS_RE = /(?:^|[\\/])\.od[\\/]artifacts[\\/]([^\\/]+)(?:[\\/]|$)/;

export function extractOpenDesignProvenance(
  filePath: string,
): Extract<AgentProvenance, { source: "open-design" }> | null {
  if (typeof filePath !== "string" || filePath.length === 0) return null;
  const m = OD_ARTIFACTS_RE.exec(filePath);
  if (!m) return null;
  const projectId = m[1];
  if (!projectId || projectId.length === 0) return null;
  return { source: "open-design", projectId };
}
