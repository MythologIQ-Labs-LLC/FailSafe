#!/usr/bin/env node
// check-publish-block.cjs
//
// PUBLISH_BLOCK Lifting Protocol validator. Mechanically validates conditions
// 1-4 of `.failsafe/governance/PUBLISH_BLOCK.md`. Condition 5 (substantiate
// seal) is the operator's /qor-substantiate cycle and lives in META_LEDGER.
//
// Post-v5.1.0-lift integration (Phase 1 + Phase 2 of plan-qor-v5-1-0-publish-
// block-lift): structural validation delegates to
// `scripts/lib/browser-verification-schema.cjs`; Playwright spec inventory
// drift detection delegates to `scripts/lib/playwright-spec-inventory.cjs`.
//
// Exit codes:
//   0 — all conditions met (block lift permitted from this script's view).
//   1 — at least one condition failed; first failure printed as `Reason N: ...`.
//   2 — usage / IO error.

'use strict';

const fs = require('fs');
const path = require('path');

const schema = require('./lib/browser-verification-schema.cjs');
const inventory = require('./lib/playwright-spec-inventory.cjs');

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

// Conditions 2/3/4 delegate to the schema validator. The first emitted error
// becomes the failure reason; the rest are returned for diagnostic-only use.
function checkBrowserVerificationSchema(paths, repoRoot) {
  const result = schema.validate(repoRoot);
  if (result.valid) return null;
  const first = result.errors[0];
  return {
    reason: first.condition,
    message: first.message,
    additionalErrors: result.errors.slice(1),
  };
}

// Condition 2 structural inventory: every Playwright row cited in
// BROWSER_VERIFICATION.md must correspond to a real spec under
// `src/test/ui/`. Catches rename/move drift between attestation and disk.
function checkPlaywrightSpecInventory(repoRoot) {
  const required = inventory.loadRequiredSpecs(repoRoot);
  if (required.size === 0) return null; // schema validator already flagged
  const disk = inventory.loadDiskSpecs(repoRoot);
  const delta = inventory.compareInventory(required, disk);
  if (delta.missing.length === 0) return null;
  return {
    reason: 2,
    message: `BROWSER_VERIFICATION.md cites ${delta.missing.length} spec(s) not on disk: ${delta.missing.join(', ')}`,
  };
}

// Programmatic entry point — safe to call from tests. Returns
// { ok: boolean, reason?: number, message?: string, skipped?: boolean }.
function evaluate(repoRoot) {
  const root = repoRoot || REPO_ROOT_DEFAULT;
  const paths = buildPaths(root);
  if (!isPublishBlockActive(paths)) {
    return { ok: true, skipped: true };
  }
  // Order matters: condition 1 (cheapest) → condition 2 schema → condition 2
  // inventory drift → conditions 3/4 surface from schema if still failing.
  const featureIndexFail = checkFeatureIndex(paths);
  if (featureIndexFail) return { ok: false, ...featureIndexFail };
  const schemaFail = checkBrowserVerificationSchema(paths, root);
  if (schemaFail) return { ok: false, reason: schemaFail.reason, message: schemaFail.message };
  const inventoryFail = checkPlaywrightSpecInventory(root);
  if (inventoryFail) return { ok: false, ...inventoryFail };
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
  checkBrowserVerificationSchema,
  checkPlaywrightSpecInventory,
  buildPaths,
};
