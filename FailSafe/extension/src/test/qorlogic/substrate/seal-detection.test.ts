import { strict as assert } from 'assert';
import { latestSealMarker, SealWatchState } from '../../../qorlogic/substrate/seal-detection';
import type { MetaLedgerEntry } from '../../../qorlogic/meta-ledger-model';

/**
 * B-SUBSTRATE-3 — seal-detection (pure). Deterministic: no fs/watcher/clock.
 *
 * Operates on already-parsed `MetaLedgerEntry[]` (#233 consumer-adapter
 * migration) rather than raw ledger markdown — the header-vs-body title
 * extraction this module used to rely on is the canonical parser's job and is
 * covered by meta-ledger-model.test.ts ("SESSION SEAL title is detectable
 * (seal-detector contract)").
 */

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);

function sealEntry(n: number, chainHash: string | null, title = 'SESSION SEAL — some plan'): MetaLedgerEntry {
  return { n, title, phase: 'SUBSTANTIATE', chainHash: chainHash ?? undefined };
}

suite('seal-detection (B-SUBSTRATE-3)', () => {
  test('latestSealMarker: no entries → null', () => {
    assert.equal(latestSealMarker([]), null);
  });

  test('latestSealMarker: entries present but none are SESSION SEAL → null', () => {
    const entries = [sealEntry(1, H1, 'PLAN — some plan'), sealEntry(2, H2, 'DELIVER — some plan')];
    assert.equal(latestSealMarker(entries), null);
  });

  test('latestSealMarker: single SESSION SEAL → its chain hash', () => {
    assert.equal(latestSealMarker([sealEntry(5, H1)]), H1);
  });

  test('latestSealMarker: multiple seals → the LAST seal chain hash', () => {
    const entries = [sealEntry(5, H1), sealEntry(6, H2)];
    assert.equal(latestSealMarker(entries), H2);
  });

  test('latestSealMarker: last seal then a later DELIVER → still the seal hash', () => {
    const entries = [sealEntry(6, H2), sealEntry(7, H1, 'DELIVER — some plan')];
    assert.equal(latestSealMarker(entries), H2);
  });

  test('latestSealMarker: SESSION SEAL without chain hash → entry-N fallback', () => {
    assert.equal(latestSealMarker([sealEntry(9, null)]), 'entry-9');
  });

  test('latestSealMarker: a DELIVER entry that MENTIONS "SESSION SEAL" in its body does not count '
    + '(title is header-only per the canonical parser)', () => {
    const entries = [{ n: 8, title: 'DELIVER — release', phase: 'DELIVER', chainHash: H1 }];
    assert.equal(latestSealMarker(entries), null);
  });

  test('SealWatchState: pre-existing seal does NOT fire on the same ledger', () => {
    const entries = [sealEntry(10, H1)];
    const state = new SealWatchState(entries);
    assert.equal(state.marker, H1);
    assert.equal(state.shouldFire(entries), false);
  });

  test('SealWatchState: a newly-appended seal fires once, then not again', () => {
    const before = [sealEntry(10, H1)];
    const after = [...before, sealEntry(11, H2)];
    const state = new SealWatchState(before);
    assert.equal(state.shouldFire(after), true);
    assert.equal(state.shouldFire(after), false); // same seal → no re-fire
  });

  test('SealWatchState: a non-seal ledger edit does not fire', () => {
    const before = [sealEntry(10, H1)];
    const edited = [...before, sealEntry(11, null, 'NOTE — non-seal entry')];
    const state = new SealWatchState(before);
    assert.equal(state.shouldFire(edited), false);
  });

  test('SealWatchState: starting with no seal, the first seal fires', () => {
    const state = new SealWatchState([]);
    assert.equal(state.marker, null);
    assert.equal(state.shouldFire([sealEntry(1, H1)]), true);
  });
});
