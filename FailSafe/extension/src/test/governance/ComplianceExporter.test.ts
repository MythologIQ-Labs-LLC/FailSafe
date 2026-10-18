// Functional tests for ComplianceExporter (FX308).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { ComplianceExporter } from '../../governance/ComplianceExporter';
import { GOLDEN, appendN, makeEnv, openLedger, writeGoldenLedger } from '../qorelogic/ledgerTestKit';

/** A fully sealed, anchored, bound verification report (#473 shape). */
function intactReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true, sealScope: 'full', rows: 1,
    coverage: { v1Rows: 0, v2Rows: 0, v3Rows: 1, frozenLegacyRows: 0, unfrozenLegacyRows: 0 },
    anchor: { status: 'verified', workspaceBound: true, headId: 1, unanchoredTail: 0, establishedAt: 't', establishedAtId: 1 },
    rotation: null, failures: [],
    ...overrides,
  };
}
const intactLedger = (entries: unknown[]) => ({
  getRecentEntries: async () => entries,
  isAvailable: () => true,
  verifyLedger: async () => intactReport(),
});

function makeStubs() {
  const ledger: any = intactLedger([{ id: 1, eventType: 'TEST' }]);
  const shadow: any = {
    analyzeFailurePatterns: async () => ({ patterns: ['p1'] }),
    getUnresolvedEntries: async () => [{ id: 'u1', severity: 2 }],
  };
  return { ledger, shadow };
}

