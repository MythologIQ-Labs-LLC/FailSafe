#!/usr/bin/env node
// E7 override-staleness detector. Closes Qor #41.
//
// Runs the FEATURE_INDEX classifier twice — once with MANUAL_OVERRIDES applied
// (production mode) and once with overrides bypassed — then per-entry diffs
// the suggestedStatus. Findings classes:
//   1. redundant: classifier verdict (without override) AGREES with override.
//      The override is no longer needed; heuristic caught up.
//   2. invalid:   override.reason references a test file path (extracted via
//      regex) that no longer resolves on disk. Override is stale because the
//      cited test was renamed/deleted.
//   3. no_path:   override.reason contains no detectable test-file substring.
//      Detector cannot validate; surfaces as informational WARN.
//
// Output: dist/override-staleness.findings.json (gitignored runtime artifact).
// Advisory only — does NOT auto-modify MANUAL_OVERRIDES; operator decides
// per-entry whether to delete, retain, or update.
//
// Invocation:
//   node feature-index-classifier-staleness.cjs \
//     --feature-index docs/FEATURE_INDEX.md \
//     --repo-root . \
//     --out dist/override-staleness.findings.json

'use strict';

const fs = require('fs');
const path = require('path');
const { runAudit, MANUAL_OVERRIDES, resolveTestPath } = require('./feature-index-classifier.cjs');

const TEST_PATH_RE = /[a-zA-Z0-9_/\-.]+\.(test|spec)\.(ts|tsx|js|jsx)/;

function extractTestPath(reason) {
  if (typeof reason !== 'string') return null;
  const m = reason.match(TEST_PATH_RE);
  return m ? m[0] : null;
}

function detectStaleness(featureIndexPath, repoRoot) {
  const withOverrides = runAudit(featureIndexPath, repoRoot);
  const bypassed = runAudit(featureIndexPath, repoRoot, { bypassOverrides: true });

  const findings = [];
  const overrideIds = Object.keys(MANUAL_OVERRIDES);
  for (const entryId of overrideIds) {
    const override = MANUAL_OVERRIDES[entryId];
    const withRow = withOverrides.rows.find(r => r.entryId === entryId);
    const bypassRow = bypassed.rows.find(r => r.entryId === entryId);
    if (!withRow || !bypassRow) {
      findings.push({ entryId, kind: 'missing', reason: 'entry not present in classification' });
      continue;
    }
    const testPath = extractTestPath(override.reason);
    if (!testPath) {
      findings.push({
        entryId,
        kind: 'no_path_in_reason',
        overrideStatus: override.status,
        hint: 'override.reason field has no test-file substring; cannot validate test-state',
      });
      continue;
    }
    const resolved = resolveTestPath(repoRoot, testPath);
    if (!resolved) {
      findings.push({
        entryId,
        kind: 'invalid',
        testPath,
        overrideStatus: override.status,
        hint: 'cited test path does not resolve; override targets a renamed/deleted test',
      });
      continue;
    }
    if (withRow.suggestedStatus === bypassRow.suggestedStatus) {
      findings.push({
        entryId,
        kind: 'redundant',
        testPath,
        classifierVerdict: bypassRow.suggestedStatus,
        overrideStatus: override.status,
        hint: 'classifier (without override) agrees with override; consider removing the override',
      });
    }
  }

  const summary = {
    total_overrides_checked: overrideIds.length,
    redundant_count: findings.filter(f => f.kind === 'redundant').length,
    invalid_count: findings.filter(f => f.kind === 'invalid').length,
    no_path_count: findings.filter(f => f.kind === 'no_path_in_reason').length,
    missing_count: findings.filter(f => f.kind === 'missing').length,
  };
  return { summary, findings };
}

function usage(msg) {
  if (msg) process.stderr.write(`override-staleness: ${msg}\n`);
  process.stderr.write(
    'usage: feature-index-classifier-staleness --feature-index <path> --repo-root <path> --out <path>\n',
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = { featureIndex: null, repoRoot: null, outPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--feature-index') out.featureIndex = argv[++i];
    else if (a === '--repo-root') out.repoRoot = argv[++i];
    else if (a === '--out') out.outPath = argv[++i];
    else usage(`unknown arg: ${a}`);
  }
  if (!out.featureIndex) usage('missing --feature-index');
  if (!out.repoRoot) usage('missing --repo-root');
  if (!out.outPath) usage('missing --out');
  if (!fs.existsSync(out.featureIndex)) usage(`feature-index not found: ${out.featureIndex}`);
  if (!fs.existsSync(out.repoRoot)) usage(`repo-root not found: ${out.repoRoot}`);
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  const result = detectStaleness(args.featureIndex, args.repoRoot);
  const dir = path.dirname(args.outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(args.outPath, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(`override-staleness: wrote ${args.outPath}\n`);
  process.stdout.write(`  total: ${result.summary.total_overrides_checked}\n`);
  process.stdout.write(`  redundant: ${result.summary.redundant_count}\n`);
  process.stdout.write(`  invalid: ${result.summary.invalid_count}\n`);
  process.stdout.write(`  no_path: ${result.summary.no_path_count}\n`);
  process.stdout.write(`  missing: ${result.summary.missing_count}\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { detectStaleness, extractTestPath, TEST_PATH_RE };
