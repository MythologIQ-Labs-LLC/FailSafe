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
