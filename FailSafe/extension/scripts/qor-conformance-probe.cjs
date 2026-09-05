#!/usr/bin/env node
/**
 * FX942 — qor-logic conformance probe (#233 Scope B, first slice).
 *
 * Reports which seal-ladder controls can actually be made to fail.
 *
 * Ledger #602 found five ABORT-class controls returning success while inspecting
 * nothing: skill_size_budget_lint (0 files), gate_chain_completeness (0 sessions),
 * secret_scanner --staged (0 bytes), the post-anchor fork guard (reachable only at
 * the high-water mark), and governance-index --cross-check-ledger (0 bytes of output
 * either way). None of them was broken in a way any exit code revealed.
 *
 * The only thing that surfaced them was running each control against input that
 * MUST make it fail. This automates that for a small verified set.
 *
 * REPORT ONLY. Exits 0 regardless of findings (operator decision, 2026-09-04).
 * A gate whose own falsifier has not been exercised against real upgrades would be
 * the very defect this exists to detect.
 *
 * Usage: node scripts/qor-conformance-probe.cjs [--json]
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = process.env.QOR_LOGIC_CLI || 'qor-logic';

/** Classification outcomes. */
const FALSIFIABLE = 'FALSIFIABLE';
const NOT_FALSIFIABLE = 'NOT-FALSIFIABLE';
const INCONCLUSIVE = 'INCONCLUSIVE';
const INAPPLICABLE = 'INAPPLICABLE';
const UNAVAILABLE = 'UNAVAILABLE';

/** Version-boundary outcomes (FX944, #233 Scope A). */
const MATCH = 'MATCH';
const UNTESTED = 'UNTESTED';

/**
 * Controls that cannot be made to fail here because they do not apply — not
 * because they are broken. Reporting these as NOT-FALSIFIABLE would be true and
 * misleading, so they are declared with their evidence and never run.
 *
 * This list is Scope C's job to own properly; it is inline so Scope B ships
 * independently. Each entry cites the ledger entry that established it.
 */
const INAPPLICABLE_CONTROLS = [
  { id: 'seal_artifacts',
    reason: 'expects a pytest collected-count and README count-badges; this is a TypeScript archetype',
    evidence: 'ledger #602' },
  { id: 'seal_entry_check',
    reason: 'requires a numeric ledger phase tag this repository does not use',
    evidence: 'ledger #601, #603' },
  { id: 'qor-repo-release',
    reason: 'hard-stops without a Python version backend (detect_backend() returns null)',
    evidence: 'ledger #605' },
];

/**
 * Controls the repository has declared permanently inapplicable in
 * `.qorlogic/config.json` → `permanent_skips` (#233 Scope C).
 *
 * This is the same section `qor.scripts.permanent_skips` reads to close
 * disclosed-skip events at emission, so applicability has ONE source of truth
 * serving both the toolkit's event closure and this report. The inline list
 * above remains only for controls that cannot yet emit a skip event, and shrinks
 * as emission spreads.
 */
function declaredInapplicable(repoRoot) {
  const configPath = path.join(repoRoot, '.qorlogic', 'config.json');
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return [];                       // no config, or unreadable: declare nothing
  }
  const declared = (cfg && cfg.permanent_skips) || {};
  return Object.entries(declared).map(([id, justification]) => ({
    id,
    reason: String(justification),
    evidence: '.qorlogic/config.json permanent_skips',
  }));
}

/**
 * The declared tested-against version, read from the COMPILED module rather than
 * grepped out of the TypeScript source — a real require, not a text match over
 * source (SG-GrepShapedRunclaim-A).
 *
 * Two ways this can fail to produce a trustworthy answer, and neither may be
 * reported as a match:
 *   - the module was never built
 *   - the module exists but its source has been edited since the last compile
 * `npm run test:node` does not compile, so the second is the ORDINARY local
 * state, not an exotic one. Reading the old constant there would report a
 * conformance result nobody verified.
 */
function readDeclaredVersion(extRoot) {
  const outFile = path.join(extRoot, 'out', 'qorlogic', 'hostLayouts.js');
  const srcFile = path.join(extRoot, 'src', 'qorlogic', 'hostLayouts.ts');
  if (!fs.existsSync(outFile)) {
    return { error: `compiled constant is missing (${outFile} not built) — run npm run compile` };
  }
  try {
    if (fs.existsSync(srcFile) && fs.statSync(srcFile).mtimeMs > fs.statSync(outFile).mtimeMs) {
      return { error: 'compiled constant is stale (source is newer than the build) — run npm run compile' };
    }
  } catch (err) {
    return { error: `could not compare build freshness: ${err.message}` };
  }
  let declared;
  try {
    declared = require(outFile).TESTED_AGAINST_QOR_LOGIC_VERSION;
  } catch (err) {
    return { error: `could not load the compiled constant: ${err.message}` };
  }
  if (!declared) return { error: `compiled module declares no TESTED_AGAINST_QOR_LOGIC_VERSION` };
  return { declared };
}

