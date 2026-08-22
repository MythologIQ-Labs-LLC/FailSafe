#!/usr/bin/env node
/**
 * check-plan-citation-parity — a truth-checking lint that reports ZERO items
 * checked has told you nothing, not that everything passed.
 *
 * Origin (FailSafe ledger #592/#594/#595, Process Shadow Genome
 * `repeated_veto_pattern` 2026-08-22): a plan carried nine Locked Decisions,
 * each with a hand-written grep-evidence line. `plan_grep_lint` reported
 *
 *     plan-grep-lint: 0 citation(s) truth-checked [...]
 *
 * and exited 0, because its `_LD_HEADING_RE` only scans regions under a
 * heading matching "locked decision"/"citation inventory" and the LDs were
 * inline text. The evidence was never parsed. Read casually the ladder looked
 * clean; the exit code said PASS. Every coordinate happened to be correct,
 * which is exactly why it is the pattern and not a near-miss — hand
 * verification is the assurance that had already failed.
 *
 * The rule this enforces: compare the COUNT the lint reports against the
 * number of items that should have been checked. An exit code cannot
 * distinguish "I checked and it holds" from "I did not recognize anything to
 * check"; a count can.
 *
 * Usage:
 *   node scripts/check-plan-citation-parity.cjs <plan.md> [--lint-output <file>]
 *   node scripts/check-plan-citation-parity.cjs --all
 *
 * With --lint-output, reads pre-captured `plan_grep_lint` output instead of
 * invoking it (so this runs where qor-logic-plus is absent).
 * With --all, walks every git-tracked plan under .failsafe/governance/plans/.
 *
 * Exit codes — these three are deliberately distinct, because collapsing them
 * is the defect this gate exists to catch:
 *   0  parity holds, or the plan declares no Locked Decisions (nothing to check)
 *   1  REAL FINDING: the lint verified fewer items than the plan declares,
 *      or its output no longer carries a count
 *   2  INFRASTRUCTURE: the lint could not be run, or the tracked-plan set could
 *      not be enumerated. UNVERIFIED, explicitly not a pass. A caller may choose
 *      to tolerate 2; it must never read it as 0.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

/** `LD<n> — ...` at line start. The plan convention for a Locked Decision. */
const LD_RE = /^LD\d+\s*[—-]/gm;
/** `plan-grep-lint: N citation(s) truth-checked` — N is the assertion. */
const COUNT_RE = /plan-grep-lint:\s*(\d+)\s+citation\(s\)\s+truth-checked/;

function countLockedDecisions(planText) {
  const m = planText.match(LD_RE);
  return m ? m.length : 0;
}

function parseTruthCheckedCount(lintOutput) {
  const m = COUNT_RE.exec(lintOutput);
  return m ? Number(m[1]) : null;
}

/**
 * Returns { output } when the lint ran (even non-zero: its count is on stdout),
 * or { unavailable: <reason> } when the tool itself could not run.
 *
 * That distinction is load-bearing, and is the #410 lesson applied here: a
 * completed process that exited non-zero carries a numeric `status`; a
 * spawn-level failure (tool absent, EAGAIN) does not. Collapsing the two would
 * make "the lint found nothing" indistinguishable from "the lint never ran" -
 * the exact defect class this gate exists to catch, so committing it inside
 * the gate would be self-refuting.
 */
function runLint(planPath) {
  // plan_grep_lint writes its count line to STDERR, not stdout — verified by
  // splitting the streams. Reading only stdout returns no count and the gate
  // reports "shape changed", which is a false finding, not a false pass; still
  // wrong. Both streams are captured and concatenated.
  const both = (r) => `${r && r.stdout ? r.stdout : ''}\n${r && r.stderr ? r.stderr : ''}`;
  try {
    const proc = spawnSync(
      'qor-logic-plus',
      ['scripts', 'plan_grep_lint', '--plan', planPath, '--repo-root', repoRoot()],
      { cwd: repoRoot(), encoding: 'utf8' },
    );
    if (proc.error) {
      const reason = proc.error.code ? String(proc.error.code) : 'spawn failure';
      return { unavailable: `qor-logic-plus not runnable (${reason})` };
    }
    // A completed process carries a numeric status whether or not the lint
    // passed; its count line is present either way. Only a spawn-level failure
    // (no status) means the check never ran.
    if (typeof proc.status !== 'number') {
      return { unavailable: 'qor-logic-plus produced no exit status (spawn-level failure)' };
    }
    return { output: both(proc) };
  } catch (err) {
    const reason = err && err.code ? String(err.code) : 'spawn failure';
    return { unavailable: `qor-logic-plus not runnable (${reason})` };
  }
}

