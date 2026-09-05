// Canonical host → install layout map. Mirrors qor-logic v0.31.1's
// `qor.hosts.HostTarget` exactly so install + discovery + status detection
// share one source of truth.
//
// MIN_QOR_LOGIC_VERSION must stay aligned with the qor-logic version this
// install_map mirrors. The installer pins this floor on pip install and
// surfaces violations via `verifyInstalledVersion()`.
//
// claude / codex / kilo-code: { skills/: base/skills, agents/: base/agents }
// gemini:                     { commands/: base/commands }
//
// All hosts: qorlogic itself writes `<base>/.qorlogic-installed.json` after
// install. That file IS the canonical "is qor-logic installed for this host?"
// signal — do not infer from directory existence or per-skill provenance.

export type QorLogicHost = "claude" | "codex" | "kilo-code" | "gemini";

export interface HostInstallLayout {
  /** Base dot-directory under workspace root, e.g. ".claude" */
  base: string;
  /** Path of the canonical install record file, relative to workspace root. */
  recordPath: string;
  /**
   * Per-prefix install map matching qor-logic's `HostTarget.install_map`.
   * Key is the source path prefix in the variant manifest; value is the
   * relative-to-workspace destination directory.
   */
  installMap: Record<string, string>;
  /** Convenience: directories scanned by Skill Discovery for this host. */
  discoveryRoots: string[];
}

const RECORD_FILE = ".qorlogic-installed.json";

function joinBase(base: string, sub: string): string {
  return `${base}/${sub}`;
}

function skillsAgents(base: string): HostInstallLayout {
  const skills = joinBase(base, "skills");
  const agents = joinBase(base, "agents");
  return {
    base,
    recordPath: joinBase(base, RECORD_FILE),
    installMap: { "skills/": skills, "agents/": agents },
    discoveryRoots: [skills, agents],
  };
}

export const HOST_INSTALL_LAYOUTS: Record<QorLogicHost, HostInstallLayout> = {
  claude: skillsAgents(".claude"),
  codex: skillsAgents(".codex"),
  "kilo-code": skillsAgents(".kilo"),
  gemini: {
    base: ".gemini",
    recordPath: joinBase(".gemini", RECORD_FILE),
    installMap: { "commands/": joinBase(".gemini", "commands") },
    discoveryRoots: [joinBase(".gemini", "commands")],
  },
};

export const QOR_LOGIC_HOSTS: QorLogicHost[] = ["claude", "codex", "kilo-code", "gemini"];

/**
 * Minimum qor-logic version this extension is compatible with. Must match the
 * version cited in the header comment above (i.e. the version whose
 * `HostTarget.install_map` `HOST_INSTALL_LAYOUTS` mirrors). Pinned on install
 * and asserted via `QorLogicPackageInstaller.verifyInstalledVersion()`.
 */
export const MIN_QOR_LOGIC_VERSION = "0.31.1";

/**
 * The qor-logic version the FX942 conformance probe last passed against
 * (#233 Scope A).
 *
 * This records a RESULT, not an intention. Advance it only after a passing
 * probe run on the new version — a value bumped by hand each release would be
 * a control that reports success while inspecting nothing, which is the exact
 * defect this whole issue exists to close (ledger #602).
 *
 * Deliberately NOT a `maximum` / upper bound. A ceiling has to be guessed
 * before the breakage is known: set it to the current version and every
 * upstream release trips it; set it optimistically and it never fires. Every
 * qor-logic breakage this repository has actually suffered — plan.schema.json
 * rejecting `terms_introduced`, the ladder dropping `--skills-root`, three
 * controls turning out structurally inapplicable — happened at versions far
 * ABOVE `MIN_QOR_LOGIC_VERSION`, with `meetsFloor` true throughout. Version
 * comparison cannot see a contract change; running the probe can.
 */
export const TESTED_AGAINST_QOR_LOGIC_VERSION = "0.169.0";

/**
 * Hosts upstream qor-logic registers that this extension does NOT mirror
 * (#233 Scope A).
 *
 * Declared, dated and justified so `hostMirrorDrift.test.cjs` fails on the NEXT
 * upstream host addition instead of accumulating silently — as these two did
 * for 138 releases, because the only test that looked like a guard asserted the
 * local list equalled a literal copy of itself.
 */
export const UNMIRRORED_HOSTS: Record<string, string> = {
  cursor:
    "upstream 0.169.0 installs to .cursor/skills + .cursor/agents; adding it is a " +
    "user-facing capability change (#233 Scope A) and is the operator's to scope, " +
    "not this cycle's.",
  cline:
    "upstream 0.169.0 installs to .clinerules/workflows — a workflows-only layout " +
    "unlike any host mirrored here; same operator-scoping note as cursor.",
};

// --- Dynamic host registry accessor (Phase 2 expansion) -------------------
// `getQorLogicHosts(workspaceRoot)` returns the merged host list (built-in +
// operator overlay from `.failsafe/governance/host-registry.json`). Existing
// consumers using `QOR_LOGIC_HOSTS` keep working; new callers that need to
// honor operator-defined hosts (e.g., `windsurf`) should use this accessor.

// Note: import is placed at the bottom intentionally — `hostRegistry.ts`
// imports from this module, and we want to avoid a circular eager-binding
// hazard at module-init time. Both bindings are values used only at call
// time, so TS handles the cycle without runtime issue.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { loadHostRegistry } from "./hostRegistry";

export function getQorLogicHosts(workspaceRoot: string): string[] {
  return loadHostRegistry(workspaceRoot).hosts;
}
