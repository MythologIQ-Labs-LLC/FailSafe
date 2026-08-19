// Malformed-event-payload fail-open path (Myth-Tech-Forge relay cycle #152 /
// FailSafe#297 "core governance and enforcement" audit, Slice 2 candidate 1:
// sentinel/VerdictArbiter.ts:93-101).
//
// Prior to this fix, VerdictArbiter.evaluateFileEvent's guard against a
// missing/invalid event.payload.path called
// `verdictEngine.generateVerdict(event, 'unknown', [], undefined)` -- the
// normal pipeline, with zero heuristic results and no LLM evaluation. In
// VerdictEngine.determineDecision, zero matches at any severity and
// confidence >= 0.5 falls through every branch to `return 'PASS'`, so a
// SentinelEvent whose payload the arbiter itself flagged as unverifiable
// still silently PASSED -- indistinguishable from a genuinely clean file.
//
// This is a real, end-to-end exercise of VerdictArbiter.evaluateEvent through
// a real VerdictEngine/HeuristicEngine/ExistenceEngine/PolicyEngine stack
// (not a reimplementation of the decision algorithm) -- only the
// vscode-dependent ConfigManager and the leaf I/O engines (trust/ledger/
// shadow persistence) are faked, following the same real-dependency pattern
// used for the Slice 1 GovernanceRouter fix (src/test/governance/GovernanceRouter.test.ts).
import { strict as assert } from 'assert';
import { VerdictArbiter } from '../../sentinel/VerdictArbiter';
import { VerdictEngine } from '../../sentinel/engines/VerdictEngine';
import { HeuristicEngine } from '../../sentinel/engines/HeuristicEngine';
import { ExistenceEngine } from '../../sentinel/engines/ExistenceEngine';
import { PolicyEngine } from '../../qorelogic/policies/PolicyEngine';
import { PatternLoader } from '../../sentinel/PatternLoader';
import type { ConfigManager } from '../../shared/ConfigManager';
import type { TrustEngine } from '../../qorelogic/trust/TrustEngine';
import type { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import type { IConfigProvider } from '../../core/interfaces/IConfigProvider';
import type { SentinelEvent, FailSafeConfig } from '../../shared/types';

function makeFakeConfigManager(): ConfigManager {
  return {
    getConfig: (): FailSafeConfig => ({
      sentinel: { enabled: true, mode: 'heuristic', localModel: '', ollamaEndpoint: '' },
    } as unknown as FailSafeConfig),
    getWorkspaceRoot: () => '/workspace',
  } as unknown as ConfigManager;
}

function makeFakeTrustEngine(): TrustEngine {
  return {
    getTrustScore: (_did: string) => ({ score: 0.85 }),
    updateTrust: async () => undefined,
    quarantineAgent: async () => undefined,
  } as unknown as TrustEngine;
}

interface FakeLedger {
  ledger: LedgerManager;
  calls: Array<Record<string, unknown>>;
}

function makeFakeLedgerManager(): FakeLedger {
  const calls: Array<Record<string, unknown>> = [];
  const ledger = {
    appendEntry: async (entry: Record<string, unknown>) => {
      calls.push(entry);
      return { id: calls.length };
    },
  } as unknown as LedgerManager;
  return { ledger, calls };
}

function makeArbiter(fakeLedger: LedgerManager) {
  const configManager = makeFakeConfigManager();
  const configProvider = configManager as unknown as IConfigProvider;
  const policyEngine = new PolicyEngine(configProvider);
  const patternLoader = new PatternLoader();
  const heuristicEngine = new HeuristicEngine(policyEngine, patternLoader);
  const existenceEngine = new ExistenceEngine(configManager);
  const verdictEngine = new VerdictEngine(makeFakeTrustEngine(), policyEngine, fakeLedger, undefined);
  return new VerdictArbiter(configManager, heuristicEngine, verdictEngine, existenceEngine);
}

const EVT = (payload: Record<string, unknown>): SentinelEvent => ({
  id: 'evt-1',
  timestamp: new Date().toISOString(),
  priority: 'normal',
  source: 'file_watcher',
  type: 'FILE_MODIFIED',
  payload,
} as SentinelEvent);

suite('VerdictArbiter.evaluateEvent - malformed payload fail-open path (FailSafe#297 Slice 2)', () => {
  test('missing payload.path does not silently PASS', async () => {
    const { ledger } = makeFakeLedgerManager();
    const arbiter = makeArbiter(ledger);
    const verdict = await arbiter.evaluateEvent(EVT({}));
    assert.notEqual(verdict.decision, 'PASS', 'a missing path must never resolve to a plain PASS');
    assert.equal(verdict.decision, 'ESCALATE');
  });

  test('non-string payload.path does not silently PASS', async () => {
    const { ledger } = makeFakeLedgerManager();
    const arbiter = makeArbiter(ledger);
    const verdict = await arbiter.evaluateEvent(EVT({ path: 12345 }));
    assert.notEqual(verdict.decision, 'PASS', 'a non-string path must never resolve to a plain PASS');
    assert.equal(verdict.decision, 'ESCALATE');
  });

  test('empty-string payload.path does not silently PASS', async () => {
    const { ledger } = makeFakeLedgerManager();
    const arbiter = makeArbiter(ledger);
    const verdict = await arbiter.evaluateEvent(EVT({ path: '' }));
    assert.notEqual(verdict.decision, 'PASS');
    assert.equal(verdict.decision, 'ESCALATE');
  });

  test('malformed-payload verdict is logged as AUDIT_FAIL, not AUDIT_PASS', async () => {
    const { ledger, calls } = makeFakeLedgerManager();
    const arbiter = makeArbiter(ledger);
    await arbiter.evaluateEvent(EVT({}));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].eventType, 'AUDIT_FAIL');
    assert.equal(calls[0].verificationResult, 'ESCALATE');
  });

  test('malformed-payload summary explains why, not a generic pass/fail label', async () => {
    const { ledger } = makeFakeLedgerManager();
    const arbiter = makeArbiter(ledger);
    const verdict = await arbiter.evaluateEvent(EVT({}));
    assert.match(verdict.summary, /missing or invalid/i);
  });

  test('control: a well-formed nonexistent-file path with no heuristic matches still PASSes (unchanged behavior)', async () => {
    const { ledger } = makeFakeLedgerManager();
    const arbiter = makeArbiter(ledger);
    const verdict = await arbiter.evaluateEvent(EVT({ path: 'src/does-not-exist-in-this-sandbox.ts' }));
    assert.equal(verdict.decision, 'PASS', 'a real, well-formed path must retain its normal PASS behavior');
  });
});