suite('ComplianceExporter (FX308)', () => {
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-')); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX308 exportBundle — writes gzipped json file with framework-prefixed name', async () => {
    const { ledger, shadow } = makeStubs();
    const e = new ComplianceExporter(ledger, shadow);
    const out = await e.exportBundle('SOC2', dir);
    assert.ok(fs.existsSync(out));
    assert.match(path.basename(out), /^compliance-SOC2-[0-9a-f]{12}\.json\.gz$/);
  });

  test('FX308 exportBundle — gzip content decompresses to valid JSON with all sections', async () => {
    const { ledger, shadow } = makeStubs();
    const e = new ComplianceExporter(ledger, shadow);
    const out = await e.exportBundle('SOC2', dir);
    const buf = zlib.gunzipSync(fs.readFileSync(out));
    const bundle = JSON.parse(buf.toString('utf-8'));
    assert.equal(bundle.framework, 'SOC2');
    assert.ok(bundle.exportedAt);
    assert.ok(Array.isArray(bundle.ledger));
    assert.deepEqual(bundle.shadowGenome, { patterns: ['p1'] });
    assert.deepEqual(bundle.unresolvedFailures, [{ id: 'u1', severity: 2 }]);
    assert.equal(bundle.ledgerIntegrity.status, 'intact');
    assert.equal('chainVerification' in bundle, false, 'the boolean chainVerification is gone (#538)');
    assert.equal(bundle.controlMapping.framework, 'SOC2');
  });

  test('FX308 controlMapping — SOC2 maps to CC6.1 and CC7.2', async () => {
    const { ledger, shadow } = makeStubs();
    const e = new ComplianceExporter(ledger, shadow);
    const out = await e.exportBundle('SOC2', dir);
    const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(out)).toString('utf-8'));
    const ids = bundle.controlMapping.controls.map((c: any) => c.id);
    assert.deepEqual(ids, ['CC6.1', 'CC7.2']);
  });

  test('FX308 controlMapping — ISO27001 maps to A.12.4 and A.14.2', async () => {
    const { ledger, shadow } = makeStubs();
    const e = new ComplianceExporter(ledger, shadow);
    const out = await e.exportBundle('ISO27001', dir);
    const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(out)).toString('utf-8'));
    const ids = bundle.controlMapping.controls.map((c: any) => c.id);
    assert.deepEqual(ids, ['A.12.4', 'A.14.2']);
  });

  test('FX308 controlMapping — EU_AI_ACT maps to Art.12 and Art.14', async () => {
    const { ledger, shadow } = makeStubs();
    const e = new ComplianceExporter(ledger, shadow);
    const out = await e.exportBundle('EU_AI_ACT', dir);
    const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(out)).toString('utf-8'));
    const ids = bundle.controlMapping.controls.map((c: any) => c.id);
    assert.deepEqual(ids, ['Art.12', 'Art.14']);
  });

  test('FX308 exportBundle — filename hash incorporates exportedAt timestamp', async () => {
    const { ledger, shadow } = makeStubs();
    const e = new ComplianceExporter(ledger, shadow);
    const out1 = await e.exportBundle('SOC2', dir);
    await new Promise(r => setTimeout(r, 5));
    const out2 = await e.exportBundle('SOC2', dir);
    // Different timestamps (5ms apart) → different hashes; filename pattern stable
    assert.notEqual(path.basename(out1), path.basename(out2));
    assert.match(path.basename(out1), /^compliance-SOC2-[0-9a-f]{12}\.json\.gz$/);
  });

  test('FX308 setLedgerManager / setShadowGenomeManager — late wiring works', async () => {
    const { ledger, shadow } = makeStubs();
    const e = new ComplianceExporter(null as any, null as any);
    e.setLedgerManager(ledger);
    e.setShadowGenomeManager(shadow);
    const out = await e.exportBundle('SOC2', dir);
    assert.ok(fs.existsSync(out));
  });

  // #244 Tranche D: a bundle meant for a third-party auditor must not carry
  // secrets/PII pasted into free-text ledger/Shadow Genome fields verbatim.
  suite('#244 Tranche D — secret/PII redaction', () => {
    test('a hardcoded API key in a ledger entry payload is redacted', async () => {
      const ledger: any = intactLedger([{
        id: 1,
        eventType: 'DECISION',
        payload: { decision: 'approved', rationale: 'found apikey: "sk1234567890abcdefghijklmnop" in .env, flagging' },
        entryHash: 'a'.repeat(64),
        prevHash: 'b'.repeat(64),
        signature: 'c'.repeat(64),
      }]);
      const shadow: any = { analyzeFailurePatterns: async () => [], getUnresolvedEntries: async () => [] };
      const e = new ComplianceExporter(ledger, shadow);
      const out = await e.exportBundle('SOC2', dir);
      const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(out)).toString('utf-8'));

      const rationale = bundle.ledger[0].payload.rationale as string;
      assert.ok(!rationale.includes('sk1234567890abcdefghijklmnop'), 'raw key must not appear in the exported bundle');
      assert.ok(rationale.includes('[REDACTED]'), 'redaction marker must be present');
    });

    test('a hardcoded password in a Shadow Genome remediation note is redacted', async () => {
      const ledger: any = intactLedger([]);
      const shadow: any = {
        analyzeFailurePatterns: async () => [],
        getUnresolvedEntries: async () => [{
          id: 'u1',
          decisionRationale: 'retry failed; password: "hunter2plaintext" was logged by the agent',
        }],
      };
      const e = new ComplianceExporter(ledger, shadow);
      const out = await e.exportBundle('SOC2', dir);
      const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(out)).toString('utf-8'));

      const note = bundle.unresolvedFailures[0].decisionRationale as string;
      assert.ok(!note.includes('hunter2plaintext'), 'raw password must not appear in the exported bundle');
      assert.ok(note.includes('[REDACTED]'), 'redaction marker must be present');
    });

    test('cryptographic chain fields (entryHash/prevHash/signature) survive redaction verbatim', async () => {
      const entryHash = 'd'.repeat(64);
      const prevHash = 'e'.repeat(64);
      const signature = 'f'.repeat(64);
      const ledger: any = intactLedger([{
        id: 1,
        eventType: 'DECISION',
        payload: { rationale: 'apikey: "zz1234567890abcdefghijklmnop"' },
        entryHash,
        prevHash,
        signature,
      }]);
      const shadow: any = { analyzeFailurePatterns: async () => [], getUnresolvedEntries: async () => [] };
      const e = new ComplianceExporter(ledger, shadow);
      const out = await e.exportBundle('SOC2', dir);
      const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(out)).toString('utf-8'));

      assert.equal(bundle.ledger[0].entryHash, entryHash, 'entryHash must be preserved verbatim for chain verification');
      assert.equal(bundle.ledger[0].prevHash, prevHash, 'prevHash must be preserved verbatim for chain verification');
      assert.equal(bundle.ledger[0].signature, signature, 'signature must be preserved verbatim for chain verification');
      // the free-text sibling field on the same entry is still redacted
      assert.ok(!(bundle.ledger[0].payload.rationale as string).includes('zz1234567890abcdefghijklmnop'));
    });

    test('non-secret content is left untouched (no false-positive over-redaction)', async () => {
      const ledger: any = intactLedger([{
        id: 1,
        eventType: 'DECISION',
        payload: { rationale: 'Refactored the retry loop for clarity; no security impact.' },
        entryHash: 'a'.repeat(64),
      }]);
      const shadow: any = { analyzeFailurePatterns: async () => [], getUnresolvedEntries: async () => [] };
      const e = new ComplianceExporter(ledger, shadow);
      const out = await e.exportBundle('SOC2', dir);
      const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(out)).toString('utf-8'));

      assert.equal(bundle.ledger[0].payload.rationale, 'Refactored the retry loop for clarity; no security impact.');
    });
  });
});

