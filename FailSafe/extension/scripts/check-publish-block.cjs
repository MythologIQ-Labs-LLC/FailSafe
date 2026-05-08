#!/usr/bin/env node
// check-publish-block.cjs
//
// Phase 2 governance state machine for plan-monitor-coherence-and-browser-
// verification.md. Mechanically validates conditions 1-4 of the
// PUBLISH_BLOCK Lifting Protocol; condition 5 (substantiate seal) is read
// from META_LEDGER and is out of scope here (checked by qor-substantiate).
//
// Exit codes:
//   0 — all 4 conditions met (block lift permitted from this script's view).
//   1 — at least one condition failed; first failure printed as `Reason N: ...`.
//   2 — usage / IO error.

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT_DEFAULT = path.resolve(__dirname, '..', '..', '..');

function buildPaths(repoRoot) {
  return {
    publishBlock: path.join(repoRoot, '.failsafe', 'governance', 'PUBLISH_BLOCK.md'),
    browserVerification: path.join(repoRoot, '.failsafe', 'governance', 'BROWSER_VERIFICATION.md'),
    screenshotsDir: path.join(repoRoot, '.failsafe', 'governance', 'screenshots'),
    featureIndex: path.join(repoRoot, 'docs', 'FEATURE_INDEX.md'),
  };
}

function readMaybe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function isPublishBlockActive(paths) {
  const text = readMaybe(paths.publishBlock);
  if (!text) return false;
  return /\*\*Active\*\*\s*:\s*yes/i.test(text);
}

// Returns { reason: number, message: string } on failure, or null on success.
function checkFeatureIndex(paths) {
  const text = readMaybe(paths.featureIndex);
  if (!text) {
    return { reason: 1, message: `FEATURE_INDEX.md not found at ${paths.featureIndex}` };
  }
  const matches = text.match(/\bunverified\b/gi) || [];
  if (matches.length > 0) {
    return {
      reason: 1,
      message: `FEATURE_INDEX.md contains ${matches.length} 'unverified' marker(s); must be 0.`,
    };
  }
  return null;
}

function checkBrowserVerification(paths) {
  const text = readMaybe(paths.browserVerification);
  if (!text) {
    return { reason: 2, message: `BROWSER_VERIFICATION.md missing at ${paths.browserVerification}` };
  }
  if (!/\*\*Active\*\*\s*:\s*no/i.test(text)) {
    return {
      reason: 2,
      message: `BROWSER_VERIFICATION.md does not show 'Active: no' (must flip after operator sign-off).`,
    };
  }
  const section = text.split(/^##\s+/m).find((s) => /^Playwright-covered/i.test(s));
  if (!section) {
    return { reason: 2, message: `BROWSER_VERIFICATION.md missing 'Playwright-covered pages' section.` };
  }
  if (!/result:\s*pass/i.test(section)) {
    return { reason: 2, message: `BROWSER_VERIFICATION.md Playwright section has no 'result: pass' entries.` };
  }
  return null;
}

function checkScreenshots(paths) {
  const text = readMaybe(paths.browserVerification);
  if (!text) return null; // condition 2 already failed
  const section = text.split(/^##\s+/m).find((s) => /^Screenshot-covered/i.test(s));
  if (!section) {
    return { reason: 3, message: `BROWSER_VERIFICATION.md missing 'Screenshot-covered pages' section.` };
  }
  const refs = section.match(/Screenshot:\s*([^\s)]+)/gi) || [];
  if (refs.length === 0) {
    return { reason: 3, message: `BROWSER_VERIFICATION.md screenshot section has no 'Screenshot:' references.` };
  }
  if (!/Operator note:/i.test(section)) {
    return { reason: 3, message: `BROWSER_VERIFICATION.md screenshot section missing 'Operator note:' lines.` };
  }
  if (!fs.existsSync(paths.screenshotsDir)) {
    return { reason: 3, message: `Screenshot directory missing at ${paths.screenshotsDir}.` };
  }
  return null;
}

function checkSignature(paths) {
  const text = readMaybe(paths.browserVerification);
  if (!text) return null; // condition 2 already failed
  const m = text.match(/Signature:\s*(.+)$/im);
  if (!m) {
    return { reason: 4, message: `BROWSER_VERIFICATION.md missing 'Signature:' line.` };
  }
  const sig = m[1].trim();
  if (!sig || /^_+$/.test(sig)) {
    return { reason: 4, message: `BROWSER_VERIFICATION.md operator signature line is blank/placeholder.` };
  }
  return null;
}

// Programmatic entry point — safe to call from tests. Returns
// { ok: boolean, reason?: number, message?: string, skipped?: boolean }.
function evaluate(repoRoot) {
  const paths = buildPaths(repoRoot || REPO_ROOT_DEFAULT);
  if (!isPublishBlockActive(paths)) {
    return { ok: true, skipped: true };
  }
  const checks = [
    checkFeatureIndex,
    checkBrowserVerification,
    checkScreenshots,
    checkSignature,
  ];
  for (const fn of checks) {
    const result = fn(paths);
    if (result) return { ok: false, ...result };
  }
  return { ok: true };
}

function runCli() {
  let result;
  try { result = evaluate(REPO_ROOT_DEFAULT); }
  catch (err) {
    process.stderr.write(`check-publish-block: unexpected error: ${err && err.stack || err}\n`);
    process.exit(2);
  }
  if (result.skipped) {
    process.stdout.write('PUBLISH_BLOCK already inactive; no lifting check needed.\n');
    process.exit(0);
  }
  if (!result.ok) {
    process.stderr.write(`Reason ${result.reason}: ${result.message}\n`);
    process.exit(1);
  }
  process.stdout.write(
    'Conditions 1-4 satisfied; condition 5 (substantiate seal) checked by qor-substantiate.\n',
  );
  process.exit(0);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  evaluate,
  isPublishBlockActive,
  checkFeatureIndex,
  checkBrowserVerification,
  checkScreenshots,
  checkSignature,
  buildPaths,
};
