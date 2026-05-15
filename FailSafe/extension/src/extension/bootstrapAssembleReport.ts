// Pure assembleReport extracted for node:test loadability.
// bootstrapWorkspace.ts imports `vscode` at module top; node:test cannot
// load that. assembleReport is a string-construction over BootstrapStep[]
// with no runtime dependency on vscode, so it lives here and is re-exported
// from bootstrapWorkspace.ts to keep external imports stable.

export interface BootstrapStep {
  name: string;
  status: "ok" | "skipped" | "performed" | "failed" | "deferred";
  detail?: string;
}

export interface BootstrapReport {
  ok: boolean;
  steps: BootstrapStep[];
  summary: string;
}

export function assembleReport(steps: BootstrapStep[]): BootstrapReport {
  const failed = steps.filter((s) => s.status === "failed");
  const performed = steps.filter((s) => s.status === "performed");
  const deferred = steps.filter((s) => s.status === "deferred");
  let summary: string;
  if (failed.length > 0) {
    summary = `Bootstrap completed with ${failed.length} failure(s): ${failed.map((s) => s.name).join(", ")}`;
  } else if (performed.length === 0 && deferred.length === 0) {
    summary = "Bootstrap: workspace ready (all infrastructure already present)";
  } else if (performed.length > 0) {
    summary = `Bootstrap performed: ${performed.map((s) => s.name).join(", ")}`;
  } else if (deferred.every((s) => s.detail === "user deferred")) {
    summary = "Bootstrap paused — run Initialize again when ready to install qor-logic";
  } else {
    summary = `Bootstrap: ${deferred.length} step(s) deferred`;
  }
  return { ok: failed.length === 0, steps, summary };
}
