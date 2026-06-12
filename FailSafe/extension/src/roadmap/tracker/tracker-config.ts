// FX891 — operator tracker taxonomy config (Workspace › Taxonomy editor).
//
// The OPERATOR-authored source of truth for the tracker's programs ∥ verticals +
// agent→program/vertical mappings (distinct from the generated programs.yaml
// phases/timeline). The editor writes `docs/roadmap/tracker-config.yaml` and emits
// a governed directive `.failsafe/governance/tracker-taxonomy.directive.md` the
// coding agent must consult next cycle (force-discover = the CLAUDE.md directive +
// GOVERNANCE_INDEX registration; a mechanical validator is a follow-up slice).
//
// PURE: yaml/markdown string transforms + reuse of the FX887 generator/validator.
// No fs/network (the route does I/O).

import * as yaml from "js-yaml";
import type {
  TrackerManifest, TrackerProgram, TrackerVertical, TrackerAgent, TrackerLintFinding,
} from "./tracker-model";
import { validateManifest } from "./tracker-model";
import { agentsFromPrograms } from "./manifest-generator";

export interface TrackerConfig {
  programs: TrackerProgram[];
  verticals: TrackerVertical[];
  agents: TrackerAgent[];
}

const EMPTY: TrackerConfig = { programs: [], verticals: [], agents: [] };

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Tolerant parse of a tracker-config YAML → a normalized TrackerConfig. Bad input → empty. */
export function parseTrackerConfig(yamlText: string): TrackerConfig {
  let doc: unknown;
  try { doc = yaml.load(yamlText); } catch { return { ...EMPTY }; }
  if (!doc || typeof doc !== "object") return { ...EMPTY };
  const o = doc as Record<string, unknown>;
  return {
    programs: arr<TrackerProgram>(o.programs),
    verticals: arr<TrackerVertical>(o.verticals),
    agents: arr<TrackerAgent>(o.agents),
  };
}

const CONFIG_BANNER =
  "# FailSafe Tracker Taxonomy (FX891) — OPERATOR source of truth.\n" +
  "# Programs ∥ Verticals + agent→program/vertical mappings, authored via\n" +
  "# Workspace › Taxonomy. The coding agent MUST consult this each cycle that\n" +
  "# touches tracker/feature scope (see CLAUDE.md + the emitted directive at\n" +
  "# .failsafe/governance/tracker-taxonomy.directive.md). Phases/timeline live in\n" +
  "# docs/roadmap/programs.yaml — this file never overwrites them.\n";

export function serializeTrackerConfig(cfg: TrackerConfig): string {
  return CONFIG_BANNER + yaml.dump({
    programs: cfg.programs ?? [],
    verticals: cfg.verticals ?? [],
    agents: cfg.agents ?? [],
  }, { lineWidth: 120 });
}

/** Seed a config from an existing manifest (programs.yaml): its programs/verticals,
 *  plus FX887 `agentsFromPrograms`-proposed agents when the manifest declares none. */
export function deriveConfigFromManifest(manifest: TrackerManifest): TrackerConfig {
  const programs = manifest.programs ?? [];
  const verticals = manifest.verticals ?? [];
  const agents = (manifest.agents && manifest.agents.length)
    ? manifest.agents
    : agentsFromPrograms(programs, verticals, manifest.phases ?? []);
  return { programs, verticals, agents };
}

/** Referential lint of a taxonomy config. Reuses validateManifest, whose FX887
 *  vertical∥program + agent-ref checks fire on a phase-less config (phase checks
 *  are inert with no phases). */
export function lintConfig(cfg: TrackerConfig): TrackerLintFinding[] {
  return validateManifest(cfg as TrackerManifest);
}

/** The governed directive markdown (PUBLISH_BLOCK SHAPE — advisory, no validator).
 *  States the declared taxonomy + the MUST-CONSULT clause for the next cycle. */
export function buildTaxonomyDirective(cfg: TrackerConfig, opts: { at: string }): string {
  const list = (items: Array<{ key: string; name?: string }>, kind: string): string =>
    items.length
      ? items.map((i) => `- \`${i.key}\`${i.name ? ` — ${i.name}` : ""}`).join("\n")
      : `_(no ${kind} declared)_`;
  const agentRows = cfg.agents.length
    ? cfg.agents.map((a) => `- \`${a.key}\` → program \`${a.program ?? "—"}\` · vertical \`${a.vertical ?? "—"}\``).join("\n")
    : "_(no agent mappings declared)_";
  return `# Tracker Taxonomy Directive (FX891)

**Active**: yes
**Set**: ${opts.at}
**Set by**: operator (Workspace › Taxonomy editor)
**Source of truth**: \`docs/roadmap/tracker-config.yaml\` (tracked)
**Enforcement**: advisory — the coding agent is bound via the CLAUDE.md directive
(authoritative, loaded every session) + this registered record. No mechanical CI
gate yet (the active drift-CHECK is a follow-up slice).

## MUST-CONSULT

Any cycle that plans tracker or feature-scope work MUST consult
\`docs/roadmap/tracker-config.yaml\` and align programs/verticals/agents to the
operator-declared taxonomy below. A divergence between this declared taxonomy and
the actual \`docs/roadmap/programs.yaml\` / \`docs/FEATURE_INDEX.md\` surfaces is a
drift bug to surface, not silently reconcile.

## Declared programs
${list(cfg.programs, "programs")}

## Declared verticals
${list(cfg.verticals, "verticals")}

## Declared agent mappings
${agentRows}
`;
}