/** Mirrors plan_evidence.py's `_LD_HEADING_RE`. */
const LD_HEADING_RE = /^#+\s.*(locked decision|citation inventory)/i;
const ANY_HEADING_RE = /^#+\s/;

/**
 * The zero-dependency half of this gate, and the one that would have caught V1
 * outright.
 *
 * `plan_grep_lint` only scans regions under a heading matching
 * "locked decision"/"citation inventory". An `LD<n> —` line outside such a
 * region is invisible to it: the lint reports 0 checked and exits 0. That
 * structural precondition is verifiable here with no external tool, which
 * matters because the lint is not installed in CI — without this, the gate
 * would be permanently UNVERIFIED where it is needed most.
 *
 * Returns { orphans: [lineNumbers] } for LD lines outside any LD region.
 */
function checkStructure(planText) {
  const lines = planText.split(/\r?\n/);
  let inRegion = false;
  const orphans = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ANY_HEADING_RE.test(line)) inRegion = LD_HEADING_RE.test(line);
    if (/^LD\d+\s*[—-]/.test(line) && !inRegion) orphans.push(i + 1);
  }
  return { orphans };
}

function check(planPath, lintOutput) {
  const planText = fs.readFileSync(planPath, 'utf8');
  const declared = countLockedDecisions(planText);

  if (declared === 0) {
    return { pass: true, declared, checked: null, note: 'plan declares no Locked Decisions — nothing to verify' };
  }

  // Structural precondition first, and it needs no external tool. An LD outside
  // an LD-heading region is invisible to plan_grep_lint, so it would report 0
  // checked and exit 0 — the origin failure exactly.
  const { orphans } = checkStructure(planText);
  if (orphans.length > 0) {
    return {
      pass: false, declared, checked: null, structural: true,
      note: `${orphans.length} Locked Decision(s) at line(s) ${orphans.join(', ')} sit outside any `
        + '"Locked Decisions"/"Citation Inventory" heading — plan_grep_lint cannot see them, so it '
        + 'would report 0 checked and exit 0. This is the origin failure, detectable without the lint.',
    };
  }

  let output = lintOutput;
  if (output === null || output === undefined) {
    const r = runLint(planPath);
    if (r.unavailable) {
      return {
        pass: false, infra: true, declared, checked: null,
        note: `${r.unavailable} - parity UNVERIFIED, not passed. Disclosed rather than silently `
          + 'skipped: an unrunnable check is not a clean one.',
      };
    }
    output = r.output;
  }

  const checked = parseTruthCheckedCount(output);
  if (checked === null) {
    return {
      pass: false, declared, checked: null,
      note: 'plan_grep_lint output carried no "N citation(s) truth-checked" count — '
        + 'the lint may have changed shape; parity cannot be established',
    };
  }

  return {
    pass: checked === declared,
    declared,
    checked,
    note: checked === declared
      ? 'every declared Locked Decision was truth-checked'
      : `the lint verified ${checked} of ${declared} declared Locked Decisions — `
        + 'the unverified remainder is an assertion, not evidence',
  };
}

/** Repo root, independent of cwd — the gate must behave the same from any
 *  working directory. Getting this wrong is how the first run reported a
 *  missing count that was really a wrong --repo-root. */
function repoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

/** Tracked, durable plans. Untracked scratch plans are not gate surface. */
function trackedPlans() {
  const root = repoRoot();
  let out;
  try {
    out = execFileSync('git', ['ls-files', '.failsafe/governance/plans/'], { cwd: root, encoding: 'utf8' });
  } catch (err) {
    // A git failure yields an UNKNOWN plan set, not an empty one. Returning []
    // here would print "nothing to check" and exit 0 — the fail-open this gate
    // exists to prevent. And a programming error (ReferenceError/TypeError) is
    // a defect in the gate itself, never a property of the repo, so it must
    // propagate rather than be laundered into a clean result.
    if (err instanceof ReferenceError || err instanceof TypeError) throw err;
    throw new Error(
      `cannot enumerate tracked plans (git: ${err && err.code ? err.code : 'failed'}) `
      + '— plan set UNKNOWN, refusing to report it as empty',
    );
  }
  return out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.endsWith('.md'))
    .map((rel) => path.resolve(root, rel));
}

