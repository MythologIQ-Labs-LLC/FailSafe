// FX893 — buildConsumerDiagnostics (#233): per-artifact state/provenance
// summary + overall compatibility flag over the four file-based Qor-logic
// artifacts (META_LEDGER, FEATURE_INDEX, TRACKER_MANIFEST, AUDIT_GATE).
//
// Fixtures store `ws-docs/` and `qor-gates/` (dot-free / non-docs names —
// the root .gitignore's unanchored `.qor/` and `docs/` patterns match at any
// depth and would silently drop fixture files from git). materialize() copies
// a fixture set into a temp workspace and renames them to the REAL artifact
// paths (`docs/`, `.qor/gates/`) before the adapter runs.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildConsumerDiagnostics } from '../../../qorlogic/consumer/diagnostics';
import type { QorLogicVersionStatus } from '../../../qorlogic/qorLogicInstallRecord';

const FIXTURE_ROOT = path.resolve(
  __dirname, '..', '..', '..', '..', 'src', 'test', 'fixtures', 'qor-consumer',
);

const BELOW_FLOOR: QorLogicVersionStatus = {
  installed: '0.50.0',
  minimum: '0.100.0',
  meetsFloor: false,
};

const tempRoots: string[] = [];

/** Copy a fixture set into a temp workspace with the real artifact paths. */
function materialize(fixture: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-consumer-diag-'));
  fs.cpSync(path.join(FIXTURE_ROOT, fixture), root, { recursive: true });
  const wsDocs = path.join(root, 'ws-docs');
  if (fs.existsSync(wsDocs)) fs.renameSync(wsDocs, path.join(root, 'docs'));
  const gates = path.join(root, 'qor-gates');
  if (fs.existsSync(gates)) {
    fs.mkdirSync(path.join(root, '.qor'), { recursive: true });
    fs.renameSync(gates, path.join(root, '.qor', 'gates'));
  }
  tempRoots.push(root);
  return root;
}

suite('qor consumer diagnostics (#233 FX893)', () => {
  suiteTeardown(() => {
    for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
  });

  test('supported fixture + session id -> all four artifacts ok, compatible=true', () => {
    const root = materialize('supported');
    const diag = buildConsumerDiagnostics(root, { auditSessionId: 'sess-1' });
    assert.equal(diag.artifacts.length, 4);
    for (const a of diag.artifacts) {
      assert.equal(a.state, 'ok', `${a.artifact}: ${a.reason}`);
    }
    assert.equal(diag.compatible, true);
    assert.equal(diag.qorVersion, null, 'no versionStatus supplied');
  });

  test('malformed fixture -> compatible=false; malformed artifact identifies source path', () => {
    const root = materialize('malformed');
    const diag = buildConsumerDiagnostics(root, { auditSessionId: 'sess-1' });
    assert.equal(diag.compatible, false);
    const ledger = diag.artifacts.find((a) => a.artifact === 'META_LEDGER');
    assert.equal(ledger?.state, 'malformed');
    assert.ok(ledger?.reason?.includes('META_LEDGER.md'), `reason: ${ledger?.reason}`);
  });

  test('below-floor versionStatus -> every artifact unsupported, reason names versions', () => {
    const root = materialize('unsupported-version');
    const diag = buildConsumerDiagnostics(root, { versionStatus: BELOW_FLOOR });
    assert.equal(diag.compatible, false);
    for (const a of diag.artifacts) {
      assert.equal(a.state, 'unsupported', a.artifact);
      assert.ok(a.reason?.includes('0.50.0'), `${a.artifact} names installed: ${a.reason}`);
      assert.ok(a.reason?.includes('0.100.0'), `${a.artifact} names minimum: ${a.reason}`);
    }
    assert.equal(diag.qorVersion, '0.50.0');
  });

  test('missing-optional fixture -> unavailable artifacts do not break compatibility', () => {
    const diag = buildConsumerDiagnostics(materialize('missing-optional'));
    const states = Object.fromEntries(diag.artifacts.map((a) => [a.artifact, a.state]));
    assert.equal(states['META_LEDGER'], 'ok');
    assert.equal(states['FEATURE_INDEX'], 'unavailable');
    assert.equal(states['AUDIT_GATE'], 'unavailable', 'no session id supplied');
    assert.equal(diag.compatible, true, 'unavailable is not an incompatibility');
  });

  // Iteration-3 amendment (#233): the acceptance boundary is the SERVED hub
  // payload — assembleHubPayload FIELD-PICKS from the builder snapshot, so
  // this asserts qorConsumer survives the pick with builder-equal states.
  test('served hub payload carries qorConsumer with builder-equal per-artifact states', async () => {
    const { HubSnapshotService } = await import('../../../roadmap/services/HubSnapshotService');
    const root = materialize('malformed');
    const ledgerManager = { getDatabase: () => { throw new Error('no-db'); } };
    const deps = {
      workspaceRoot: root,
      extensionVersion: 'test',
      planManager: { getActivePlan: () => null, getAllSprints: () => [], getCurrentSprint: () => null, refreshFromWorkspace: () => {} } as never,
      qorelogicManager: {
        getL3Queue: () => [], refreshL3Queue: () => {},
        getTrustEngine: () => ({ getAllAgents: async () => [] }),
        getLedgerManager: () => ledgerManager,
      } as never,
      sentinelDaemon: { getStatus: () => ({ running: false }), getRecentObservationIds: () => [] } as never,
      qorRuntimeService: { fetchSnapshot: async () => ({}) } as never,
      gitResetService: {} as never,
      transparencyLogger: { getEvents: () => [], log: () => {} } as never,
      riskRegisterManager: { getRisks: () => [], writeRisks: () => {} } as never,
      mergePlanBlockers: (p: unknown) => p,
      getActualPort: () => 0,
      getIdeTracker: () => null,
      getAgentHealthIndicator: () => null,
      checkpointTypeRegistry: new Set<string>(),
    };
    const hub = new HubSnapshotService(deps as never);
    try {
      const snap = await hub.buildHubSnapshot();
      const served = snap.qorConsumer as import('../../../qorlogic/consumer/types').ConsumerDiagnostics;
      assert.ok(served, 'served payload carries qorConsumer');
      assert.equal(served.compatible, false, 'malformed workspace is incompatible at the payload boundary');
      const direct = buildConsumerDiagnostics(root);
      const servedStates = Object.fromEntries(served.artifacts.map((a) => [a.artifact, a.state]));
      for (const a of direct.artifacts) {
        assert.equal(servedStates[a.artifact], a.state, `${a.artifact} state survives the field-pick`);
      }
    } finally {
      hub.dispose();
    }
  });
});
