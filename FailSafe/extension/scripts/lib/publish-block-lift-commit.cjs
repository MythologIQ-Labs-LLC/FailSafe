/**
 * PUBLISH_BLOCK lift-commit helper (v5.1.0 publish-block lift, Phase 3).
 *
 * `prepareLiftCommit(repoRoot)` does NOT modify the filesystem. It produces a
 * structured edit-plan + a META_LEDGER entry draft. The caller (operator or
 * /qor-implement) applies the edits + stages + commits — per the no-ship rule,
 * the gate-lifting commit always requires explicit per-action authorization.
 *
 * Three branches:
 *   - PUBLISH_BLOCK Active=no already   → returns null (idempotent no-op).
 *   - BROWSER_VERIFICATION schema fails → throws Error with `.condition` set.
 *   - All conditions met                → returns the structured edit object.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const schema = require('./browser-verification-schema.cjs');

const PUBLISH_BLOCK_REL = path.join('.failsafe', 'governance', 'PUBLISH_BLOCK.md');
const ACTIVE_YES_RE = /^\*\*Active\*\*:\s*yes\b/im;
const ACTIVE_NO_RE = /^\*\*Active\*\*:\s*no\b/im;

class LiftSchemaError extends Error {
  constructor(condition, message) {
    super(`Lift blocked: PUBLISH_BLOCK Condition ${condition} — ${message}`);
    this.condition = condition;
    this.name = 'LiftSchemaError';
  }
}

function prepareLiftCommit(repoRoot) {
  const publishBlockPath = path.join(repoRoot, PUBLISH_BLOCK_REL);
  if (!fs.existsSync(publishBlockPath)) {
    throw new LiftSchemaError(0, `PUBLISH_BLOCK.md not found at ${PUBLISH_BLOCK_REL}`);
  }
  const body = fs.readFileSync(publishBlockPath, 'utf8');
  if (ACTIVE_NO_RE.test(body)) return null; // idempotent no-op
  if (!ACTIVE_YES_RE.test(body)) {
    throw new LiftSchemaError(0, 'PUBLISH_BLOCK.md `**Active**:` flag not found in yes or no form');
  }
  const validation = schema.validate(repoRoot);
  if (!validation.valid) {
    const first = validation.errors[0];
    throw new LiftSchemaError(first.condition, first.message);
  }
  return {
    filesToEdit: {
      [PUBLISH_BLOCK_REL]: {
        from: '**Active**: yes',
        to: buildActiveNoBlock(),
      },
    },
    ledgerEntryDraft: buildLedgerEntryDraft(),
  };
}

function buildActiveNoBlock() {
  return [
    '**Active**: no',
    '**Lifted on**: <YYYY-MM-DD — operator fills>',
    '**Lift reference**: META_LEDGER #<substantiate-entry — operator fills>',
  ].join('\n');
}

function buildLedgerEntryDraft() {
  return [
    '### Entry #<N>: IMPLEMENTATION — v5.1.0 PUBLISH_BLOCK lift (Active=yes → no)',
    '',
    '**Timestamp**: <ISO 8601>',
    '**Phase**: IMPLEMENT',
    '**Persona**: Specialist (operator-authorized)',
    '**Plan**: `docs/plan-qor-v5-1-0-publish-block-lift.md`',
    '**Risk Grade**: L2',
    '',
    '**Pre-lift conditions verified**:',
    '- Condition 1: FEATURE_INDEX 0 unverified (sealed at #354)',
    '- Condition 2: BROWSER_VERIFICATION Playwright rows all pass + structural inventory match',
    '- Condition 3: Screenshot rows + operator notes present',
    '- Condition 4: Signature non-blank',
    '- Condition 5: This plan substantiated at <substantiate-entry>',
    '',
    '**Edit**: `.failsafe/governance/PUBLISH_BLOCK.md` `**Active**: yes` → `**Active**: no` + `**Lifted on**:` + `**Lift reference**:` lines.',
    '',
    '**Effect**: Marketplace publish surface no longer governance-gated. Release-class commit (`npm version 5.1.0` + CHANGELOG stamp + annotated tag + push) is the operator\'s next step per `docs/release-runbook-v5-1-0.md`.',
  ].join('\n');
}

module.exports = { prepareLiftCommit, LiftSchemaError, PUBLISH_BLOCK_REL };
