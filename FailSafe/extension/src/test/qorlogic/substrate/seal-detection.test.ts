import { strict as assert } from 'assert';
import { latestSealMarker, SealWatchState } from '../../../qorlogic/substrate/seal-detection';

/**
 * B-SUBSTRATE-3 — seal-detection (pure). Deterministic: no fs/watcher/clock.
 */

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);

function sealEntry(n: number, chainHash: string | null, type = 'SESSION SEAL'): string {
  const hashLine = chainHash ? `**Chain Hash**: \`${chainHash}\`\n` : '';
  return `### Entry #${n}: ${type} — some plan\n\nbody text\n${hashLine}\n`;
}

suite('seal-detection (B-SUBSTRATE-3)', () => {
  test('latestSealMarker: no entries → null', () => {
    assert.equal(latestSealMarker('# Ledger\n\nno entries here'), null);
  });

  test('latestSealMarker: entries present but none are SESSION SEAL → null', () => {
    const ledger = `${sealEntry(1, H1, 'PLAN')}${sealEntry(2, H2, 'DELIVER')}`;
    assert.equal(latestSealMarker(ledger), null);
  });

  test('latestSealMarker: single SESSION SEAL → its chain hash', () => {
    assert.equal(latestSealMarker(sealEntry(5, H1)), H1);
  });

  test('latestSealMarker: multiple seals → the LAST seal chain hash', () => {
    const ledger = `${sealEntry(5, H1)}${sealEntry(6, H2)}`;
    assert.equal(latestSealMarker(ledger), H2);
  });

  test('latestSealMarker: last seal then a later DELIVER → still the seal hash', () => {
    const ledger = `${sealEntry(6, H2)}${sealEntry(7, H1, 'DELIVER')}`;
    assert.equal(latestSealMarker(ledger), H2);
  });

  test('latestSealMarker: SESSION SEAL without chain hash → entry-N fallback', () => {
    assert.equal(latestSealMarker(sealEntry(9, null)), 'entry-9');
  });

  test('latestSealMarker: a DELIVER entry that MENTIONS "SESSION SEAL" in body does not count', () => {
    const deliver =
      '### Entry #8: DELIVER — release\n\n**Predecessor**: Entry #7 (SESSION SEAL — prior)\n**Chain Hash**: `' +
      H1 +
      '`\n\n';
    assert.equal(latestSealMarker(deliver), null);
  });

  test('SealWatchState: pre-existing seal does NOT fire on the same ledger', () => {
    const ledger = sealEntry(10, H1);
    const state = new SealWatchState(ledger);
    assert.equal(state.marker, H1);
    assert.equal(state.shouldFire(ledger), false);
  });

  test('SealWatchState: a newly-appended seal fires once, then not again', () => {
    const before = sealEntry(10, H1);
    const after = `${before}${sealEntry(11, H2)}`;
    const state = new SealWatchState(before);
    assert.equal(state.shouldFire(after), true);
    assert.equal(state.shouldFire(after), false); // same seal → no re-fire
  });

  test('SealWatchState: a non-seal ledger edit does not fire', () => {
    const before = sealEntry(10, H1);
    const edited = `${before}\n<!-- a non-seal note was appended -->\n`;
    const state = new SealWatchState(before);
    assert.equal(state.shouldFire(edited), false);
  });

  test('SealWatchState: starting with no seal, the first seal fires', () => {
    const state = new SealWatchState('# Ledger\n\nno seals yet');
    assert.equal(state.marker, null);
    assert.equal(state.shouldFire(sealEntry(1, H1)), true);
  });
});
