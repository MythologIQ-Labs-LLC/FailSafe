// #476: parsing the last SESSION SEAL entry of docs/META_LEDGER.md.

import { strict as assert } from 'assert';
import { hasEntryHeader, lastSessionSeal } from '../../../integrations/shield-receipts/ledger-seal';
import { BASE_LEDGER, SEAL_HASH, SESSION, sealBlock } from './fixtures';

const LEDGER = BASE_LEDGER + sealBlock(644);

suite('ledger-seal (#476)', () => {
  test('the #644 header and label shapes parse, in LF and CRLF', () => {
    const want = { entry: 644, sessionId: SESSION, chainHash: SEAL_HASH };
    assert.deepEqual(lastSessionSeal(LEDGER), want);
    assert.deepEqual(lastSessionSeal(LEDGER.replace(/\n/g, '\r\n')), want);
  });

  test('the LAST seal wins, and later non-seal entries do not end it early', () => {
    const text = LEDGER + sealBlock(650, 'later-session', 'e'.repeat(64)) + '### Entry #651: GATE TRIBUNAL - x\n\n**Session**: `x`\n';
    assert.deepEqual(lastSessionSeal(text), { entry: 650, sessionId: 'later-session', chainHash: 'e'.repeat(64) });
  });

  test('an em-dash title still parses as a SESSION SEAL header', () => {
    const text = BASE_LEDGER + sealBlock(609).replace('SESSION SEAL - plan', 'SESSION SEAL — plan');
    assert.equal((lastSessionSeal(text) as { entry: number }).entry, 609);
  });

  test('a last seal without the Chain Hash label is unparseable', () => {
    const text = BASE_LEDGER + sealBlock(644).replace(/\*\*Chain Hash \(Merkle seal\)\*\*.*\n/, '');
    assert.equal(lastSessionSeal(text), 'unparseable');
  });

  test('two Session lines or two Chain Hash lines in the block is unparseable', () => {
    const twoSessions = BASE_LEDGER + sealBlock(644).replace('**Content Hash**', `**Session**: \`${SESSION}\`\n**Content Hash**`);
    const twoChains = BASE_LEDGER + sealBlock(644).replace('**Decision**', `**Chain Hash (Merkle seal)**: \`${SEAL_HASH}\`\n**Decision**`);
    assert.equal(lastSessionSeal(twoSessions), 'unparseable');
    assert.equal(lastSessionSeal(twoChains), 'unparseable');
  });

  test('a loose Session label beside the strict one is unparseable', () => {
    const text = BASE_LEDGER + sealBlock(644).replace('**Content Hash**', '**Session**: 2026-x\n**Content Hash**');
    assert.equal(lastSessionSeal(text), 'unparseable');
  });

  test('an uppercase chain hash is unparseable', () => {
    assert.equal(lastSessionSeal(BASE_LEDGER + sealBlock(644, SESSION, SEAL_HASH.toUpperCase())), 'unparseable');
  });

  test('a zero-padded entry number is never read as that entry', () => {
    const padded = BASE_LEDGER + sealBlock(644).replace('### Entry #644:', '### Entry #0644:');
    assert.equal(lastSessionSeal(padded), null);
    assert.equal(hasEntryHeader('### Entry #0644: SESSION SEAL - x\n', 644), true, 'a padded header in the parent still counts as present');
    assert.equal(hasEntryHeader('### Entry #00644: x\n', 644), true);
  });

  test('a ledger with no SESSION SEAL returns null', () => {
    assert.equal(lastSessionSeal(BASE_LEDGER), null);
    assert.equal(lastSessionSeal(''), null);
  });

  test('hasEntryHeader matches the exact entry number only', () => {
    assert.equal(hasEntryHeader(LEDGER, 644), true);
    assert.equal(hasEntryHeader(LEDGER.replace(/\n/g, '\r\n'), 644), true);
    assert.equal(hasEntryHeader('### Entry #6440: SESSION SEAL - x\n', 644), false);
    assert.equal(hasEntryHeader('### Entry #64: SESSION SEAL - x\n', 644), false);
    assert.equal(hasEntryHeader('text ### Entry #644: inline\n', 644), false);
  });
});
