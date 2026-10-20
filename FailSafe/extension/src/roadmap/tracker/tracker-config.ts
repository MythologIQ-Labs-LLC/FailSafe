// FX891 — operator tracker taxonomy config (Workspace › Taxonomy editor).
//
// The OPERATOR-declared taxonomy for the tracker's programs ∥ verticals +
// agent→program/vertical mappings (distinct from the generated programs.yaml
// phases/timeline). Each vertical's sub-views follow the Console navigation
// (CONSOLE_VERTICALS); #548 reports drift and never rewrites the file, which is
// local (`docs/` is gitignored, so it is not in the repository). The editor writes
// `docs/roadmap/tracker-config.yaml` and emits a governed directive
// `.failsafe/governance/tracker-taxonomy.directive.md` the coding agent must consult
// next cycle (force-discover = the CLAUDE.md directive + GOVERNANCE_INDEX
// registration; a mechanical validator is a follow-up slice).
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

/** #548 (B305): parse a tracker-config YAML, THROWING when it is not a taxonomy — a
 *  YAML syntax error, a top level that is a scalar or a list, or a `programs`,
 *  `verticals` or `agents` value that is neither a list nor empty. An empty file is an
 *  empty taxonomy. The route answers a throw with an error, never an empty config,
 *  so a Save can never write an empty taxonomy over an unparseable operator file. */
export function parseTrackerConfigStrict(yamlText: string): TrackerConfig {
  const doc: unknown = yaml.load(yamlText);
  if (doc === undefined || doc === null) return { ...EMPTY };
  if (Object.prototype.toString.call(doc) !== "[object Object]") {
    throw new Error("the top level is not a mapping of programs, verticals and agents");
  }
  const o = doc as Record<string, unknown>;
  for (const k of ["programs", "verticals", "agents"]) {
    if (o[k] !== undefined && o[k] !== null && !Array.isArray(o[k])) {
      throw new Error(`\`${k}\` is neither a list nor empty`);
    }
  }
  return {
    programs: arr<TrackerProgram>(o.programs),
    verticals: arr<TrackerVertical>(o.verticals),
    agents: arr<TrackerAgent>(o.agents),
  };
}

/** Tolerant parse of a tracker-config YAML → a normalized TrackerConfig. Bad input → empty. */
export function parseTrackerConfig(yamlText: string): TrackerConfig {
  try { return parseTrackerConfigStrict(yamlText); } catch { return { ...EMPTY }; }
}

const CONFIG_BANNER =
  "# FailSafe Tracker Taxonomy (FX891) — OPERATOR-declared taxonomy; each vertical's\n" +
  "# sub-views follow the Console navigation (Workspace › Taxonomy reports drift).\n" +
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
**Source of truth**: \`docs/roadmap/tracker-config.yaml\` (local file; \`docs/\` is gitignored, so it is not in the repository)
**Enforcement**: advisory — the coding agent is bound via the CLAUDE.md directive
(loaded every session) + this registered record. Console navigation
(\`CONSOLE_VERTICALS\`) is authoritative for each vertical's sub-views: Workspace ›
Taxonomy reports drift against it, and CI checks the tracked
\`docs/roadmap/programs.yaml\`. This file is not checked in CI.

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
