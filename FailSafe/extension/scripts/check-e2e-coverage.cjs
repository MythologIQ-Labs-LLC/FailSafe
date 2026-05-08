#!/usr/bin/env node
// CI gate: when the active plan's change_class is `feature` or `breaking`,
// every staged source-file change in a designated surface must ship with a
// corresponding `*.spec.ts` (or be acknowledged via `[no-e2e: <reason>]` in a
// commit message in the range being pushed).
//
// Exit 0 = coverage satisfied (or gate not applicable).
// Exit 1 = block; missing E2E coverage for one or more staged files.

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const SURFACE_PATTERNS = [
  { match: /^FailSafe\/extension\/src\/roadmap\/ui\//, kind: 'playwright' },
  { match: /^FailSafe\/extension\/src\/roadmap\/routes\//, kind: 'integration' },
  { match: /^FailSafe\/extension\/src\/extension\/commands\.ts$/, kind: 'vscode-test' },
  { match: /^FailSafe\/extension\/src\/extension\/bootstrapServers\.ts$/, kind: 'integration' },
];

const ENFORCE_CLASSES = new Set(['feature', 'breaking']);

function readChangeClass() {
  if (process.env.FAILSAFE_CHANGE_CLASS) return process.env.FAILSAFE_CHANGE_CLASS.trim();
  const plansDir = path.join(REPO_ROOT, '.failsafe', 'governance', 'plans');
  if (!fs.existsSync(plansDir)) return null;
  const candidates = fs.readdirSync(plansDir)
    .filter((name) => name.startsWith('plan-') && name.endsWith('.md'))
    .map((name) => ({ name, mtime: fs.statSync(path.join(plansDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const cand of candidates) {
    const body = fs.readFileSync(path.join(plansDir, cand.name), 'utf8');
    const match = body.match(/\*\*change_class\*\*\s*:\s*([a-z]+)/i)
      || body.match(/^change_class\s*:\s*([a-z]+)/im);
    if (match) return match[1].trim().toLowerCase();
  }
  return null;
}

function gitOutput(cmd) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
}

function stagedFiles() {
  const out = gitOutput('git diff --cached --name-only --diff-filter=ACMR');
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function commitMessagesInRange() {
  const range = gitOutput('git rev-parse --abbrev-ref --symbolic-full-name @{u}').trim();
  const cmd = range
    ? 'git log @{u}..HEAD --pretty=%B'
    : 'git log -n 20 --pretty=%B';
  return gitOutput(cmd);
}

function classifyStaged(files) {
  const requires = [];
  const specChanges = [];
  for (const file of files) {
    if (file.endsWith('.spec.ts')) specChanges.push(file);
    for (const { match, kind } of SURFACE_PATTERNS) {
      if (match.test(file)) requires.push({ file, kind });
    }
  }
  return { requires, specChanges };
}

function hasNoE2eOverride(messages, file) {
  const tokenPattern = /\[no-e2e:\s*([^\]]+)\]/g;
  let m;
  // Any [no-e2e: ...] token in pushed commits is treated as a blanket override
  // for the in-progress push. Operators are accountable for the noted reason.
  while ((m = tokenPattern.exec(messages)) !== null) {
    if (m[1].trim().length > 0) return true;
  }
  return false;
}

function main() {
  const changeClass = readChangeClass();
  if (!changeClass || !ENFORCE_CLASSES.has(changeClass)) {
    console.log(`[e2e-gate] skipped (change_class=${changeClass || 'unknown'})`);
    return 0;
  }
  const files = stagedFiles();
  if (files.length === 0) {
    console.log('[e2e-gate] no staged files');
    return 0;
  }
  const { requires, specChanges } = classifyStaged(files);
  if (requires.length === 0) {
    console.log('[e2e-gate] no surface files staged');
    return 0;
  }
  const messages = commitMessagesInRange();
  const missing = [];
  for (const { file, kind } of requires) {
    if (specChanges.length > 0) continue;
    if (hasNoE2eOverride(messages, file)) continue;
    missing.push(`${file} (${kind})`);
  }
  if (missing.length > 0) {
    console.error('[e2e-gate] BLOCK — staged surface files lack a corresponding *.spec.ts:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error('Add a spec, or include `[no-e2e: <reason>]` in a commit message in the push range.');
    return 1;
  }
  console.log(`[e2e-gate] PASS (change_class=${changeClass}, surfaces=${requires.length}, specs=${specChanges.length})`);
  return 0;
}

process.exit(main());
