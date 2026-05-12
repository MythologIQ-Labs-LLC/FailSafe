// Canonical host → install layout map. Mirrors qor-logic v0.31.1's
// `qor.hosts.HostTarget` exactly so install + discovery + status detection
// share one source of truth.
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
