/**
 * qor.scripts substrate types (Phase 1 of v1 plan-qor-substrate-modules-v1).
 *
 * Substrate Module: a wrapper around a qor.scripts.* governance check
 * (subprocess or local TS adapter) that produces SubstrateFindings under
 * a WARN-only posture. Findings surface in the transparency stream + a
 * VS Code Output channel; they do NOT block any operator workflow in v1.
 */

export interface SubstrateFinding {
  module: string;
  severity: 'info' | 'warn' | 'high';
  rule: string;
  message: string;
  location?: { file?: string; line?: number };
  raw?: unknown;
}

export interface ModuleSummary {
  count: number;
  bySeverity: { info: number; warn: number; high: number };
  note?: string;
}

export interface ModuleResult {
  module: string;
  ok: boolean;
  findings: SubstrateFinding[];
  summary: ModuleSummary;
  durationMs: number;
  error?: { kind: 'module-missing' | 'timeout' | 'spawn-error' | 'parse-error' | 'other'; message: string };
}

export interface RunReport {
  moduleResults: ModuleResult[];
  totalFindings: number;
  runDurationMs: number;
  startedAt: string;
}
