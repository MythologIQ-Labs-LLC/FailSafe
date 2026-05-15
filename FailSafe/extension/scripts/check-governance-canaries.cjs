#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HIDDEN_HTML_RE = /<(?:script|iframe|object|embed|link)\b/i;
const DEFAULT_FILES = ['docs/ARCHITECTURE_PLAN.md', 'docs/META_LEDGER.md', 'docs/CONCEPT.md'];

function parseArgs(argv) {
  const out = { repoRoot: null, includeRemediation: false, plansOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo-root') out.repoRoot = argv[++i];
    else if (argv[i] === '--include-remediation-plan') out.includeRemediation = true;
    else if (argv[i] === '--plans-only') out.plansOnly = true;
    else { process.stderr.write(`check-governance-canaries: unknown arg: ${argv[i]}\n`); process.exit(2); }
  }
  if (!out.repoRoot) {
    process.stderr.write('usage: check-governance-canaries --repo-root <path> [--include-remediation-plan] [--plans-only]\n');
    process.exit(2);
  }
  return out;
}

function buildFileList(args) {
  if (args.plansOnly) return [
    'docs/plan-qor-phase57-b194-governance-mode-escalation.md',
    'docs/plan-qor-phase58-b199-command-center-coverage.md',
  ];
  const files = [...DEFAULT_FILES];
  if (args.includeRemediation) files.push('docs/plan-qor-phase56-audit-canary-remediation.md');
  return files;
}

function scanFile(absPath, content) {
  const hits = [];
  let inFence = false;
  const text = content !== undefined ? content : fs.readFileSync(absPath, 'utf-8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (/^ {4,}/.test(line)) continue;
    if (HIDDEN_HTML_RE.test(line)) hits.push({ file: absPath, line: i + 1, text: line });
  }
  return hits;
}

function main(argv) {
  const args = parseArgs(argv);
  const files = buildFileList(args);
  const allHits = [];
  for (const rel of files) {
    const full = path.resolve(args.repoRoot, rel);
    if (!fs.existsSync(full)) {
      process.stderr.write(`check-governance-canaries: file not found: ${rel}\n`);
      process.exit(2);
    }
    allHits.push(...scanFile(full));
  }
  if (allHits.length === 0) {
    process.stdout.write(`governance-canaries: OK — ${files.length} files scanned, 0 canary hits.\n`);
    return 0;
  }
  for (const h of allHits) {
    const rel = path.relative(args.repoRoot, h.file);
    process.stderr.write(`governance-canaries: HIT — ${rel}:${h.line}: ${h.text}\n`);
  }
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { parseArgs, buildFileList, scanFile, HIDDEN_HTML_RE };
