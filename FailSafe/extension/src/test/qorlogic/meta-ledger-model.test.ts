// Per-feature tests for the canonical META_LEDGER entry parser (#197 Slice 1).
// Pure string -> model; this is the single parser the tracker projection and the
// seal-detector both consume after the extraction.

import { strict as assert } from 'assert';
import { parseMetaLedgerEntries } from '../../qorlogic/meta-ledger-model';

const ENTRY = [
  '### Entry #449: DELIVER - v5.7.0 (Shadow Genome + theme)',
  '',
  '**Date**: 2026-06-10',
  '**Phase**: DELIVER (/qor-repo-release)',
  '**Version**: 5.7.0',
  '**Tag**: v5.7.0',
  '',
  '## Decision',
  '',
  'Delivered v5.7.0 to both marketplaces.',
  '',
  '## Content Hash',
  '',
  '**Chain Hash**: `36d9edcf36d1f858c5837613761639501958174eaa1dcf9e28984f9d9070db1e`',
].join('\n');

const SEAL = [
  '### Entry #448: SESSION SEAL — Monitor theme (FX881)',
  '',
  '**Phase**: SUBSTANTIATE',
  '',
  '## Decision',
  '',
  'Sealed FX881.',
  '',
  '**Chain Hash**: `ec2f38551ad7b2d0c428239f3f61cb73427e1a6d5dfd2e65f24de9b4c895e9ca`',
].join('\n');

suite('parseMetaLedgerEntries (#197)', () => {
  test('parses entry number + header title', () => {
    const [e] = parseMetaLedgerEntries(ENTRY);
    assert.equal(e.n, 449);
    assert.equal(e.title, 'DELIVER - v5.7.0 (Shadow Genome + theme)');
  });

  test('extracts phase first token, version, tag, date', () => {
    const [e] = parseMetaLedgerEntries(ENTRY);
    assert.equal(e.phase, 'DELIVER');
    assert.equal(e.version, '5.7.0');
    assert.equal(e.tag, 'v5.7.0');
    assert.equal(e.date, '2026-06-10');
  });

  test('extracts the first Decision paragraph (capped)', () => {
    const [e] = parseMetaLedgerEntries(ENTRY);
    assert.equal(e.decision, 'Delivered v5.7.0 to both marketplaces.');
    assert.ok((e.decision?.length ?? 0) <= 300);
  });

  test('extracts chainHash; absent => undefined', () => {
    const [e] = parseMetaLedgerEntries(ENTRY);
    assert.equal(e.chainHash, '36d9edcf36d1f858c5837613761639501958174eaa1dcf9e28984f9d9070db1e');
    const [noChain] = parseMetaLedgerEntries('### Entry #1: X\n\n**Phase**: PLAN\n');
    assert.equal(noChain.chainHash, undefined);
  });

  test('SESSION SEAL title is detectable (seal-detector contract)', () => {
    const entries = parseMetaLedgerEntries(SEAL);
    const seals = entries.filter((e) => /SESSION SEAL/i.test(e.title));
    assert.equal(seals.length, 1);
    assert.equal(seals[0].chainHash, 'ec2f38551ad7b2d0c428239f3f61cb73427e1a6d5dfd2e65f24de9b4c895e9ca');
  });

  test('multiple entries parsed in document order', () => {
    const entries = parseMetaLedgerEntries(`${SEAL}\n\n${ENTRY}`);
    assert.deepEqual(entries.map((e) => e.n), [448, 449]);
  });

  test('degrade-safe: empty / garbage in => []', () => {
    assert.deepEqual(parseMetaLedgerEntries(''), []);
    assert.deepEqual(parseMetaLedgerEntries('no entries here'), []);
  });
});
