// #532 B320 (audit should-fix 11): one writer for delivery reviews.
//
// Only governance/delivery/deliveryReview.ts may name the delivery-review DID, and only it may name
// the DELIVERY_REVIEWED event type in code that appends to the ledger. The type declaration and
// the read-only evidence filter may name the event type; nothing else in production source may.
// The scan is exercised against planted text first, so a scan that matches nothing cannot pass.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..', '..');
const WRITER = 'governance/delivery/deliveryReview.ts';
const EVENT_ALLOWED = new Set([WRITER, 'shared/types/ledger.ts', 'governance/delivery/deliveryEvidence.ts']);
const DID = 'did:myth:failsafe:delivery-review';

function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(SRC, abs).split(path.sep).join('/');
    if (e.isDirectory()) { if (rel !== 'test' && e.name !== 'node_modules') sources(abs, out); continue; }
    if (/\.(ts|js|cjs|mjs)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(rel);
  }
  return out;
}

/** Problems for one file's text: the DID outside the writer, the event type outside the allowlist, an append of it outside the writer. */
function problems(rel, text) {
  const out = [];
  if (text.includes(DID) && rel !== WRITER) out.push(`${rel} names ${DID}`);
  if (/DELIVERY_REVIEWED/.test(text) && !EVENT_ALLOWED.has(rel)) out.push(`${rel} names DELIVERY_REVIEWED`);
  if (/appendEntry\s*\(/.test(text) && /DELIVERY_REVIEWED|REVIEW_EVENT_TYPE/.test(text) && rel !== WRITER) out.push(`${rel} appends near DELIVERY_REVIEWED`);
  return out;
}

test('the scan flags planted writers (falsifier)', () => {
  assert.deepEqual(problems('extension/rogue.ts', `ledger.appendEntry({ eventType: 'DELIVERY_REVIEWED', agentDid: '${DID}' })`),
    ['extension/rogue.ts names did:myth:failsafe:delivery-review', 'extension/rogue.ts names DELIVERY_REVIEWED', 'extension/rogue.ts appends near DELIVERY_REVIEWED']);
  assert.deepEqual(problems('governance/delivery/deliveryEvidence.ts', "x.appendEntry({ eventType: REVIEW_EVENT_TYPE })"),
    ['governance/delivery/deliveryEvidence.ts appends near DELIVERY_REVIEWED']);
  assert.deepEqual(problems(WRITER, `appendEntry({ eventType: 'DELIVERY_REVIEWED', agentDid: '${DID}' })`), []);
});

test('only deliveryReview.ts writes DELIVERY_REVIEWED or the delivery-review DID', () => {
  const files = sources(SRC);
  assert.ok(files.length > 500, `scanned ${files.length} production files`);
  assert.ok(files.includes(WRITER), 'the writer is in the scanned set');
  const found = files.flatMap((rel) => problems(rel, fs.readFileSync(path.join(SRC, rel), 'utf8')));
  assert.deepEqual(found, []);
  const writer = fs.readFileSync(path.join(SRC, WRITER), 'utf8');
  assert.ok(writer.includes(DID) && /eventType: 'DELIVERY_REVIEWED'/.test(writer), 'the writer does write it');
});
