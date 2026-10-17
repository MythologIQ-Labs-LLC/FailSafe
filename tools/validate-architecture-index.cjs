#!/usr/bin/env node
/**
 * Architecture index structural preflight (#530).
 * Usage: node tools/validate-architecture-index.cjs [repo-root]
 * Scope: explicit index links and unique active canonical targets, not semantic
 * duplicate detection or Qor ledger verification.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function validate(root) {
  const indexPath = path.join(root, 'docs', 'ARCHITECTURE_INDEX.md');
  const errors = [];
  if (!fs.existsSync(indexPath)) return ['Missing docs/ARCHITECTURE_INDEX.md'];
  const src = fs.readFileSync(indexPath, 'utf8');
  const url = /\[([^\]]+)\]\(([^)]+)\)/g;
  const found = new Set();
  for (const m of src.matchAll(url)) {
    const href = m[2].split('#')[0];
    if (!href || /^(?:https?:|mailto:)/i.test(href)) continue;
    if (path.isAbsolute(href) || href.includes('\\')) {
      errors.push('Unsafe index path: ' + href);
      continue;
    }
    const target = path.resolve(path.dirname(indexPath), decodeURIComponent(href));
    if (!target.startsWith(path.resolve(root) + path.sep)) {
      errors.push('Escaping index path: ' + href);
      continue;
    }
    if (!fs.existsSync(target)) errors.push('Broken index link: ' + href);
    found.add(target);
  }
  if (!src.includes('GOVERNANCE_INDEX.md')) errors.push('Missing Qor governance authority link');
  if (!src.includes('ARCHITECTURE_PLAN.md')) errors.push('Missing runtime design authority link');
  if (!src.includes('INTEGRATION_DOCS_INDEX.md')) errors.push('Missing external integration contract link');
  if (!found.has(path.join(root, 'docs', 'GOVERNANCE_INDEX.md'))) errors.push('Governance authority must be a working local link');
  return errors;
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  const problems = validate(root);
  if (problems.length) {
    for (const p of problems) console.error('[architecture-index] ' + p);
    process.exitCode = 1;
  } else console.log('[architecture-index] local links and required authority pointers verified');
}
module.exports = { validate };
