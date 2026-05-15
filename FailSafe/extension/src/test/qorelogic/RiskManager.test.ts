// Functional tests for RiskManager (FX328) and risk classification/severity (FX250).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RiskManager } from '../../qorelogic/risk/RiskManager';

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rm-'));
}

function newManager(dir: string): RiskManager {
  return new RiskManager(dir, 'test-project');
}

const STD_INPUT = {
  title: 'Test risk',
  description: 'desc',
  category: 'security' as const,
  severity: 'high' as const,
  impact: 'big',
  mitigation: 'fix it',
  source: 'manual' as const,
};

suite('RiskManager (FX328 + FX250)', () => {
  let dir: string;
  setup(() => { dir = makeWorkspace(); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX328 createRisk — returns risk with UUID + open status + timestamps', () => {
    const m = newManager(dir);
    const r = m.createRisk(STD_INPUT);
    assert.match(r.id, /^[0-9a-f-]{36}$/);
    assert.equal(r.status, 'open');
    assert.match(r.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(r.createdAt, r.updatedAt);
  });

  test('FX328 createRisk — persists to disk under .failsafe/risks/risks.json', () => {
    const m = newManager(dir);
    m.createRisk(STD_INPUT);
    const file = path.join(dir, '.failsafe/risks/risks.json');
    assert.ok(fs.existsSync(file));
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.equal(data.risks.length, 1);
    assert.equal(data.projectId, 'test-project');
  });

  test('FX328 RiskManager — re-instantiated manager loads existing risks from disk', () => {
    const m1 = newManager(dir);
    const r1 = m1.createRisk(STD_INPUT);
    const m2 = newManager(dir);
    const all = m2.getAllRisks();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, r1.id);
  });

  test('FX328 getRisk — known id returns risk; unknown returns undefined', () => {
    const m = newManager(dir);
    const r = m.createRisk(STD_INPUT);
    assert.equal(m.getRisk(r.id)?.id, r.id);
    assert.equal(m.getRisk('does-not-exist'), undefined);
  });

  test('FX328 updateRisk — mutates fields + bumps updatedAt', async () => {
    const m = newManager(dir);
    const r = m.createRisk(STD_INPUT);
    await new Promise(res => setTimeout(res, 10));
    const updated = m.updateRisk(r.id, { status: 'mitigating', owner: 'alice' });
    assert.equal(updated?.status, 'mitigating');
    assert.equal(updated?.owner, 'alice');
    assert.notEqual(updated?.updatedAt, r.updatedAt);
  });

  test('FX328 updateRisk — status=resolved sets resolvedAt timestamp', () => {
    const m = newManager(dir);
    const r = m.createRisk(STD_INPUT);
    const updated = m.updateRisk(r.id, { status: 'resolved' });
    assert.match(String(updated?.resolvedAt), /^\d{4}-\d{2}-\d{2}T/);
  });

  test('FX328 updateRisk — unknown id returns undefined', () => {
    const m = newManager(dir);
    assert.equal(m.updateRisk('does-not-exist', { status: 'resolved' }), undefined);
  });

  test('FX328 deleteRisk — removes risk and returns true', () => {
    const m = newManager(dir);
    const r = m.createRisk(STD_INPUT);
    assert.equal(m.deleteRisk(r.id), true);
    assert.equal(m.getRisk(r.id), undefined);
  });

  test('FX328 deleteRisk — unknown id returns false', () => {
    const m = newManager(dir);
    assert.equal(m.deleteRisk('does-not-exist'), false);
  });

  test('FX328 getRisksByStatus — filters by status', () => {
    const m = newManager(dir);
    const r1 = m.createRisk(STD_INPUT);
    m.createRisk(STD_INPUT);
    m.updateRisk(r1.id, { status: 'mitigating' });
    assert.equal(m.getRisksByStatus('open').length, 1);
    assert.equal(m.getRisksByStatus('mitigating').length, 1);
  });

  test('FX250 getRisksBySeverity — filters by severity (critical/high/medium/low)', () => {
    const m = newManager(dir);
    m.createRisk({ ...STD_INPUT, severity: 'critical' });
    m.createRisk({ ...STD_INPUT, severity: 'high' });
    m.createRisk({ ...STD_INPUT, severity: 'medium' });
    m.createRisk({ ...STD_INPUT, severity: 'low' });
    assert.equal(m.getRisksBySeverity('critical').length, 1);
    assert.equal(m.getRisksBySeverity('high').length, 1);
    assert.equal(m.getRisksBySeverity('medium').length, 1);
    assert.equal(m.getRisksBySeverity('low').length, 1);
  });

  test('FX328 getRisksByCategory — filters by category', () => {
    const m = newManager(dir);
    m.createRisk({ ...STD_INPUT, category: 'security' });
    m.createRisk({ ...STD_INPUT, category: 'operational' });
    assert.equal(m.getRisksByCategory('security').length, 1);
    assert.equal(m.getRisksByCategory('operational').length, 1);
  });

  test('FX328 getOpenCriticalAndHigh — filters open + (critical|high)', () => {
    const m = newManager(dir);
    m.createRisk({ ...STD_INPUT, severity: 'critical' });
    const r2 = m.createRisk({ ...STD_INPUT, severity: 'high' });
    m.createRisk({ ...STD_INPUT, severity: 'medium' });
    m.updateRisk(r2.id, { status: 'mitigating' });
    const oh = m.getOpenCriticalAndHigh();
    assert.equal(oh.length, 1);
    assert.equal(oh[0].severity, 'critical');
  });

  test('FX328 getSummary — produces RiskSummary with totals + breakdowns', () => {
    const m = newManager(dir);
    m.createRisk({ ...STD_INPUT, severity: 'critical' });
    m.createRisk({ ...STD_INPUT, severity: 'high' });
    m.createRisk({ ...STD_INPUT, severity: 'medium' });
    const s = m.getSummary();
    assert.equal(s.total, 3);
    assert.ok('byStatus' in s);
    assert.ok('bySeverity' in s);
  });

  test('FX328 dispose — saves register to disk', () => {
    const m = newManager(dir);
    m.createRisk(STD_INPUT);
    m.dispose();
    const file = path.join(dir, '.failsafe/risks/risks.json');
    assert.ok(fs.existsSync(file));
  });

  test('FX328 RiskManager — corrupt risks.json is gracefully replaced', () => {
    fs.mkdirSync(path.join(dir, '.failsafe/risks'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.failsafe/risks/risks.json'), '{not-json');
    const m = newManager(dir);
    assert.deepEqual(m.getAllRisks(), []);
  });

  // Plan-qor-model-sourced-risks Phase 1 tests.
  test('FX415 createRisk — persists source + sourceAgent to disk', () => {
    const m = newManager(dir);
    m.createRisk({ ...STD_INPUT, source: 'mcp', sourceAgent: 'claude-code' });
    const file = path.join(dir, '.failsafe/risks/risks.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(parsed.risks[0].source, 'mcp');
    assert.equal(parsed.risks[0].sourceAgent, 'claude-code');
  });

  test('FX415 loadOrCreate — backfills source=manual on legacy risks.json + saves', () => {
    // Write a fixture risks.json with one risk lacking `source`.
    fs.mkdirSync(path.join(dir, '.failsafe/risks'), { recursive: true });
    const file = path.join(dir, '.failsafe/risks/risks.json');
    fs.writeFileSync(file, JSON.stringify({
      projectId: 'test-project',
      projectName: 'test',
      risks: [{
        id: 'legacy-1', title: 't', description: 'd', category: 'security',
        severity: 'high', status: 'open', impact: '', mitigation: '',
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
      }],
      lastUpdated: '2024-01-01T00:00:00Z',
    }));
    const m = newManager(dir);
    // In-memory: backfilled.
    assert.equal(m.getAllRisks()[0].source, 'manual');
    // On disk: migration persisted.
    const reparsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(reparsed.risks[0].source, 'manual');
  });

  test('FX415 createRisk — runtime guard throws when source is missing (as any escape)', () => {
    const m = newManager(dir);
    assert.throws(
      () => m.createRisk({
        title: 'x', description: 'y', severity: 'low', category: 'security',
        impact: '', mitigation: '',
      } as any),
      /source/i,
    );
  });

  test('FX415 createRisk — re-derivation with same derivedFrom.ledgerEntry deduplicates', () => {
    const m = newManager(dir);
    const a = m.createRisk({ ...STD_INPUT, source: 'audit-veto',
      derivedFrom: { ledgerEntry: 271 } });
    const b = m.createRisk({ ...STD_INPUT, source: 'audit-veto',
      derivedFrom: { ledgerEntry: 271 }, title: 'duplicate attempt' });
    assert.equal(a.id, b.id, 'second call should return the same risk');
    assert.equal(m.getAllRisks().length, 1, 'no duplicate inserted');
  });
});