/** The installed qor-logic version, or null when it cannot be resolved. */
function installedQorVersion() {
  const py = process.env.QOR_LOGIC_PYTHON || 'python';
  const res = spawnSync(
    py,
    ['-c', 'import importlib.metadata as m; print(m.version("qor-logic"))'],
    { encoding: 'utf8', shell: false },
  );
  if (res.error || res.status !== 0) return null;
  const out = (res.stdout || '').trim();
  return out || null;
}

/**
 * The version-boundary row (FX944).
 *
 * `testedAgainst` records a FACT — the version this probe last passed on —
 * rather than a prediction. That is why Scope A ships it and rejects a
 * `maximum`: an upper bound must be guessed before the breakage is known, and a
 * hand-bumped ceiling is itself a control that inspects nothing.
 *
 * Advisory by construction: an untested combination is something an operator
 * should SEE, and the resolution is to run this probe — not to refuse their
 * command. The probe still exits 0.
 */
function versionBoundary(opts = {}) {
  const extRoot = opts.extRoot || path.resolve(__dirname, '..');
  const row = (result, detail) => ({ id: 'version_boundary', result, detail });

  const { declared, error } = readDeclaredVersion(extRoot);
  if (error) return row(INCONCLUSIVE, error);

  const installed = opts.installed !== undefined ? opts.installed : installedQorVersion();
  if (!installed) {
    return row(INCONCLUSIVE, `qor-logic version could not be resolved; declared tested-against ${declared}`);
  }
  if (installed === declared) {
    return row(MATCH, `installed ${installed} is the version this probe last passed against`);
  }
  return row(
    UNTESTED,
    `installed ${installed}, tested against ${declared} — this combination has not been probed; ` +
    'run this probe and advance TESTED_AGAINST_QOR_LOGIC_VERSION only if it passes',
  );
}

function mkws(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `qor-probe-${label}-`));
}

