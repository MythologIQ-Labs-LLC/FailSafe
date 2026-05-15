// Functional tests for RiskAutoDerivation (FX418 — plan Phase 3).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  deriveFromVeto,
  deriveFromDebug,
  deriveFromShadowGenomePattern,
  mapVetoSeverity,
  mapVetoCategory,
} from '../../../qorelogic/risk/RiskAutoDerivation';
import { RiskManager } from '../../../qorelogic/risk/RiskManager';
import type { LedgerEntry } from '../../../roadmap/services/GovernancePhaseTracker';

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rad-'));
}

function vetoEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    entry: 271,
    phase: 'GATE',
    verdict: 'VETO — 4 findings',
    timestamp: '2026-05-14T16:00:00Z',
    plan: 'plan-qor-model-sourced-risks',
    ...overrides,
  };
}

suite('RiskAutoDerivation (FX418)', () => {
  let dir: string;
  setup(() => { dir = makeWorkspace(); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX418 mapVetoSeverity maps security-l3 to critical', () => {
    assert.equal(mapVetoSeverity(['security-l3']), 'critical');
  });

  test('FX418 mapVetoSeverity maps owasp-violation to high', () => {
    assert.equal(mapVetoSeverity(['owasp-violation']), 'high');
  });

  test('FX418 mapVetoSeverity defaults to medium for unknown or empty', () => {
    assert.equal(mapVetoSeverity([]), 'medium');
    assert.equal(mapVetoSeverity(undefined), 'medium');
    assert.equal(mapVetoSeverity(['some-other']), 'medium');
  });

  test('FX418 mapVetoCategory maps security-l3 to security', () => {
    assert.equal(mapVetoCategory(['security-l3']), 'security');
  });

  test('FX418 mapVetoCategory defaults to governance', () => {
    assert.equal(mapVetoCategory([]), 'governance');
    assert.equal(mapVetoCategory(undefined), 'governance');
  });

  test('FX418 deriveFromVeto creates a risk with audit-veto source + ledgerEntry', () => {
    const mgr = new RiskManager(dir, 'test-project');
    deriveFromVeto(
      vetoEntry(),
      { findings_categories: ['security-l3'] },
      mgr,
    );
    const all = mgr.getAllRisks();
    assert.equal(all.length, 1);
    assert.equal(all[0].source, 'audit-veto');
    assert.equal(all[0].severity, 'critical');
    assert.equal(all[0].category, 'security');
    assert.equal(all[0].derivedFrom?.ledgerEntry, 271);
    assert.equal(all[0].derivedFrom?.planSlug, 'plan-qor-model-sourced-risks');
  });

  test('FX418 deriveFromVeto with null gateArtifact defaults to medium severity', () => {
    const mgr = new RiskManager(dir, 'test-project');
    deriveFromVeto(vetoEntry(), null, mgr);
    const all = mgr.getAllRisks();
    assert.equal(all.length, 1);
    assert.equal(all[0].severity, 'medium');
    assert.equal(all[0].category, 'governance');
  });

  test('FX418 deriveFromVeto is idempotent — re-derivation does not duplicate', () => {
    const mgr = new RiskManager(dir, 'test-project');
    deriveFromVeto(vetoEntry(), { findings_categories: ['security-l3'] }, mgr);
    deriveFromVeto(vetoEntry(), { findings_categories: ['security-l3'] }, mgr);
    assert.equal(mgr.getAllRisks().length, 1, 'second derivation should dedup');
  });

  test('FX418 deriveFromVeto skips non-VETO entries', () => {
    const mgr = new RiskManager(dir, 'test-project');
    deriveFromVeto(vetoEntry({ verdict: 'PASS' }), null, mgr);
    assert.equal(mgr.getAllRisks().length, 0);
  });

  test('FX418 deriveFromShadowGenomePattern creates one risk per eventId', () => {
    const mgr = new RiskManager(dir, 'test-project');
    deriveFromShadowGenomePattern(
      { entryId: 'g-001', failureMode: 'repeated_veto_pattern', agentDid: 'did:agent:claude' },
      mgr,
    );
    const all = mgr.getAllRisks();
    assert.equal(all.length, 1);
    assert.equal(all[0].source, 'shadow-genome');
    assert.equal(all[0].severity, 'high');
    assert.equal(all[0].derivedFrom?.shadowGenomeEventId, 'g-001');
  });

  test('FX418 deriveFromShadowGenomePattern dedups on same eventId', () => {
    const mgr = new RiskManager(dir, 'test-project');
    deriveFromShadowGenomePattern({ entryId: 'g-002' }, mgr);
    deriveFromShadowGenomePattern({ entryId: 'g-002' }, mgr);
    assert.equal(mgr.getAllRisks().length, 1);
  });

  test('FX418 deriveFromDebug creates risk for DEBUG phase only', () => {
    const mgr = new RiskManager(dir, 'test-project');
    const debugEntry: LedgerEntry = {
      entry: 999, phase: 'DEBUG' as any, verdict: 'open',
      timestamp: '2026-05-14T16:00:00Z', plan: 'plan-x',
    };
    deriveFromDebug(debugEntry, mgr);
    const all = mgr.getAllRisks();
    assert.equal(all.length, 1);
    assert.equal(all[0].source, 'debug');
    assert.equal(all[0].severity, 'high');
  });
});
