// FailSafe Educational Component — contextual-surfacing trigger engine (Phase 2).
//
// RD: pure leaf. Type-only imports; no DOM, no VS Code API, no fs, no network.
// All five evaluator functions and `applyCaps` are pure of input → output —
// safe to bundle as browser ESM and unit-test in isolation.
//
// Compliance contract (binding, per plan v4 + ideation Assumption #3):
// triggers observe PROJECT state (active plan, file activity, checkpoints),
// never USER state. No level inference, no scoring, no quizzes. The
// per-anchor frequency cap + per-session global cap + dismissed gate
// prevent nudge fatigue without learning-outcome evaluation.

/** The 5 nudge anchors (1:1 with the v1 SWE-craft essay anchors). */
export type NudgeAnchor =
  | "learn.essay.slow-down-to-speed-up"
  | "learn.essay.scope-before-prompt"
  | "learn.essay.acceptance-criteria"
  | "learn.essay.choose-agent-option"
  | "learn.essay.verify-output";

/** Closed list of NudgeAnchor values in declared priority order. */
export const NUDGE_ANCHORS: readonly NudgeAnchor[] = [
  "learn.essay.scope-before-prompt",
  "learn.essay.acceptance-criteria",
  "learn.essay.choose-agent-option",
  "learn.essay.verify-output",
  "learn.essay.slow-down-to-speed-up",
];

export interface TriggerInput {
  /** From `hub.activePlan` (the v1 plan-state surface). */
  activePlan?: {
    phases?: Array<{
      id: string;
      description?: string;
      estimatedScope?: number;
      artifacts?: unknown[];
    }>;
    title?: string;
  } | null;
  /** From `hub.recentCheckpoints[0].timestamp` (most-recent first). */
  lastCheckpointAt?: string | null;
  /** From `hub.unattributedFileActivity[]` (the ring buffer). */
  unattributedFileActivity?: Array<{
    eventId: string;
    timestamp: string;
    type: string;
    artifactPath?: string;
  }>;
  /** Session-start ISO; v2 caller persists as sessionStorage `fs-learn-session-start` (client-side only). */
  sessionStartedAt?: string | null;
  /** Per-anchor surface count; v2 caller persists as sessionStorage `fs-learn-nudge-count:<anchor>` (drives caps). */
  recentNudgeCount?: Partial<Record<NudgeAnchor, number>>;
  /** Per-anchor "Mark as read" flag; v2 caller persists as sessionStorage `fs-learn-nudge-dismissed:<anchor>` (suppresses badge only — essay stays in directory). */
  dismissed?: Partial<Record<NudgeAnchor, boolean>>;
  /** Wall-clock override for tests (defaults to Date.now()). */
  now?: number;
}

export interface TriggerResult {
  anchor: NudgeAnchor;
  fire: boolean;
  reason: string;
}

export const PER_ANCHOR_CAP = 1;
export const PER_SESSION_GLOBAL_CAP = 2;
export const SESSION_THRESHOLD_MINUTES = 25;

// File-path proxies for "high-blast-radius change" — dependency, lockfile,
// build-config, extension-manifest, CI-config surfaces across the common
// ecosystems FailSafe users work in. Array form (not one mega-regex) keeps
// each pattern readable and makes table-driven tests straightforward.
const HIGH_BLAST_RADIUS_PATTERNS: readonly RegExp[] = [
  // JS/TS ecosystem
  /(?:^|[/\\])package(?:-lock)?\.json$/,
  /(?:^|[/\\])yarn\.lock$/,
  /(?:^|[/\\])pnpm-lock\.yaml$/,
  /(?:^|[/\\])bun\.lockb?$/,
  /(?:^|[/\\])tsconfig(?:\.[^/\\]*)?\.json$/,
  /(?:^|[/\\])(?:vite|webpack|rollup|esbuild)\.config\.[jt]s$/,
  // Python ecosystem
  /(?:^|[/\\])requirements[^/\\]*\.txt$/,
  /(?:^|[/\\])Pipfile(?:\.lock)?$/,
  /(?:^|[/\\])pyproject\.toml$/,
  /(?:^|[/\\])poetry\.lock$/,
  // Rust
  /(?:^|[/\\])Cargo\.(?:toml|lock)$/,
  // Go
  /(?:^|[/\\])go\.(?:mod|sum)$/,
  // VS Code extension manifest + packaged extension
  /(?:^|[/\\])extension\.vsixmanifest$/i,
  /(?:^|[/\\])[^/\\]+\.vsix$/i,
  // GitHub Actions / CI
  /(?:^|[/\\])\.github[/\\]workflows[/\\]/,
];

function isHighBlastRadius(path: string): boolean {
  return HIGH_BLAST_RADIUS_PATTERNS.some((re) => re.test(path));
}

function activityPaths(input: TriggerInput): string[] {
  const acts = input.unattributedFileActivity || [];
  return acts.map((a) => a.artifactPath || "").filter((p) => p.length > 0);
}

function planArtifactPaths(input: TriggerInput): string[] {
  const phases = (input.activePlan && input.activePlan.phases) || [];
  const out: string[] = [];
  for (const phase of phases) {
    const arts = (phase.artifacts || []) as Array<{ path?: string } | string>;
    for (const a of arts) {
      if (typeof a === "string") out.push(a);
      else if (a && typeof a === "object" && typeof a.path === "string") out.push(a.path);
    }
  }
  return out;
}

