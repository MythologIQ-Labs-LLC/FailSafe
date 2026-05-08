// Functional tests for ComplianceExporter (FX308).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { ComplianceExporter } from '../../governance/ComplianceExporter';

function makeStubs() {
  const ledger: any = {
    getRecentEntries: async (_n: number) => [{ id: 1, eventType: 'TEST' }],
    verifyChain: () => ({ valid: true, length: 1 }),
  };
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
    assert.deepEqual(bundle.chainVerification, { valid: true, length: 1 });
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
});
