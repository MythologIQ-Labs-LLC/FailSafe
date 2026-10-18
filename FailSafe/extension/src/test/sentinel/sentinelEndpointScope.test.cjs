/**
 * #538 lane A (B273, plan-538a LD3, LD14): the Sentinel LLM endpoint is a
 * user-scope setting, the forget-approvals command is contributed, and the
 * manifest stays in the form `npm run release:bump` writes, so the next bump
 * cannot reflow it and move the lines the integration contracts cite.
 *
 * Runs standalone: node --test src/test/sentinel/sentinelEndpointScope.test.cjs
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const EXT = path.resolve(__dirname, '..', '..', '..');
const read = () => fs.readFileSync(path.join(EXT, 'package.json'), 'utf8');

test('failsafe.sentinel.ollamaEndpoint declares machine scope', () => {
  const pkg = JSON.parse(read());
  const props = Object.assign({}, ...[].concat(pkg.contributes.configuration).map((c) => c.properties || {}));
  const s = props['failsafe.sentinel.ollamaEndpoint'];
  assert.ok(s, 'the setting exists');
  assert.equal(s.scope, 'machine');
});

test('the manifest contributes FailSafe: Forget Sentinel LLM Approvals', () => {
  const pkg = JSON.parse(read());
  const entry = pkg.contributes.commands.find((c) => c.command === 'failsafe.sentinel.forgetLlmApprovals');
  assert.ok(entry, 'failsafe.sentinel.forgetLlmApprovals is contributed');
  assert.equal(entry.title, 'FailSafe: Forget Sentinel LLM Approvals');
});

test('M1: the manifest is exactly what release:bump writes (JSON.stringify(pkg, null, 2) + newline)', () => {
  const text = read().replace(/\r\n/g, '\n');
  assert.equal(JSON.stringify(JSON.parse(text), null, 2) + '\n', text);
});
