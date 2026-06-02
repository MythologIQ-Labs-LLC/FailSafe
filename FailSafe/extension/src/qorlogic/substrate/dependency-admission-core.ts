/**
 * dependency-admission-core — pure logic for the Node-archetype port of
 * qor.scripts.dependency_admission_lint (Phase 105 cooling-period lint).
 *
 * The upstream check is Python-archetype-specific (reads requirements/pyproject
 * and queries PyPI). FailSafe is a Node/TS extension, so this module ports the
 * SAME intent to the npm ecosystem: diff direct dependencies declared in
 * package.json against a base ref, and flag any newly-added or version-changed
 * dependency whose target version was published within a cooling-period window
 * (default 14 days) — unless an explicit override exists in docs/META_LEDGER.md.
 *
 * This file holds ONLY pure functions (no fs / git / network), so the cooling
 * logic is deterministically testable without live registry calls (the wall-
 * clock/network race avoided per B-BIC-24). I/O lives in
 * DependencyAdmissionLintModule.ts.
 *
 * Override convention (faithful to upstream `_dep_admit_common`):
 *   **Dependency admission override**: <pkg>@<version>; upload_age_days=<n>; justification=<text>
 *
 * Boundary (v1): covers direct deps in package.json whose spec yields a
 * concrete target version (exact / caret / tilde / >= forms). Complex ranges,
 * tags (`latest`), and non-registry specs (`file:`, `workspace:`, git URLs) are
 * skipped. Lockfile-resolved transitive coverage is deferred (mirrors the
 * upstream's layered lockfile+pins approach).
 */

export interface DepEntry {
  name: string;
  version: string;
}

export interface Bump {
  name: string;
  oldVersion: string | null;
  newVersion: string;
}

export type BumpStatus = 'clean' | 'override' | 'violation' | 'unknown';

export interface BumpReport {
  name: string;
  oldVersion: string | null;
  newVersion: string;
  ageDays: number | null; // null when publish time could not be resolved
  status: BumpStatus;
}

export interface EvaluateResult {
  reports: BumpReport[];
  violations: Bump[];
  registryErrors: string[];
}

/**
 * Extract the concrete target version from a package.json version spec, or null
 * when the spec does not name a single registry version we can age-check.
 * Handles `1.2.3`, `^1.2.3`, `~1.2.3`, `>=1.2.3`, optional `v` prefix, and
 * prerelease suffixes. Rejects multi-comparator ranges, `||`, tags, and
 * non-registry protocols.
 */
export function concreteVersion(spec: string): string | null {
  const s = spec.trim();
  if (!s) return null;
  // Reject non-registry protocols (file:, link:, workspace:, git+..., npm:alias, URLs).
  if (/^[a-z]+:/i.test(s) || s.includes('/')) return null;
  // Reject multi-comparator ranges and OR-unions.
  if (/\s/.test(s) || s.includes('||')) return null;
  const m = s.match(/^[~^]?(?:>=)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/);
  return m ? m[1] : null;
}

/**
 * Parse direct dependencies (dependencies + devDependencies +
 * optionalDependencies) from package.json text into concrete (name, version)
 * entries, skipping specs without a resolvable concrete version. Throws on
 * malformed JSON (caller decides how to surface).
 */
export function parseDirectDeps(packageJsonText: string): DepEntry[] {
  const pkg = JSON.parse(packageJsonText) as Record<string, unknown>;
  const out: DepEntry[] = [];
  const seen = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const block = pkg[field];
    if (!block || typeof block !== 'object') continue;
    for (const [name, spec] of Object.entries(block as Record<string, unknown>)) {
      if (typeof spec !== 'string' || seen.has(name)) continue;
      const version = concreteVersion(spec);
      if (!version) continue;
      seen.add(name);
      out.push({ name, version });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Diff current deps against a base set. Emits a Bump for every newly-added
 * dependency and every dependency whose concrete version changed. Mirrors
 * upstream `diff_lockfile_against_base`.
 */
export function diffDeps(current: DepEntry[], base: DepEntry[]): Bump[] {
  const baseMap = new Map(base.map((e) => [e.name, e.version]));
  const bumps: Bump[] = [];
  for (const entry of current) {
    const prior = baseMap.get(entry.name);
    if (prior === undefined) {
      bumps.push({ name: entry.name, oldVersion: null, newVersion: entry.version });
    } else if (prior !== entry.version) {
      bumps.push({ name: entry.name, oldVersion: prior, newVersion: entry.version });
    }
  }
  return bumps.sort((a, b) => a.name.localeCompare(b.name));
}

const OVERRIDE_LINE_RE =
  /\*\*Dependency admission override\*\*:\s*([a-zA-Z0-9@][a-zA-Z0-9._/-]*)@([^\s;]+);\s*upload_age_days=\d+;\s*justification=[^\n]+/g;

/**
 * Parse `dep-admit-override` entries from META_LEDGER text into a set of
 * `name@version` keys. Faithful to the upstream override line format.
 */
export function parseOverrideEntries(ledgerText: string): Set<string> {
  const keys = new Set<string>();
  let m: RegExpExecArray | null;
  OVERRIDE_LINE_RE.lastIndex = 0;
  while ((m = OVERRIDE_LINE_RE.exec(ledgerText)) !== null) {
    keys.add(`${m[1]}@${m[2]}`);
  }
  return keys;
}

/**
 * Apply the cooling-period rule to each bump. `publishTimeOf` returns the
 * registry publish time (Date) for a (name, version), or null when it could
 * not be resolved (network/registry error). `now` and `thresholdDays` are
 * injected so the rule is deterministic under test.
 */
export function evaluateBumps(
  bumps: Bump[],
  overrideKeys: Set<string>,
  publishTimeOf: (name: string, version: string) => Date | null,
  now: Date,
  thresholdDays: number,
): EvaluateResult {
  const reports: BumpReport[] = [];
  const violations: Bump[] = [];
  const registryErrors: string[] = [];

  for (const bump of bumps) {
    const published = publishTimeOf(bump.name, bump.newVersion);
    if (published === null) {
      registryErrors.push(`${bump.name}@${bump.newVersion}`);
      reports.push({ ...bump, ageDays: null, status: 'unknown' });
      continue;
    }
    const ageDays = Math.floor((now.getTime() - published.getTime()) / 86_400_000);
    let status: BumpStatus;
    if (ageDays >= thresholdDays) {
      status = 'clean';
    } else if (overrideKeys.has(`${bump.name}@${bump.newVersion}`)) {
      status = 'override';
    } else {
      status = 'violation';
      violations.push(bump);
    }
    reports.push({ ...bump, ageDays, status });
  }

  return { reports, violations, registryErrors };
}

export const DEFAULT_THRESHOLD_DAYS = 14;