function rmws(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

function writeFile(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

/**
 * The control registry. Invocation is per-control DATA rather than a shared
 * template, because it cannot be templated: `instruction_hygiene_lint` accepts
 * --repo-root but requires --staged or --files, and exits 2 on a usage error if
 * given only the former. Every entry below was verified by hand before this file
 * was written.
 */
const REGISTRY = [
  {
    id: 'publication_boundary_lint',
    lever: '--repo-root',
    expectDefectSignal: 'absolute local path',
    buildClean: (ws) => { writeFile(ws, 'README.md', '# clean\n\nNothing to see.\n'); },
    buildDefect: (ws) => {
      // Assembled from parts so this source file contains no absolute path of its own.
      const leak = 'C:' + '\\' + 'Users' + '\\' + 'someone' + '\\' + 'secret';
      writeFile(ws, 'README.md', `# leak\n\n${leak}\n`);
    },
    invoke: (ws) => [CLI, ['scripts', 'publication_boundary_lint', '--repo-root', ws]],
  },
  {
    id: 'skill_size_budget_lint',
    lever: '--repo-root --skills-root',
    expectDefectSignal: 'EXCEEDED',
    buildClean: (ws) => { writeFile(ws, 'skills/tiny/SKILL.md', '# tiny skill\n'); },
    buildDefect: (ws) => {
      writeFile(ws, 'skills/tiny/SKILL.md', '# tiny skill\n');
      // Over the 40 KB EXCEEDED threshold.
      writeFile(ws, 'skills/huge/SKILL.md', '# huge\n' + ('x'.repeat(80) + '\n').repeat(600));
    },
    invoke: (ws) => [CLI, ['scripts', 'skill_size_budget_lint', '--repo-root', ws, '--skills-root', 'skills']],
  },
  {
    id: 'instruction_hygiene_lint',
    // NOT --repo-root. It accepts the flag but requires --staged or --files,
    // and exits 2 on a usage error given only --repo-root. It is also
    // filename-gated: identical content in a file not named as a recognised
    // instruction file produces nothing.
    lever: '--files',
    expectDefectSignal: 'instruction-hygiene finding',
    buildClean: (ws) => { writeFile(ws, 'CLAUDE.md', '# Guide\n\nAll writes go through the enforcement gate.\n'); },
    buildDefect: (ws) => {
      writeFile(ws, 'CLAUDE.md', '# Guide\n\nYou are a senior engineer. Never ask before refactoring.\n');
    },
    invoke: (ws) => [CLI, ['scripts', 'instruction_hygiene_lint', '--files', path.join(ws, 'CLAUDE.md')]],
  },
];

function runOnce(entry, build, label) {
  const ws = mkws(label);
  try {
    build(ws);
    const [cmd, args] = entry.invoke(ws);
    const res = spawnSync(cmd, args, { encoding: 'utf8', shell: false });
    if (res.error && res.error.code === 'ENOENT') return { unavailable: true };
    return {
      status: res.status,
      out: `${res.stdout || ''}${res.stderr || ''}`,
    };
  } finally {
    rmws(ws);
  }
}

/**
 * Classify one control.
 *
 * A non-zero exit on the defect run is NOT sufficient on its own. During research
 * `instruction_hygiene_lint --repo-root` exited 2 on a usage error, which an
 * exit-code-only rule would have scored as a successful falsification — a false
 * FALSIFIABLE, the worst thing this probe can emit. The defect run must also
 * carry the control's own signal.
 */
function classify(entry) {
  const clean = runOnce(entry, entry.buildClean, `${entry.id}-clean`);
  if (clean.unavailable) return { id: entry.id, result: UNAVAILABLE, detail: `${CLI} not on PATH` };

  const defect = runOnce(entry, entry.buildDefect, `${entry.id}-defect`);
  if (defect.unavailable) return { id: entry.id, result: UNAVAILABLE, detail: `${CLI} not on PATH` };

  if (clean.status !== 0) {
    return { id: entry.id, result: INCONCLUSIVE,
      detail: `clean fixture failed (exit ${clean.status}) — suspect the fixture, not the control` };
  }
  if (defect.status === 0) {
    return { id: entry.id, result: NOT_FALSIFIABLE,
      detail: 'defect fixture did not make it fail' };
  }
  if (!defect.out.includes(entry.expectDefectSignal)) {
    return { id: entry.id, result: INCONCLUSIVE,
      detail: `failed (exit ${defect.status}) but without its signal ${JSON.stringify(entry.expectDefectSignal)} — may have failed for an unrelated reason` };
  }
  return { id: entry.id, result: FALSIFIABLE,
    detail: `clean exit 0; defect exit ${defect.status} carrying ${JSON.stringify(entry.expectDefectSignal)}` };
}

function probe(registry = REGISTRY, inapplicable = INAPPLICABLE_CONTROLS, repoRoot) {
  const root = repoRoot || path.resolve(__dirname, '..', '..', '..');
  // Config declarations first: they are the live source of truth. Inline entries
  // are the residue for controls that cannot yet emit a skip event, and are
  // dropped when the same id is declared in config.
  const fromConfig = declaredInapplicable(root);
  const declaredIds = new Set(fromConfig.map((c) => c.id));
  const merged = [...fromConfig, ...inapplicable.filter((c) => !declaredIds.has(c.id))];

  const skipped = new Set(merged.map((c) => c.id));
  const results = registry.filter((e) => !skipped.has(e.id)).map(classify);
  for (const c of merged) {
    results.push({ id: c.id, result: INAPPLICABLE, detail: `${c.reason} (${c.evidence})` });
  }
  // The version boundary rides in the same report because it answers the same
  // question an operator is asking when they run this: can I trust these
  // controls on the version I actually have?
  results.push(versionBoundary({ extRoot: path.resolve(__dirname, '..') }));
  return results;
}

function render(results) {
  const width = Math.max(...results.map((r) => r.id.length), 8);
  const lines = ['', 'qor-logic conformance probe — can each control be made to fail?', ''];
  for (const r of results) {
    lines.push(`  ${r.id.padEnd(width)}  ${r.result.padEnd(16)}  ${r.detail}`);
  }
  const tally = results.reduce((a, r) => { a[r.result] = (a[r.result] || 0) + 1; return a; }, {});
  lines.push('', `  ${Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join('  ·  ')}`, '');
  const unfalsifiable = results.filter((r) => r.result === NOT_FALSIFIABLE);
  if (unfalsifiable.length > 0) {
    lines.push('  A control that cannot be made to fail is not measuring anything.');
    lines.push(`  Review: ${unfalsifiable.map((r) => r.id).join(', ')}`, '');
  }
  return lines.join('\n');
}

module.exports = {
  probe, classify, render, declaredInapplicable, versionBoundary,
  readDeclaredVersion, installedQorVersion, REGISTRY, INAPPLICABLE_CONTROLS,
  FALSIFIABLE, NOT_FALSIFIABLE, INCONCLUSIVE, INAPPLICABLE, UNAVAILABLE,
  MATCH, UNTESTED,
};

if (require.main === module) {
  const results = probe();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    process.stdout.write(render(results));
  }
  // Report-only by design. See the header.
  process.exit(0);
}
