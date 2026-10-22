import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { ReleasePipelineGate } from '../../governance/ReleasePipelineGate';
import type { LedgerVerification } from '../../qorelogic/ledger/LedgerVerifier';
import { GOLDEN, appendN, isAnchorKey, makeEnv, openLedger, writeGoldenLedger } from '../qorelogic/ledgerTestKit';

function createMockIntentService(activeIntent: { id: string; status: string } | null) {
  return { getActiveIntent: async () => activeIntent } as Parameters<typeof ReleasePipelineGate['prototype']['evaluate']> extends never ? never : any;
}

function report(overrides: Partial<LedgerVerification> = {}): LedgerVerification {
  return {
    ok: true,
    sealScope: 'full',
    rows: 3,
    coverage: { v1Rows: 0, v2Rows: 0, v3Rows: 3, frozenLegacyRows: 0, unfrozenLegacyRows: 0 },
    anchor: { status: 'verified', workspaceBound: true, headId: 3, unanchoredTail: 0, establishedAt: 't', establishedAtId: 1 },
    rotation: null,
    failures: [],
    ...overrides,
  };
}

function createMockLedger(chainValid: boolean) {
  return {
    isAvailable: () => true,
    verifyLedger: async () => chainValid
      ? report()
      : report({ ok: false, sealScope: 'none', failures: [{ id: 2, code: 'hash-mismatch', detail: 'x' }] }),
  } as any;
}

const allReasons = (r: { failures: { reason: string }[]; warnings: { reason: string }[] }) =>
  [...r.failures, ...r.warnings].map((c) => c.reason).join(' | ');

describe('ReleasePipelineGate', () => {
  it('blocks release with unsealed intents', async () => {
    const gate = new ReleasePipelineGate(
      createMockIntentService({ id: 'test-id', status: 'PULSE' }),
      createMockLedger(true),
    );
    const result = await gate.evaluate('v4.2.0');
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.name === 'unsealed-intents'));
  });

  it('blocks release on broken ledger chain', async () => {
    const gate = new ReleasePipelineGate(
      createMockIntentService(null),
      createMockLedger(false),
    );
    const result = await gate.evaluate('v4.2.0');
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.name === 'ledger-chain'));
  });

  it('allows clean release', async () => {
    const gate = new ReleasePipelineGate(
      createMockIntentService(null),
      createMockLedger(true),
    );
    const result = await gate.evaluate('v4.2.0');
    assert.equal(result.allowed, true);
    assert.equal(result.failures.length, 0);
  });

  it('returns an explicit release BLOCK when active-intent storage cannot be read (#473)', async () => {
    const broken = { getActiveIntent: async () => { throw new Error('intent store I/O unavailable'); } };
    const gate = new ReleasePipelineGate(broken as any, createMockLedger(true));
    const result = await gate.evaluate('v6.0.10');
    assert.equal(result.allowed, false);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].name, 'unsealed-intents');
    assert.match(result.failures[0].reason, /Unable to verify active intent/);
    assert.match(result.failures[0].reason, /intent store I\/O unavailable/);
    assert.deepEqual(result.warnings, []);
  });

  it('blocks release with invalid version format', async () => {
    const gate = new ReleasePipelineGate(
      createMockIntentService(null),
      createMockLedger(true),
    );
    const result = await gate.evaluate('not-a-version');
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.name === 'version-coherence'));
  });
});

