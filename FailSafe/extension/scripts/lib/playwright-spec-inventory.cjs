/**
 * Playwright spec inventory helper (v5.1.0 publish-block lift, Phase 1).
 *
 * Two halves of the inventory:
 *   - REQUIRED: parsed from BROWSER_VERIFICATION.md `## Playwright-covered pages`
 *     section. These are the spec paths the operator commits to running.
 *   - DISK:     globbed from `FailSafe/extension/src/test/ui/*.spec.ts`.
 *
 * compareInventory() yields a structural delta. `missing` (required but absent
 * from disk) is the gate-blocking signal; `extra` (disk-only specs that aren't
 * referenced) is informational.
 *
 * Pure stdlib (fs / path); no IO outside the two read sites.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BROWSER_VERIFICATION_PATH = path.join(
  '.failsafe', 'governance', 'BROWSER_VERIFICATION.md',
);
const UI_SPEC_DIR = path.join('FailSafe', 'extension', 'src', 'test', 'ui');

const PLAYWRIGHT_SECTION_HEADER = '## Playwright-covered pages';
const NEXT_SECTION_PREFIX = '## ';
// Captures `\`<anything>.spec.ts\`` — backtick-quoted spec paths.
const SPEC_PATH_RE = /`([^`]+\.spec\.ts)`/g;

function loadRequiredSpecs(repoRoot) {
  const filePath = path.join(repoRoot, BROWSER_VERIFICATION_PATH);
  if (!fs.existsSync(filePath)) return new Set();
  const body = fs.readFileSync(filePath, 'utf8');
  const section = extractPlaywrightSection(body);
  return extractSpecPaths(section);
}

function extractPlaywrightSection(body) {
  const startIdx = body.indexOf(PLAYWRIGHT_SECTION_HEADER);
  if (startIdx < 0) return '';
  const afterHeader = body.slice(startIdx + PLAYWRIGHT_SECTION_HEADER.length);
  const nextHeaderIdx = afterHeader.indexOf(`\n${NEXT_SECTION_PREFIX}`);
  return nextHeaderIdx < 0 ? afterHeader : afterHeader.slice(0, nextHeaderIdx);
}

function extractSpecPaths(section) {
  const specs = new Set();
  let match;
  SPEC_PATH_RE.lastIndex = 0;
  while ((match = SPEC_PATH_RE.exec(section)) !== null) {
    specs.add(normalizeSpec(match[1]));
  }
  return specs;
}

function normalizeSpec(raw) {
  // Normalize separators + strip a leading "FailSafe/extension/" so disk and
  // required sets use the same anchor (relative-to-extension).
  const slashed = raw.replace(/\\/g, '/');
  return slashed.replace(/^FailSafe\/extension\//, '');
}

function loadDiskSpecs(repoRoot) {
  const dir = path.join(repoRoot, UI_SPEC_DIR);
  if (!fs.existsSync(dir)) return new Set();
  const specs = new Set();
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.spec.ts')) continue;
    const rel = path.posix.join('src', 'test', 'ui', name);
    specs.add(rel);
  }
  return specs;
}

function compareInventory(required, disk) {
  const missing = [];
  const extra = [];
  for (const spec of required) if (!disk.has(spec)) missing.push(spec);
  for (const spec of disk) if (!required.has(spec)) extra.push(spec);
  missing.sort();
  extra.sort();
  return { missing, extra };
}

module.exports = {
  loadRequiredSpecs,
  loadDiskSpecs,
  compareInventory,
  BROWSER_VERIFICATION_PATH,
  UI_SPEC_DIR,
};
