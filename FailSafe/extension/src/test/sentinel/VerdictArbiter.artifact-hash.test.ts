// FX933 (FailSafe#367 tranche 3a): VerdictArbiter.evaluateFileEvent already
// reads file content once (FileReader.readFileContentSafe) to feed the
// heuristic/LLM engines. This proves that same content reaches the ledger's
// artifactHash column through VerdictEngine.generateVerdict's new trailing
// param, with no second disk read introduced along the way. Follows the
// real-dependency test pattern established by
// VerdictArbiter.malformed-payload.test.ts: only the vscode-dependent
// ConfigManager and leaf I/O engines (trust/ledger) are faked.
import { strict as assert } from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

const EVT = (type: string, payload: Record<string, unknown>): SentinelEvent => ({
  id: 'evt-1',
  timestamp: new Date().toISOString(),
  priority: 'normal',
  source: 'file_watcher',
  type,
  payload,
} as SentinelEvent);

function tmpFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'va-hash-'));
  const file = path.join(dir, 'sample.ts');
  fs.writeFileSync(file, content);
  return file;
}

suite('VerdictArbiter.evaluateEvent - artifactHash threading (FailSafe#367 FX933)', () => {
  test('a real file with content: ledger entry artifactHash is the sha256 of that exact content', async () => {
    const content = 'export const answer = 42;\n';
    const file = tmpFile(content);
    try {
      const { ledger, calls } = makeFakeLedgerManager();
      const arbiter = makeArbiter(ledger);
      await arbiter.evaluateEvent(EVT('FILE_MODIFIED', { path: file }));
      const expected = crypto.createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].artifactHash, expected);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test('FILE_DELETED event: no content is read, ledger entry artifactHash is undefined', async () => {
    const content = 'export const answer = 42;\n';
    const file = tmpFile(content);
    try {
      const { ledger, calls } = makeFakeLedgerManager();
      const arbiter = makeArbiter(ledger);
      await arbiter.evaluateEvent(EVT('FILE_DELETED', { path: file }));
      assert.equal(calls.length, 1);
      assert.equal(calls[0].artifactHash, undefined);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test('nonexistent file path: read_error leaves content and artifactHash both undefined', async () => {
    const { ledger, calls } = makeFakeLedgerManager();
    const arbiter = makeArbiter(ledger);
    await arbiter.evaluateEvent(EVT('FILE_MODIFIED', { path: '/nonexistent/path/to/nothing.ts' }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].artifactHash, undefined);
  });

  test('AGENT_CLAIM (existence check, no file content read): artifactHash stays undefined', async () => {
    const { ledger, calls } = makeFakeLedgerManager();
    const arbiter = makeArbiter(ledger);
    await arbiter.evaluateEvent(EVT('AGENT_CLAIM', {
      agentDid: 'did:t:alice',
      claimedArtifacts: ['src/does-not-matter.ts'],
    }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].artifactHash, undefined);
  });

  test('malformed payload (missing path): artifactHash stays undefined', async () => {
    const { ledger, calls } = makeFakeLedgerManager();
    const arbiter = makeArbiter(ledger);
    await arbiter.evaluateEvent(EVT('FILE_MODIFIED', {}));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].artifactHash, undefined);
  });
});
