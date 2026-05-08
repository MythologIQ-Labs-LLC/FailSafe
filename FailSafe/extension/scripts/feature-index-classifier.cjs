#!/usr/bin/env node
// FEATURE_INDEX baseline audit — test functionality classifier.
//
// Phase 1 of plan-feature-index-baseline-audit.md v2 (PASS at META_LEDGER #300).
// Applies the SG-035 acceptance question heuristically to each cited test in
// docs/FEATURE_INDEX.md and emits a per-row classification report.
//
// Five test-kind classifications, priority-ordered:
//   1. unrunnable      — test file does not exist on disk
//   2. no-test-blocks  — file exists but has no it/test/suite/describe blocks
//   3. presence-only   — only presence-style assertions, no symbol invocation
//   4. functional      — invokes unit + asserts on return value or side-effect
//   5. ambiguous       — heuristics inconclusive; flagged for operator review
//
// Multi-test rows: row is `verified` if AT LEAST ONE cited test classifies
// `functional`; otherwise the worst per-test kind drives `unverified`.
//
// Invocation:
//   node feature-index-classifier.cjs \
//     --feature-index docs/FEATURE_INDEX.md \
//     --repo-root . \
//     --out dist/feature-index-classification.json
//
// Exit codes:
//   0 — audit completed; report written; summary printed to stdout.
//   2 — usage error or unparseable input.

'use strict';

const fs = require('fs');
const path = require('path');
const heuristics = require('./feature-index-classifier-heuristics.cjs');

const TEST_REL_BASE = path.join('FailSafe', 'extension', 'src', 'test');
const KIND_ORDER = ['functional', 'ambiguous', 'presence-only', 'no-test-blocks', 'unrunnable'];

function usage(msg) {
  if (msg) process.stderr.write(`feature-index-classifier: ${msg}\n`);
  process.stderr.write(
    'usage: feature-index-classifier --feature-index <path> --repo-root <path> --out <path>\n',
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
  if (!fs.existsSync(out.featureIndex)) usage(`feature-index file not found: ${out.featureIndex}`);
  if (!fs.existsSync(out.repoRoot)) usage(`repo-root not found: ${out.repoRoot}`);
  return out;
}

// Parses FEATURE_INDEX.md rows into structured objects.
// Skips header rows, separator rows, and any row whose first cell is not FX###.
function parseFeatureIndexRows(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\|(.+)\|\s*$/);
    if (!m) continue;
    const cells = m[1].split('|').map(c => c.trim());
    if (cells.length < 7) continue;
    if (cells.every(c => /^[-:\s]+$/.test(c))) continue;
    if (!/^FX\d+$/.test(cells[0])) continue;

    const testCell = cells[4];
    const testPaths = testCell === '—' || testCell === '' || testCell === '-'
      ? []
      : testCell.split('+').map(p => p.trim()).filter(Boolean);

    rows.push({
      entryId: cells[0],
      feature: cells[1],
      docRef: cells[2],
      codeRef: cells[3],
      testPaths,
      status: cells[5],
      notes: cells[6] || '',
      line: i + 1,
    });
  }
  return rows;
}

// Resolves a cited test path (relative to FailSafe/extension/src/test/) to
// an absolute path. Returns null when the file is absent.
function resolveTestPath(repoRoot, citedPath) {
  if (!citedPath) return null;
  const full = path.join(repoRoot, TEST_REL_BASE, citedPath);
  return fs.existsSync(full) ? full : null;
}

// Heuristic classifier for a single test file body. See heuristic priority
// in the file-level comment block above.
function classifyTestFile(text, codeRef) {
  if (text === null || text === undefined) {
    return { kind: 'unrunnable', reasoning: 'test file does not exist on disk' };
  }
  if (!heuristics.hasTestBlocks(text)) {
    return { kind: 'no-test-blocks', reasoning: 'no it/test/suite/describe blocks found' };
  }
  const presenceOnly = heuristics.hasOnlyPresenceAssertions(text, codeRef);
  if (presenceOnly.matches) {
    return { kind: 'presence-only', reasoning: presenceOnly.reasoning };
  }
  if (heuristics.hasFunctionalAssertions(text)) {
    return { kind: 'functional', reasoning: 'invokes symbol + asserts on return value or side-effect' };
  }
  return { kind: 'ambiguous', reasoning: 'has test blocks but heuristics inconclusive' };
}