// #538 lane C (plan LD6, LD7): the export states the ledger's integrity as
// intact, partial-seal, failed or unavailable, never a boolean.
suite('#538 ledger integrity in the export', function () {
  this.timeout(20000);
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce538-')); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  const shadow: any = { analyzeFailurePatterns: async () => [], getUnresolvedEntries: async () => [] };
  async function exportWith(ledger: unknown): Promise<any> {
    const out = await new ComplianceExporter(ledger as any, shadow).exportBundle('SOC2', dir);
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(out)).toString('utf-8'));
  }
  const integrity = (b: any) => b.ledgerIntegrity;

  test('C1 a legacy (golden) ledger exports partial-seal naming the v1/v2 rows, never chainVerification true', async () => {
    const env = makeEnv({ secret: GOLDEN.ledgerSecret });
    await writeGoldenLedger(env.ledgerPath);
    const mgr = await openLedger(env);
    try {
      const b = await exportWith(mgr);
      assert.equal('chainVerification' in b, false, 'no boolean chainVerification');
      assert.equal(integrity(b)?.status, 'partial-seal');
      assert.match(integrity(b).weakerProperties.join(' | '), /3 v1 and 2 v2/);
      assert.match(integrity(b).reason, /^PARTIAL SEAL/);
      assert.equal(integrity(b).sealScope, 'frozen-legacy');
      assert.equal(b.schemaVersion, 2);
    } finally { mgr.close(); env.cleanup(); }
  });
  test('C2 a fresh, anchored, bound ledger exports intact', async () => {
    const env = makeEnv();
    const mgr = await openLedger(env);
    try {
      await appendN(mgr, 1);
      await mgr.flushAnchor();
      const b = await exportWith(mgr);
      assert.equal(integrity(b)?.status, 'intact');
      assert.deepEqual(integrity(b).weakerProperties, []);
      assert.equal(integrity(b).rows, 2);
      assert.equal(integrity(b).failureCount, 0);
    } finally { mgr.close(); env.cleanup(); }
  });
  test('C3 a tampered row exports failed with the row and a reason', async () => {
    const env = makeEnv();
    const mgr = await openLedger(env);
    try {
      await appendN(mgr, 2);
      await mgr.flushAnchor();
      mgr.getDatabase().prepare("UPDATE soa_ledger SET verification_result = 'PASS' WHERE id = 2").run();
      const b = await exportWith(mgr);
      assert.equal(integrity(b)?.status, 'failed');
      assert.equal(integrity(b).failures[0].id, 2);
      assert.equal(typeof integrity(b).failures[0].code, 'string');
      assert.match(integrity(b).reason, new RegExp(`${integrity(b).failures[0].code} at id 2`));
    } finally { mgr.close(); env.cleanup(); }
  });
  test('C4 every unavailable ledger exports unavailable with its reason', async () => {
    const env = makeEnv();
    const closed = await openLedger(env);
    closed.close();
    const entries = async () => [];
    const cases: Array<[string, unknown, RegExp]> = [
      ['not wired', null, /not wired/i],
      ['verifyLedger throws', { getRecentEntries: entries, isAvailable: () => true, verifyLedger: async () => { throw new Error('disk I/O error'); } }, /disk I\/O error/],
      ['closed manager', closed, /unavailable|not initialized/i],
      ['isAvailable false', { getRecentEntries: entries, isAvailable: () => false, getDisabledReason: () => 'native sqlite missing', verifyLedger: async () => intactReport() }, /native sqlite missing/],
      ['no isAvailable', { getRecentEntries: entries, verifyLedger: async () => intactReport() }, /availability/i],
      ['no-database report', { getRecentEntries: entries, isAvailable: () => true, verifyLedger: async () => intactReport({ ok: false, sealScope: 'none', failures: [{ id: null, code: 'no-database', detail: 'Ledger DB not initialized' }] }) }, /Ledger DB not initialized/],
      ['non-object report', { getRecentEntries: entries, isAvailable: () => true, verifyLedger: async () => 'ok' }, /malformed/],
      ['non-boolean ok', { getRecentEntries: entries, isAvailable: () => true, verifyLedger: async () => intactReport({ ok: 'yes' }) }, /malformed/],
      ['non-array failures', { getRecentEntries: entries, isAvailable: () => true, verifyLedger: async () => intactReport({ failures: 'none' }) }, /malformed/],
      ['ok with no coverage or anchor', { getRecentEntries: entries, isAvailable: () => true, verifyLedger: async () => ({ ok: true, failures: [] }) }, /malformed/],
      ['string coverage counts', { getRecentEntries: entries, isAvailable: () => true, verifyLedger: async () => intactReport({ coverage: { v1Rows: '0', v2Rows: '0', v3Rows: '1', frozenLegacyRows: '0', unfrozenLegacyRows: '0' } }) }, /malformed/],
    ];
    try {
      for (const [name, ledger, reason] of cases) {
        const b = await exportWith(ledger);
        assert.equal(integrity(b)?.status, 'unavailable', name);
        assert.match(String(integrity(b).reason), reason, name);
        assert.notEqual(typeof b.chainVerification, 'boolean', name);
      }
    } finally { env.cleanup(); }
  });
  test('C5 a huge, malformed failure list is bounded and normalized; ok with failures is failed', async () => {
    const failures: unknown[] = [null, 'str', { id: 'x', code: 'c'.repeat(200), detail: 'd'.repeat(5000) }];
    for (let i = 0; failures.length < 10000; i++) failures.push({ id: i, code: 'hash-mismatch', detail: 'x' });
    const b = await exportWith({ getRecentEntries: async () => [], isAvailable: () => true, verifyLedger: async () => intactReport({ ok: false, failures }) });
    const r = integrity(b);
    assert.equal(r.status, 'failed');
    assert.equal(r.failures.length, 50);
    assert.equal(r.failureCount, 10000);
    assert.equal(r.failuresTruncated, true);
    for (const f of r.failures) {
      assert.ok(f.id === null || Number.isInteger(f.id));
      assert.equal(typeof f.code, 'string');
      assert.ok(f.code.length <= 64);
      assert.equal(typeof f.detail, 'string');
      assert.ok(f.detail.length <= 500);
    }
    assert.equal(r.failures[2].code, 'malformed');
    const okWithFailures = await exportWith({ getRecentEntries: async () => [], isAvailable: () => true, verifyLedger: async () => intactReport({ failures: [{ id: 3, code: 'prev-link', detail: 'x' }] }) });
    assert.equal(integrity(okWithFailures).status, 'failed');
  });
  test('C6 an unreadable ledger still writes a bundle with no entries and the read error', async () => {
    const b = await exportWith({ getRecentEntries: async () => { throw new Error('database is locked'); }, isAvailable: () => true, verifyLedger: async () => intactReport() });
    assert.deepEqual(b.ledger, []);
    assert.match(String(b.ledgerReadError), /database is locked/);
    const none = await exportWith(null);
    assert.deepEqual(none.ledger, []);
    assert.equal(integrity(none).status, 'unavailable');
  });
});