/** `--all`: every tracked plan. Exit 1 on any real parity failure; exit 2 when
 *  the only obstacle was an unrunnable lint (infrastructure, disclosed). */
/**
 * `--structure-only`: the zero-dependency half. Enforceable in CI, where
 * qor-logic-plus is absent. Catches the origin failure (LDs the lint cannot
 * see) without needing the lint. Exit 0 or 1 — never 2, because nothing here
 * can be unavailable.
 */
function runStructureOnly() {
  let plans;
  try {
    plans = trackedPlans();
  } catch (err) {
    console.error(`[citation-parity] FAIL — ${err.message}`);
    return 1;
  }
  let bad = 0; let withLds = 0;
  for (const p of plans) {
    const text = fs.readFileSync(p, 'utf8');
    if (countLockedDecisions(text) === 0) continue;
    withLds++;
    const { orphans } = checkStructure(text);
    if (orphans.length > 0) {
      bad++;
      console.error(`[citation-parity] FAIL ${path.basename(p)} — ${orphans.length} Locked Decision(s) `
        + `at line(s) ${orphans.join(', ')} sit outside any "Locked Decisions"/"Citation Inventory" `
        + 'heading; plan_grep_lint cannot see them and would report 0 checked while exiting 0');
    }
  }
  console.log(`[citation-parity] structure: ${plans.length} tracked plan(s), ${withLds} declare Locked `
    + `Decisions, ${bad} with LDs the lint cannot see`);
  return bad > 0 ? 1 : 0;
}

function runAll() {
  let plans;
  try {
    plans = trackedPlans();
  } catch (err) {
    console.error(`[citation-parity] UNVERIFIED — ${err.message}`);
    return 2;
  }
  if (plans.length === 0) { console.log('[citation-parity] no tracked plans - nothing to check'); return 0; }
  let failures = 0, infra = 0, verified = 0, skipped = 0;
  for (const p of plans) {
    const r = check(p, undefined);
    const name = path.basename(p);
    if (r.declared === 0) { skipped++; continue; }
    if (r.infra) { infra++; console.error(`[citation-parity] UNVERIFIED ${name} - ${r.note}`); continue; }
    if (!r.pass) { failures++; console.error(`[citation-parity] FAIL ${name} - declared=${r.declared} truth-checked=${r.checked} - ${r.note}`); continue; }
    verified++; console.log(`[citation-parity] PASS ${name} - declared=${r.declared} truth-checked=${r.checked}`);
  }
  console.log(`[citation-parity] ${plans.length} tracked plan(s): ${verified} verified, ${failures} failed, ${infra} unverified (tool absent), ${skipped} declare no Locked Decisions`);
  if (failures > 0) return 1;
  if (infra > 0) return 2;
  return 0;
}

function main(argv) {
  if (argv.includes('--structure-only')) return runStructureOnly();
  if (argv.includes('--all')) return runAll();
  const planPath = argv[0];
  if (!planPath) {
    console.error('Usage: node check-plan-citation-parity.cjs <plan.md> [--lint-output <file>]');
    return 1;
  }
  if (!fs.existsSync(planPath)) {
    console.error(`[citation-parity] plan not found: ${planPath}`);
    return 1;
  }
  let lintOutput;
  const i = argv.indexOf('--lint-output');
  if (i !== -1) {
    const p = argv[i + 1];
    if (!p || !fs.existsSync(p)) {
      console.error('[citation-parity] --lint-output given but file not found');
      return 1;
    }
    lintOutput = fs.readFileSync(p, 'utf8');
  }

  const r = check(planPath, lintOutput);
  const tag = r.pass ? '[citation-parity] PASS' : (r.infra ? '[citation-parity] UNVERIFIED' : '[citation-parity] FAIL');
  const counts = r.checked === null ? `declared=${r.declared}` : `declared=${r.declared} truth-checked=${r.checked}`;
  const line = `${tag} — ${counts} — ${r.note}`;
  if (r.pass) console.log(line);
  else console.error(line);
  if (r.pass) return 0;
  return r.infra ? 2 : 1;
}

module.exports = { check, checkStructure, runStructureOnly, countLockedDecisions, parseTruthCheckedCount, trackedPlans, runAll };

if (require.main === module) process.exit(main(process.argv.slice(2)));