// Classifies a single FEATURE_INDEX row by walking each cited test path.
// Multi-test rule: at-least-one-functional → verified; otherwise worst kind
// drives unverified.
function classifyEntry(row, repoRoot) {
  if (!row.testPaths || row.testPaths.length === 0) {
    return {
      entryId: row.entryId,
      currentStatus: row.status,
      suggestedStatus: row.status === 'n/a' ? 'n/a' : 'unverified',
      classifications: [{ testPath: null, kind: 'unrunnable', reasoning: 'no cited test path' }],
      notes: row.notes,
    };
  }
  const classifications = row.testPaths.map(tp => {
    const abs = resolveTestPath(repoRoot, tp);
    const text = abs ? fs.readFileSync(abs, 'utf-8') : null;
    const result = classifyTestFile(text, row.codeRef);
    return { testPath: tp, kind: result.kind, reasoning: result.reasoning };
  });
  const hasFunctional = classifications.some(c => c.kind === 'functional');
  let suggestedStatus;
  if (row.status === 'n/a') suggestedStatus = 'n/a';
  else if (hasFunctional) suggestedStatus = 'verified';
  else suggestedStatus = 'unverified';
  return {
    entryId: row.entryId,
    currentStatus: row.status,
    suggestedStatus,
    classifications,
    notes: row.notes,
  };
}

// Top-level driver: reads FEATURE_INDEX.md, classifies every row, returns the
// audit object. Pure (no writes) — caller invokes writeReport.
function runAudit(featureIndexPath, repoRoot) {
  const text = fs.readFileSync(featureIndexPath, 'utf-8');
  const rows = parseFeatureIndexRows(text);
  const classified = rows.map(r => classifyEntry(r, repoRoot));
  const summary = buildSummary(classified);
  return { summary, rows: classified };
}

function buildSummary(classified) {
  const byCurrentStatus = {};
  const bySuggestedStatus = {};
  const byKind = {};
  for (const r of classified) {
    byCurrentStatus[r.currentStatus] = (byCurrentStatus[r.currentStatus] || 0) + 1;
    bySuggestedStatus[r.suggestedStatus] = (bySuggestedStatus[r.suggestedStatus] || 0) + 1;
    for (const c of r.classifications) {
      byKind[c.kind] = (byKind[c.kind] || 0) + 1;
    }
  }
  return { total: classified.length, byCurrentStatus, bySuggestedStatus, byKind };
}

// Writes the audit JSON to outPath and prints a stdout summary.
function writeReport(audit, outPath) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(audit, null, 2) + '\n');
  process.stdout.write(`feature-index-classifier: wrote ${outPath}\n`);
  process.stdout.write(`  total rows: ${audit.summary.total}\n`);
  process.stdout.write('  by current status:\n');
  for (const [k, v] of Object.entries(audit.summary.byCurrentStatus)) {
    process.stdout.write(`    ${k}: ${v}\n`);
  }
  process.stdout.write('  by suggested status:\n');
  for (const [k, v] of Object.entries(audit.summary.bySuggestedStatus)) {
    process.stdout.write(`    ${k}: ${v}\n`);
  }
  process.stdout.write('  per-test kind distribution:\n');
  for (const k of KIND_ORDER) {
    if (audit.summary.byKind[k] !== undefined) {
      process.stdout.write(`    ${k}: ${audit.summary.byKind[k]}\n`);
    }
  }
}

function main(argv) {
  const args = parseArgs(argv);
  const audit = runAudit(args.featureIndex, args.repoRoot);
  writeReport(audit, args.outPath);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  parseFeatureIndexRows,
  resolveTestPath,
  classifyTestFile,
  classifyEntry,
  runAudit,
  writeReport,
};