function evalScopeBeforePrompt(input: TriggerInput): TriggerResult {
  // Require file activity to fire — the trigger is "you're editing files
  // with no articulated scope," not "you opened the Learn tab on a
  // passive empty state." Without the activity gate, opening Learn with
  // no plan would always mark scope-before-prompt as relevant-now.
  const acts = activityPaths(input);
  if (acts.length === 0) {
    return { anchor: "learn.essay.scope-before-prompt", fire: false, reason: "no file activity (passive state)" };
  }
  if (!input.activePlan) {
    return { anchor: "learn.essay.scope-before-prompt", fire: true, reason: "file activity with no active plan" };
  }
  const covered = planArtifactPaths(input);
  const uncovered = acts.some((p) => !covered.some((c) => p === c || p.endsWith(c)));
  return {
    anchor: "learn.essay.scope-before-prompt",
    fire: uncovered,
    reason: uncovered ? "file activity outside any plan-phase artifact" : "all activity covered",
  };
}

function evalAcceptanceCriteria(input: TriggerInput): TriggerResult {
  const phases = (input.activePlan && input.activePlan.phases) || [];
  const hit = phases.find(
    (p) => typeof p.description === "string" && p.description.trim().length > 0 &&
      (!p.artifacts || p.artifacts.length === 0),
  );
  return {
    anchor: "learn.essay.acceptance-criteria",
    fire: !!hit,
    reason: hit ? `phase '${hit.id}' has description but no artifacts` : "all phases have artifacts or empty descriptions",
  };
}

function evalChooseAgentOption(input: TriggerInput): TriggerResult {
  const paths = activityPaths(input);
  const hit = paths.find((p) => isHighBlastRadius(p));
  return {
    anchor: "learn.essay.choose-agent-option",
    fire: !!hit,
    reason: hit ? `high-blast-radius change: ${hit}` : "no config/dep/CI changes",
  };
}

function evalVerifyOutput(input: TriggerInput): TriggerResult {
  const acts = input.unattributedFileActivity || [];
  if (acts.length < 5) {
    return { anchor: "learn.essay.verify-output", fire: false, reason: "file activity below verify threshold" };
  }
  const earliest = acts.reduce(
    (min, a) => (a.timestamp < min ? a.timestamp : min),
    acts[0].timestamp,
  );
  const checkpointed =
    typeof input.lastCheckpointAt === "string" && input.lastCheckpointAt > earliest;
  return {
    anchor: "learn.essay.verify-output",
    fire: !checkpointed,
    reason: checkpointed
      ? "checkpoint after earliest activity — verification appears underway"
      : "≥5 unattributed changes with no checkpoint after the earliest",
  };
}

function evalSlowDownToSpeedUp(input: TriggerInput): TriggerResult {
  const now = typeof input.now === "number" ? input.now : Date.now();
  const startMs =
    input.sessionStartedAt ? Date.parse(input.sessionStartedAt) : NaN;
  if (!Number.isFinite(startMs)) {
    return { anchor: "learn.essay.slow-down-to-speed-up", fire: false, reason: "no session start recorded" };
  }
  if (now - startMs <= SESSION_THRESHOLD_MINUTES * 60_000) {
    return { anchor: "learn.essay.slow-down-to-speed-up", fire: false, reason: "session below threshold" };
  }
  const lastCheckpoint = input.lastCheckpointAt ? Date.parse(input.lastCheckpointAt) : NaN;
  const noPostStartCheckpoint = !Number.isFinite(lastCheckpoint) || lastCheckpoint < startMs;
  return {
    anchor: "learn.essay.slow-down-to-speed-up",
    fire: noPostStartCheckpoint,
    reason: noPostStartCheckpoint
      ? `session > ${SESSION_THRESHOLD_MINUTES}min with no checkpoint`
      : "checkpoint recorded this session",
  };
}

/**
 * Evaluate all 5 triggers against the project state in `input`. Returns
 * results in fixed declared priority order — NUDGE_ANCHORS order.
 */
export function evaluateTriggers(input: TriggerInput): TriggerResult[] {
  const byAnchor: Record<NudgeAnchor, TriggerResult> = {
    "learn.essay.scope-before-prompt": evalScopeBeforePrompt(input),
    "learn.essay.acceptance-criteria": evalAcceptanceCriteria(input),
    "learn.essay.choose-agent-option": evalChooseAgentOption(input),
    "learn.essay.verify-output": evalVerifyOutput(input),
    "learn.essay.slow-down-to-speed-up": evalSlowDownToSpeedUp(input),
  };
  return NUDGE_ANCHORS.map((a) => byAnchor[a]);
}

/**
 * Filter trigger results through the dismissed gate + per-anchor cap + per-
 * session global cap. Returns only the firing results that should surface.
 *
 * The global cap is enforced **cumulatively** — already-shown nudges
 * (counted in `input.recentNudgeCount`) consume the budget. The caller
 * (webview) must persist counts client-side and increment them whenever a
 * surfaced nudge is rendered, so that the cap survives across render cycles.
 * Without that persistence the global cap collapses to "max-per-render" and
 * the same anchors re-fire on every hub update.
 */
export function applyCaps(results: TriggerResult[], input: TriggerInput): TriggerResult[] {
  const dismissed = input.dismissed || {};
  const counts = input.recentNudgeCount || {};
  const totalShown = Object.values(counts).reduce<number>(
    (acc, n) => acc + (typeof n === "number" ? n : 0),
    0,
  );
  const remaining = Math.max(0, PER_SESSION_GLOBAL_CAP - totalShown);
  if (remaining <= 0) return [];

  const out: TriggerResult[] = [];
  for (const r of results) {
    if (!r.fire) continue;
    if (dismissed[r.anchor]) continue;
    if ((counts[r.anchor] || 0) >= PER_ANCHOR_CAP) continue;
    out.push(r);
    if (out.length >= remaining) break;
  }
  return out;
}
