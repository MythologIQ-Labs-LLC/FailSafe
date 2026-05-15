// Bicameral MCP — typed payload shapes for v1.
// Inferred from bicameral-mcp v0.14.x server.py tool docstrings + README
// "MCP Tools Reference". Tool schemas are Beta-classified upstream; pin in
// .vscode-test.mjs / package.json bicameral floor for stability.

/** Install/runtime state observed by install-detector. */
export type BicameralInstallState =
  | 'unknown'
  | 'not-installed'
  | 'installed-not-configured'
  | 'configured-not-running'
  | 'running';

export interface BicameralInstallProbe {
  state: BicameralInstallState;
  version?: string;
  configPath?: string;
}

/** A single decision row inside a feature brief. Output of bicameral.history. */
export interface BicameralDecision {
  id: string;
  title: string;
  source: string;
  status: 'in-sync' | 'drifted' | 'open-question' | 'unratified';
  bindings: BicameralCodeBinding[];
}

export interface BicameralCodeBinding {
  filePath: string;
  symbol?: string;
  startLine?: number;
  endLine?: number;
}

/** A feature-area grouping of decisions. */
export interface BicameralFeatureBrief {
  feature: string;
  decisions: BicameralDecision[];
}

/** Output of bicameral.drift, scoped to a file. */
export interface BicameralDriftStatus {
  decisionId: string;
  filePath: string;
  status: 'in-sync' | 'drifted' | 'unknown';
  evidence?: string;
}

/** Output of bicameral.preflight. */
export interface BicameralPreflightResult {
  priorDecisions: BicameralDecision[];
  drifted: BicameralDriftStatus[];
  openQuestions: BicameralDecision[];
}

/** Verdict shape for bicameral.ratify. */
export type BicameralRatifyVerdict = 'ratify' | 'reject';

/** Install mode picked by the operator at install time. Restricted to a
 *  literal union so it cannot inject argv content into spawn(). */
export type InstallMode = 'solo' | 'team';

export interface InstallStep {
  phase: 'pip-install' | 'setup' | 'verify';
  status: 'running' | 'success' | 'error';
  command?: string;       // human-display only; not used for spawn
  stdoutTail?: string;    // last N stdout chars; for live render
  error?: string;
}

export interface InstallProgressEvent {
  steps: InstallStep[];
  mode: InstallMode;
  done: boolean;
  ok?: boolean;
  error?: string;
}
