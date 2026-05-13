/**
 * BROWSER_VERIFICATION.md schema validator (v5.1.0 publish-block lift, Phase 2).
 *
 * Centralizes the structural rules for a fully-attested
 * `.failsafe/governance/BROWSER_VERIFICATION.md`. Returns a structured
 * `{ valid, errors[] }` instead of a binary boolean so the caller can route
 * each error to the corresponding PUBLISH_BLOCK lifting-protocol condition
 * (2/3/4).
 *
 * Pure stdlib parsing; one read per validate() call.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FILE_REL = path.join('.failsafe', 'governance', 'BROWSER_VERIFICATION.md');

const ACTIVE_RE = /^\*\*Active\*\*:\s*(yes|no)\b/im;
const PLAYWRIGHT_HEADER = '## Playwright-covered pages';
const SCREENSHOT_HEADER = '## Screenshot-covered pages';
const SIGNOFF_HEADER = '## Operator sign-off';
const SIGNATURE_RE = /^Signature:\s*(.+?)\s*$/m;
const BLANK_SIGNATURE_RE = /^_+\s*$|^$/;

const PLAYWRIGHT_ROW_RE =
  /^-\s*\[(x| )\]\s*[^—\n]+`[^`]+\.spec\.ts`[^—\n]*—\s*last run:\s*([^,\n]+),\s*result:\s*(pass|fail|<[^>]+>)/im;

function validate(repoRoot) {
  const filePath = path.join(repoRoot, FILE_REL);
  const errors = [];
  if (!fs.existsSync(filePath)) {
    errors.push({ condition: 2, message: 'BROWSER_VERIFICATION.md missing' });
    return { valid: false, errors };
  }
  const body = fs.readFileSync(filePath, 'utf8');
  errors.push(...validateActiveFlag(body));
  errors.push(...validatePlaywrightSection(body));
  errors.push(...validateScreenshotSection(body));
  errors.push(...validateSignoff(body));
  return { valid: errors.length === 0, errors };
}

function validateActiveFlag(body) {
  const match = body.match(ACTIVE_RE);
  if (!match) {
    return [{ condition: 2, message: '**Active** flag not found' }];
  }
  if (match[1].toLowerCase() !== 'no') {
    return [{
      condition: 2,
      message: `**Active** is "${match[1]}"; expected Active: no before lift`,
    }];
  }
  return [];
}

function validatePlaywrightSection(body) {
  const section = extractSection(body, PLAYWRIGHT_HEADER, SCREENSHOT_HEADER);
  if (!section.trim()) {
    return [{ condition: 2, message: '`## Playwright-covered pages` section missing or empty' }];
  }
  const rows = section.split(/\n/).filter((l) => l.trim().startsWith('- ['));
  if (rows.length === 0) {
    return [{ condition: 2, message: 'No Playwright-covered rows present' }];
  }
  const errors = [];
  for (const row of rows) {
    const m = row.match(PLAYWRIGHT_ROW_RE);
    if (!m) {
      errors.push({ condition: 2, message: `Playwright row missing required fields: "${row.trim()}"` });
      continue;
    }
    if (m[3].toLowerCase() !== 'pass') {
      errors.push({ condition: 2, message: `Playwright row result is "${m[3]}"; must be "pass": "${row.trim()}"` });
    }
    if (m[2].trim().startsWith('<')) {
      errors.push({ condition: 2, message: `Playwright row timestamp is placeholder: "${row.trim()}"` });
    }
  }
  return errors;
}

function validateScreenshotSection(body) {
  const section = extractSection(body, SCREENSHOT_HEADER, SIGNOFF_HEADER);
  if (!section.trim()) {
    return [{ condition: 3, message: '`## Screenshot-covered pages` section missing or empty' }];
  }
  const rows = section.split(/\n### /).slice(1); // each `###` block is one screenshot row
  if (rows.length === 0) {
    return [{ condition: 3, message: 'No screenshot rows present' }];
  }
  const errors = [];
  for (const row of rows) {
    const title = row.split('\n')[0].trim();
    if (!/Screenshot:\s*\S+\.png/i.test(row)) {
      errors.push({ condition: 3, message: `Screenshot row "${title}" missing Screenshot: <file>.png` });
    }
    if (!/Operator note:\s*\S+/i.test(row) || /Operator note:\s*<[^>]+>/i.test(row)) {
      errors.push({ condition: 3, message: `Screenshot row "${title}" missing or placeholder Operator note` });
    }
  }
  return errors;
}

function validateSignoff(body) {
  const idx = body.indexOf(SIGNOFF_HEADER);
  if (idx < 0) {
    return [{ condition: 4, message: '`## Operator sign-off` section missing' }];
  }
  const section = body.slice(idx);
  const sig = section.match(SIGNATURE_RE);
  if (!sig) {
    return [{ condition: 4, message: 'Signature line missing' }];
  }
  if (BLANK_SIGNATURE_RE.test(sig[1])) {
    return [{ condition: 4, message: 'Signature line is blank or unfilled placeholder' }];
  }
  return [];
}

function extractSection(body, startHeader, endHeader) {
  const startIdx = body.indexOf(startHeader);
  if (startIdx < 0) return '';
  const afterStart = body.slice(startIdx + startHeader.length);
  const endIdx = afterStart.indexOf(`\n${endHeader}`);
  return endIdx < 0 ? afterStart : afterStart.slice(0, endIdx);
}

module.exports = { validate, FILE_REL };
