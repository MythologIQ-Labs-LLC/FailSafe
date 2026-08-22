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
 *
 * With --lint-output, reads pre-captured `plan_grep_lint` stdout instead of
 * invoking it (so this runs where qor-logic-plus is not importable).
 *
 * Exit 0 = parity holds. Exit 1 = mismatch, or a plan with LDs whose lint
 * output could not be obtained. Exit 0 with a note = plan declares no Locked
 * Decisions, so there is nothing to check.
 */
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

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

function runLint(planPath) {
  try {
    return execFileSync(
      'qor-logic-plus',
      ['scripts', 'plan_grep_lint', '--plan', planPath, '--repo-root', '.'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    // Non-zero exit still carries the count on stdout; a spawn failure does not.
    // Distinguishing the two matters here for the same reason the origin bug did.
    if (err && typeof err.stdout === 'string' && err.stdout.length > 0) return err.stdout;
    return null;
  }
}

function check(planPath, lintOutput) {
  const planText = fs.readFileSync(planPath, 'utf8');
  const declared = countLockedDecisions(planText);

  if (declared === 0) {
    return { pass: true, declared, checked: null, note: 'plan declares no Locked Decisions — nothing to verify' };
  }

  const output = lintOutput !== null && lintOutput !== undefined ? lintOutput : runLint(planPath);
  if (output === null) {
    return {
      pass: false, declared, checked: null,
      note: 'plan declares Locked Decisions but plan_grep_lint output could not be obtained — '
        + 'cannot confirm the citations were checked, which is the condition this gate exists to catch',
    };
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

function main(argv) {
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
  const tag = r.pass ? '[citation-parity] PASS' : '[citation-parity] FAIL';
  const counts = r.checked === null ? `declared=${r.declared}` : `declared=${r.declared} truth-checked=${r.checked}`;
  const line = `${tag} — ${counts} — ${r.note}`;
  if (r.pass) console.log(line);
  else console.error(line);
  return r.pass ? 0 : 1;
}

module.exports = { check, countLockedDecisions, parseTruthCheckedCount };

if (require.main === module) process.exit(main(process.argv.slice(2)));
