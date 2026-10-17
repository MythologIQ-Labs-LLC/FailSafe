'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validate } = require('./validate-architecture-index.cjs');

function fixture(index) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-arch-index-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  for (const file of ['GOVERNANCE_INDEX.md','ARCHITECTURE_PLAN.md','integrations/INTEGRATION_DOCS_INDEX.md']) {
    const name = path.join(root, 'docs', file);
    fs.mkdirSync(path.dirname(name), { recursive: true });
    fs.writeFileSync(name, '# Existing authority\n');
  }
  fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'), index);
  return root;
}
const valid = '# Index\n[Governance](GOVERNANCE_INDEX.md)\n[Runtime](ARCHITECTURE_PLAN.md)\n[External APIs](integrations/INTEGRATION_DOCS_INDEX.md)\n';

test('existing authorities and local links pass', t => {
  const root = fixture(valid);
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  assert.deepEqual(validate(root), []);
});
test('missing architecture document is rejected', t => {
  const root = fixture(valid + '[Duplicate](MISSING.md)\n');
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  assert.ok(validate(root).some(s => s.includes('Broken index link')));
});
test('escaping repo path is rejected', t => {
  const root = fixture(valid + '[Outside](../../elsewhere.md)\n');
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  assert.ok(validate(root).some(s => s.includes('Escaping index path')));
});
test('required governance authority cannot be silently dropped', t => {
  const root = fixture(valid.replace('[Governance](GOVERNANCE_INDEX.md)\n', ''));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  assert.ok(validate(root).some(s => s.includes('Missing Qor governance')));
});