describe('ReleasePipelineGate ledger scope (#473 LD9)', function () {
  this.timeout(10000);
  const gateFor = (ledger: unknown) => new ReleasePipelineGate(createMockIntentService(null), ledger as any);

  it('says intact only for a fresh, fully anchored, workspace-bound ledger', async () => {
    const env = makeEnv();
    const mgr = await openLedger(env);
    await appendN(mgr, 1);
    const gate = gateFor(mgr);
    const result = await gate.evaluate('v6.0.7');
    assert.equal(result.allowed, true);
    assert.deepEqual(result.warnings, []);
    const ledgerCheck = await (gate as any).checkLedgerChainIntegrity();
    assert.match(ledgerCheck.check.reason, /^Ledger chain intact: all 2 rows sealed v3/);
    mgr.close(); env.cleanup();
  });

  it('warns PARTIAL SEAL without a workspace binding', async () => {
    const env = makeEnv({ root: false });
    const mgr = await openLedger(env);
    const result = await gateFor(mgr).evaluate('v6.0.7');
    assert.equal(result.allowed, true);
    assert.match(result.warnings[0].reason, /^PARTIAL SEAL/);
    assert.match(result.warnings[0].reason, /ledger not bound to a workspace/);
    assert.doesNotMatch(result.warnings[0].reason, /intact/);
    mgr.close(); env.cleanup();
  });

  it('warns ROTATED FROM FAILED LEDGER after rotating a ledger that failed', async () => {
    const env = makeEnv();
    const mgr = await openLedger(env);
    await appendN(mgr, 2);
    await mgr.flushAnchor();
    mgr.getDatabase().prepare("UPDATE soa_ledger SET verification_result = 'PASS' WHERE id = 2").run();
    const { retiredFile } = await mgr.startNewLedger('recover');
    const result = await gateFor(mgr).evaluate('v6.0.7');
    assert.equal(result.allowed, true);
    assert.match(result.warnings[0].reason, /ROTATED FROM FAILED LEDGER/);
    assert.ok(result.warnings[0].reason.includes(retiredFile));
    mgr.close(); env.cleanup();
  });

  it('returns within the flush bound when SecretStorage hangs after initialize', async () => {
    const env = makeEnv();
    const mgr = await openLedger(env);
    env.secrets.storeGate = () => new Promise<void>(() => { /* never resolves */ });
    await appendN(mgr, 2);
    const started = Date.now();
    const result = await gateFor(mgr).evaluate('v6.0.7');
    assert.ok(Date.now() - started < 3000, 'bounded');
    assert.match(result.warnings[0]?.reason ?? '', /PARTIAL SEAL.*2 row\(s\) not yet anchored/);
    mgr.close(); env.cleanup();
  });

  it('discloses legacy rows on the golden ledger after activation and never says intact', async () => {
    const env = makeEnv({ secret: GOLDEN.ledgerSecret });
    await writeGoldenLedger(env.ledgerPath);
    const mgr = await openLedger(env);
    const result = await gateFor(mgr).evaluate('v6.0.7');
    assert.equal(result.allowed, true);
    const reason = result.warnings[0].reason;
    assert.match(reason, /^PARTIAL SEAL/);
    assert.match(reason, /3 v1 and 2 v2/);
    assert.match(reason, /INCONCLUSIVE/);
    assert.doesNotMatch(reason, /intact/);
    mgr.close(); env.cleanup();
  });

  it('names unanchored rows when SecretStorage rejects stores', async () => {
    const env = makeEnv();
    const mgr = await openLedger(env);
    env.secrets.rejectStore = isAnchorKey;
    await appendN(mgr, 2);
    const result = await gateFor(mgr).evaluate('v6.0.7');
    assert.match(result.warnings[0].reason, /PARTIAL SEAL.*2 row\(s\) not yet anchored/);
    assert.doesNotMatch(result.warnings[0].reason, /intact/);
    mgr.close(); env.cleanup();
  });

  it('blocks after tail truncation and after repointing the ledger path', async () => {
    const env = makeEnv();
    const mgr = await openLedger(env);
    await appendN(mgr, 3);
    await mgr.flushAnchor();
    mgr.getDatabase().prepare('DELETE FROM soa_ledger WHERE id > 2').run();
    const truncated = await gateFor(mgr).evaluate('v6.0.7');
    assert.equal(truncated.allowed, false);
    assert.match(truncated.failures[0].reason, /anchor-head-missing/);
    mgr.close();
    const repointed = await openLedger(env, { ledgerPath: env.ledgerPath + '.elsewhere.db' });
    const moved = await gateFor(repointed).evaluate('v6.0.7');
    assert.equal(moved.allowed, false);
    assert.match(allReasons(moved), /anchor-ledger-mismatch/);
    assert.doesNotMatch(allReasons(moved), /intact/);
    repointed.close(); env.cleanup();
  });

  it('blocks when the genesis audit columns are rewritten', async () => {
    const env = makeEnv();
    const mgr = await openLedger(env);
    mgr.getDatabase().prepare("UPDATE soa_ledger SET risk_grade = 'L1', verification_result = 'PASS' WHERE id = 1").run();
    const result = await gateFor(mgr).evaluate('v6.0.7');
    assert.equal(result.allowed, false);
    mgr.close(); env.cleanup();
  });

  it('blocks on an unknown seal version and names it', async () => {
    const ledger = { isAvailable: () => true, verifyLedger: async () => report({ ok: false, sealScope: 'none', failures: [{ id: 4, code: 'unknown-version', detail: 'x' }] }) };
    const result = await gateFor(ledger).evaluate('v6.0.7');
    assert.equal(result.allowed, false);
    assert.match(result.failures[0].reason, /unknown-version at id 4/);
  });

  it('fails closed when verifyLedger throws (review N2)', async () => {
    const ledger = { isAvailable: () => true, verifyLedger: async () => { throw new Error('disk I/O error'); } };
    const result = await gateFor(ledger).evaluate('v6.0.7');
    assert.equal(result.allowed, false);
    assert.match(result.failures[0].reason, /disk I\/O error/);
  });

  it('rejects a contradictory green report with recorded verification failures (#473)', async () => {
    const ledger = {
      isAvailable: () => true,
      verifyLedger: async () => report({
        ok: true,
        failures: [{ id: 2, code: 'hash-mismatch', detail: 'tampered verdict column' }],
      }),
    };
    const result = await gateFor(ledger).evaluate('v6.0.10');
    assert.equal(result.allowed, false);
    assert.equal(result.warnings.length, 0);
    assert.match(result.failures[0].reason, /hash-mismatch at id 2/);
  });

  it('rejects a malformed supposedly green report instead of throwing (#473)', async () => {
    const ledger = {
      isAvailable: () => true,
      verifyLedger: async () => ({ ok: true, failures: [] }),
    };
    const result = await gateFor(ledger).evaluate('v6.0.10');
    assert.equal(result.allowed, false);
    assert.match(result.failures[0].reason, /malformed report/);
  });

  it('rejects an unavailable ledger even if its verifier could return green (#473)', async () => {
    const ledger = {
      isAvailable: () => false,
      getDisabledReason: () => 'ledger database unavailable',
      verifyLedger: async () => report(),
    };
    const result = await gateFor(ledger).evaluate('v6.0.10');
    assert.equal(result.allowed, false);
    assert.match(result.failures[0].reason, /ledger database unavailable/);
  });

  it('rejects green ledger reports with missing row counts or anchor head IDs (#473)', async () => {
    const variants = [
      { ...report(), rows: undefined },
      { ...report(), anchor: { ...report().anchor, headId: undefined } },
      { ...report(), coverage: { ...report().coverage, v3Rows: -1 } },
      { ...report(), rotation: { retiredFile: null, retiredVerificationOk: true } },
    ];
    for (const candidate of variants) {
      const ledger = { isAvailable: () => true, verifyLedger: async () => candidate };
      const result = await gateFor(ledger).evaluate('v6.0.10');
      assert.equal(result.allowed, false, JSON.stringify(candidate));
      assert.match(result.failures[0].reason, /malformed report/, JSON.stringify(candidate));
    }
  });

  it('rejects contradictory green anchors and coverage instead of claiming intact (#473)', async () => {
    const base = report();
    const variants = [
      report({ anchor: { ...base.anchor, status: 'head-missing' } }),
      report({ anchor: { ...base.anchor, status: 'ledger-mismatch' } }),
      report({ anchor: { ...base.anchor, status: 'unavailable' } }),
      report({ coverage: { ...base.coverage, v3Rows: 2 } }),
      report({ coverage: { ...base.coverage, frozenLegacyRows: 1 } }),
      report({ sealScope: 'full', coverage: { ...base.coverage, v1Rows: 1, v3Rows: 2 } }),
    ];
    for (const candidate of variants) {
      const ledger = { isAvailable: () => true, verifyLedger: async () => candidate };
      const result = await gateFor(ledger).evaluate('v6.0.10');
      assert.equal(result.allowed, false, JSON.stringify(candidate));
      assert.match(result.failures[0].reason, /malformed report/);
    }
  });

  it('does not call a green but non-full seal intact (#473)', async () => {
    const ledger = {
      isAvailable: () => true,
      verifyLedger: async () => report({ sealScope: 'partial' }),
    };
    const result = await gateFor(ledger).evaluate('v6.0.10');
    assert.equal(result.allowed, true, 'existing warning-only release policy preserved');
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0].reason, /PARTIAL SEAL.*scope partial/);
    assert.doesNotMatch(result.warnings[0].reason, /chain intact/);
  });

  it('blocks when no ledger is wired', async () => {
    const result = await gateFor(null).evaluate('v6.0.7');
    assert.equal(result.allowed, false);
    assert.equal(result.failures[0].reason, 'Ledger not wired.');
  });
});
