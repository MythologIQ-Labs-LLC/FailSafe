// Functional tests for IntentHistoryLog (FX288).
// Tempfile-backed; sink: real fs reads + chain verification logic.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IntentHistoryLog } from '../../governance/IntentHistoryLog';
import type { IntentHistoryEntry } from '../../governance/types/IntentTypes';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildEntry(overrides: Partial<IntentHistoryEntry> = {}): Omit<IntentHistoryEntry, 'previousHash' | 'entryHash'> {
  return {
    intentId: 'intent-test',
    timestamp: '2026-05-07T00:00:00Z',
    event: 'CREATED',
    actor: 'test-actor',
    ...overrides,
  } as Omit<IntentHistoryEntry, 'previousHash' | 'entryHash'>;
}

suite('IntentHistoryLog (FX288)', () => {
  let dir: string;

  setup(() => { dir = tmpDir('failsafe-history-'); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX288 constructor — creates empty intent_history.jsonl when missing', () => {
    new IntentHistoryLog(dir);
    const file = path.join(dir, 'intent_history.jsonl');
    assert.ok(fs.existsSync(file));
    assert.equal(fs.readFileSync(file, 'utf-8'), '');
  });

  test('FX288 loadAllEntries — empty log returns empty array', async () => {
    const log = new IntentHistoryLog(dir);
    const entries = await log.loadAllEntries();
    assert.deepEqual(entries, []);
  });

  test('FX288 appendEntry — first entry uses GENESIS_HASH as previousHash', async () => {
    const log = new IntentHistoryLog(dir);
    await log.appendEntry(buildEntry({ event: 'CREATED' }));
    const entries = await log.loadAllEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].previousHash, '0'.repeat(64), 'first entry previousHash should be GENESIS');
    assert.ok(entries[0].entryHash, 'entryHash should be populated');
    assert.equal(entries[0].entryHash!.length, 64);
  });

  test('FX288 appendEntry — second entry chains to first entry hash', async () => {
    const log = new IntentHistoryLog(dir);
    await log.appendEntry(buildEntry({ event: 'CREATED' }));
    await log.appendEntry(buildEntry({ event: 'STATUS_CHANGED' }));
    const entries = await log.loadAllEntries();
    assert.equal(entries.length, 2);
    assert.equal(entries[1].previousHash, entries[0].entryHash);
  });

  test('FX288 computeEntryHash — deterministic for same payload', () => {
    const log = new IntentHistoryLog(dir);
    const e = { ...buildEntry({ event: 'CREATED' }), previousHash: 'p' } as Omit<IntentHistoryEntry, 'entryHash'>;
    const h1 = log.computeEntryHash(e);
    const h2 = log.computeEntryHash(e);
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
  });

  test('FX288 computeEntryHash — different actor produces different hash', () => {
    const log = new IntentHistoryLog(dir);
    const baseEntry = { ...buildEntry({ event: 'CREATED' }), previousHash: 'p' } as Omit<IntentHistoryEntry, 'entryHash'>;
    const h1 = log.computeEntryHash(baseEntry);
    const h2 = log.computeEntryHash({ ...baseEntry, actor: 'different-actor' });
    assert.notEqual(h1, h2);
  });

  test('FX288 verifyChainIntegrity — empty log is valid', async () => {
    const log = new IntentHistoryLog(dir);
    const result = await log.verifyChainIntegrity();
    assert.equal(result.valid, true);
  });

  test('FX288 verifyChainIntegrity — single appended entry is valid', async () => {
    const log = new IntentHistoryLog(dir);
    await log.appendEntry(buildEntry({ event: 'CREATED' }));
    const result = await log.verifyChainIntegrity();
    assert.equal(result.valid, true);
  });

  test('FX288 verifyChainIntegrity — multi-entry chain is valid when intact', async () => {
    const log = new IntentHistoryLog(dir);
    await log.appendEntry(buildEntry({ event: 'CREATED' }));
    await log.appendEntry(buildEntry({ event: 'STATUS_CHANGED' }));
    await log.appendEntry(buildEntry({ event: 'SEALED' }));
    const result = await log.verifyChainIntegrity();
    assert.equal(result.valid, true);
  });

  test('FX288 verifyChainIntegrity — detects tampering when entry content is mutated', async () => {
    const log = new IntentHistoryLog(dir);
    await log.appendEntry(buildEntry({ event: 'CREATED' }));
    await log.appendEntry(buildEntry({ event: 'STATUS_CHANGED' }));

    // Mutate the second entry's actor field on disk (preserve hash to demonstrate mismatch)
    const file = path.join(dir, 'intent_history.jsonl');
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    const entry1 = JSON.parse(lines[1]);
    entry1.actor = 'TAMPERED';
    lines[1] = JSON.stringify(entry1);
    fs.writeFileSync(file, lines.join('\n') + '\n', 'utf-8');

    const result = await log.verifyChainIntegrity();
    assert.equal(result.valid, false);
    assert.equal(result.brokenAt, 1);
    assert.match(String(result.error), /Tamper detected/);
  });

  test('FX288 verifyChainIntegrity — detects broken hash chain (skipped link)', async () => {
    const log = new IntentHistoryLog(dir);
    await log.appendEntry(buildEntry({ event: 'CREATED' }));
    await log.appendEntry(buildEntry({ event: 'STATUS_CHANGED' }));

    // Mutate the second entry's previousHash to point at a fake hash
    const file = path.join(dir, 'intent_history.jsonl');
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    const entry1 = JSON.parse(lines[1]);
    entry1.previousHash = 'a'.repeat(64);
    lines[1] = JSON.stringify(entry1);
    fs.writeFileSync(file, lines.join('\n') + '\n', 'utf-8');

    const result = await log.verifyChainIntegrity();
    assert.equal(result.valid, false);
    assert.equal(result.brokenAt, 1);
    assert.match(String(result.error), /Chain broken/);
  });

  test('FX288 loadAllEntries — handles empty/whitespace lines gracefully', async () => {
    const file = path.join(dir, 'intent_history.jsonl');
    fs.writeFileSync(file, '', 'utf-8');
    const log = new IntentHistoryLog(dir);
    await log.appendEntry(buildEntry({ event: 'CREATED' }));
    // Append blank line manually
    fs.appendFileSync(file, '   \n\n', 'utf-8');
    const entries = await log.loadAllEntries();
    assert.equal(entries.length, 1, 'blank lines should be filtered out');
  });
});
