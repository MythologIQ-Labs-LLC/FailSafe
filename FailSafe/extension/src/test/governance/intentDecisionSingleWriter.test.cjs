// B340 (plan-b340-enforce-approval LD2, LD4, audit should-fix S7): one writer for intent decisions.
//
// Only governance/intentDecision.ts may name the intent-decision DID, write the INTENT_DECIDED event,
// or call IntentService.recordDecision / sealIntent; the event-type declaration may name the type.
// No production file constructs an EnforcementEngine except the factory
// (governance/enforcedIntentProvider.ts) and the ACP proxy backing (B373). The scan is exercised
// against planted text first, so a scan that matches nothing cannot pass.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..');
const WRITER = 'governance/intentDecision.ts';
const EVENT_ALLOWED = new Set([WRITER, 'shared/types/ledger.ts']);
const ENGINE_ALLOWED = new Set(['governance/enforcedIntentProvider.ts', 'integrations/acp/proxy/backing/createWorkspaceAcpBacking.ts']);
const DID = 'did:myth:failsafe:intent-decision';

function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(SRC, abs).split(path.sep).join('/');
    if (e.isDirectory()) { if (rel !== 'test' && e.name !== 'node_modules') sources(abs, out); continue; }
    if (/\.(ts|js|cjs|mjs)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(rel);
  }
  return out;
}

function problems(rel, text) {
  const out = [];
  if (text.includes(DID) && rel !== WRITER) out.push(`${rel} names ${DID}`);
  if (/INTENT_DECIDED/.test(text) && !EVENT_ALLOWED.has(rel)) out.push(`${rel} names INTENT_DECIDED`);
  if (/\.recordDecision\s*\(/.test(text) && rel !== WRITER) out.push(`${rel} calls recordDecision`);
  if (/\.sealIntent\s*\(/.test(text) && rel !== WRITER) out.push(`${rel} calls sealIntent`);
  if (/new\s+EnforcementEngine\s*\(/.test(text) && !ENGINE_ALLOWED.has(rel)) out.push(`${rel} constructs EnforcementEngine`);
  return out;
}

test('the scan flags planted writers (falsifier)', () => {
  assert.deepEqual(
    problems('extension/rogue.ts', `l.appendEntry({ eventType: 'INTENT_DECIDED', agentDid: '${DID}' }); svc.recordDecision({}); svc.sealIntent('x'); new EnforcementEngine(svc)`),
    ['extension/rogue.ts names did:myth:failsafe:intent-decision', 'extension/rogue.ts names INTENT_DECIDED', 'extension/rogue.ts calls recordDecision',
      'extension/rogue.ts calls sealIntent', 'extension/rogue.ts constructs EnforcementEngine']);
  assert.deepEqual(problems('extension/bootstrapGovernance.ts', 'const e = new EnforcementEngine(intentService, root)'),
    ['extension/bootstrapGovernance.ts constructs EnforcementEngine']);
  assert.deepEqual(problems(WRITER, `appendEntry({ eventType: INTENT_DECIDED, agentDid: '${DID}' }); intents.recordDecision({}); intents.sealIntent('user')`), []);
  assert.deepEqual(problems('governance/enforcedIntentProvider.ts', 'return new EnforcementEngine(p, root)'), []);
});

test('only intentDecision.ts writes INTENT_DECIDED, records decisions or seals; only the factory and the ACP backing build an engine', () => {
  const files = sources(SRC);
  assert.ok(files.length > 500, `scanned ${files.length} production files`);
  assert.ok(files.includes(WRITER), 'the writer is in the scanned set');
  assert.ok(files.includes('governance/enforcedIntentProvider.ts'), 'the factory is in the scanned set');
  const found = files.flatMap((rel) => problems(rel, fs.readFileSync(path.join(SRC, rel), 'utf8')));
  assert.deepEqual(found, []);
  const writer = fs.readFileSync(path.join(SRC, WRITER), 'utf8');
  assert.ok(writer.includes(DID) && /eventType: INTENT_DECIDED/.test(writer), 'the writer does write it');
  const factory = fs.readFileSync(path.join(SRC, 'governance/enforcedIntentProvider.ts'), 'utf8');
  assert.ok(/new EnforcementEngine\(\s*enforcedIntentProvider\(/.test(factory), 'the factory builds the engine over the enforced provider');
});
