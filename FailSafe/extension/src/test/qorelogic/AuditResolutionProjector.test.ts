// Functional tests for AuditResolutionProjector (FailSafe#367).

import { strict as assert } from 'assert';
import { projectResolution } from '../../qorelogic/ledger/AuditResolutionProjector';
import { L3ApprovalService } from '../../qorelogic/L3ApprovalService';
import { EventBus } from '../../shared/EventBus';

let nextId = 1;
function entry(overrides: Partial<Record<string, unknown>> & { eventType: string }): any {
  return {
    id: nextId++,
    timestamp: '2026-08-21T00:00:00Z',
    agentDid: 'did:myth:system:watcher',
    agentTrustAtAction: 0.5,
    gdprTrigger: false,
    entryHash: 'h',
    prevHash: 'p',
    signature: 's',
    payload: {},
    ...overrides,
  };
}

function reset() { nextId = 1; }

suite('AuditResolutionProjector (FailSafe#367)', () => {
  setup(() => reset());

  test('WARN with no later evidence stays LIVE', () => {
    const warn = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'WARN', artifactPath: 'src/a.ts' });
    const [proj] = projectResolution([warn]);
    assert.equal(proj.sourceEntryId, warn.id);
    assert.equal(proj.state, 'LIVE');
  });

  test('a later PASS for the same artifactPath does NOT mark the entry resolved', () => {
    // Regression guard for the reverted inference: VerdictEngine can never
    // emit a PASS carrying the pattern that drove a WARN/BLOCK, so
    // "later PASS, no pattern overlap" is true for virtually every real
    // WARN/BLOCK and must not be treated as evidence of anything.
    const warn = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'WARN', artifactPath: 'src/a.ts' });
    const pass = entry({ eventType: 'AUDIT_PASS', verificationResult: 'PASS', artifactPath: 'src/a.ts' });
    const [proj] = projectResolution([warn, pass]);
    assert.equal(proj.state, 'LIVE');
  });

  test('a claim-fabrication BLOCK is not cleared by an unrelated later PASS on the same path (cross-engine case)', () => {
    // VerdictArbiter.validateClaim keys existence/claim-fabrication
    // findings (pattern ids like EXS001) to artifacts[0]; a routine
    // content-heuristic scan on that same path afterward answers a
    // completely different question and must not read as resolution.
    const block = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'BLOCK',
      artifactPath: 'src/foo.ts', payload: { matchedPatterns: ['EXS001'] },
    });
    const routineScan = entry({
      eventType: 'AUDIT_PASS', verificationResult: 'PASS',
      artifactPath: 'src/foo.ts', payload: { matchedPatterns: [] },
    });
    const [proj] = projectResolution([block, routineScan]);
    assert.equal(proj.state, 'LIVE');
  });

  test('ESCALATE queued for L3 review (no decision yet) reports ESCALATED_UNDECIDED, not LIVE', () => {
    const escalate = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE', artifactPath: 'src/a.ts' });
    const queued = entry({
      eventType: 'L3_QUEUED', artifactPath: 'src/a.ts',
      payload: { sourceLedgerEntryId: escalate.id },
    });
    const [proj] = projectResolution([escalate, queued]);
    assert.equal(proj.state, 'ESCALATED_UNDECIDED');
    assert.equal(proj.resolvedByEntryId, queued.id);
  });

  test('ESCALATE explicitly decided APPROVED via sourceLedgerEntryId back-reference', () => {
    const escalate = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE', artifactPath: 'src/a.ts' });
    const queued = entry({ eventType: 'L3_QUEUED', artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id } });
    const approved = entry({
      eventType: 'L3_APPROVED', overseerDecision: 'APPROVED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id },
    });
    const [proj] = projectResolution([escalate, queued, approved]);
    assert.equal(proj.state, 'DECIDED_APPROVED');
    assert.equal(proj.resolvedByEntryId, approved.id);
  });

  test('ESCALATE explicitly decided REJECTED via sourceLedgerEntryId back-reference', () => {
    const escalate = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE', artifactPath: 'src/a.ts' });
    const rejected = entry({
      eventType: 'L3_REJECTED', overseerDecision: 'REJECTED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id },
    });
    const [proj] = projectResolution([escalate, rejected]);
    assert.equal(proj.state, 'DECIDED_REJECTED');
  });

  test('a decided entry (APPROVED/REJECTED) outranks its own earlier ESCALATED_UNDECIDED', () => {
    const escalate = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE', artifactPath: 'src/a.ts' });
    const queued = entry({ eventType: 'L3_QUEUED', artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id } });
    const rejected = entry({
      eventType: 'L3_REJECTED', overseerDecision: 'REJECTED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id },
    });
    const [proj] = projectResolution([escalate, queued, rejected]);
    assert.equal(proj.state, 'DECIDED_REJECTED');
    assert.equal(proj.resolvedByEntryId, rejected.id);
  });

  test('a decision that references a different source entry does not resolve this one', () => {
    const warnA = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'WARN', artifactPath: 'src/a.ts' });
    const decisionForSomethingElse = entry({
      eventType: 'L3_APPROVED', overseerDecision: 'APPROVED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: 9999 },
    });
    const [proj] = projectResolution([warnA, decisionForSomethingElse]);
    assert.equal(proj.state, 'LIVE');
  });

  test('a queued entry that references a different source does not mark this one ESCALATED_UNDECIDED', () => {
    const warnA = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'WARN', artifactPath: 'src/a.ts' });
    const queuedForSomethingElse = entry({
      eventType: 'L3_QUEUED', artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: 9999 },
    });
    const [proj] = projectResolution([warnA, queuedForSomethingElse]);
    assert.equal(proj.state, 'LIVE');
  });

  test('an L3_QUEUED with no sourceLedgerEntryId (e.g. EvaluationRouter tier-3 path) never falsely links', () => {
    const escalate = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE', artifactPath: 'src/a.ts' });
    const queuedFromOtherPath = entry({ eventType: 'L3_QUEUED', artifactPath: 'src/a.ts', payload: {} });
    const [proj] = projectResolution([escalate, queuedFromOtherPath]);
    assert.equal(proj.state, 'LIVE');
  });

  test('re-decision: the latest explicit decision by id wins', () => {
    const escalate = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE', artifactPath: 'src/a.ts' });
    const rejected = entry({
      eventType: 'L3_REJECTED', overseerDecision: 'REJECTED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id },
    });
    const approvedLater = entry({
      eventType: 'L3_APPROVED', overseerDecision: 'APPROVED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id },
    });
    const [proj] = projectResolution([escalate, rejected, approvedLater]);
    assert.equal(proj.state, 'DECIDED_APPROVED');
    assert.equal(proj.resolvedByEntryId, approvedLater.id);
  });

  test('PASS and non-resolvable entries are excluded from the projection output', () => {
    const pass = entry({ eventType: 'AUDIT_PASS', verificationResult: 'PASS', artifactPath: 'src/a.ts' });
    const sysEvent = entry({ eventType: 'SYSTEM_EVENT' });
    const results = projectResolution([pass, sysEvent]);
    assert.equal(results.length, 0);
  });

  test('QUARANTINE verdicts are not modeled as resolvable findings (out of scope for this projection)', () => {
    const quarantine = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'QUARANTINE', artifactPath: 'src/a.ts' });
    const results = projectResolution([quarantine]);
    assert.equal(results.length, 0);
  });

  test('input order does not affect the result (projector sorts by id internally)', () => {
    const escalate = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE', artifactPath: 'src/a.ts' });
    const approved = entry({
      eventType: 'L3_APPROVED', overseerDecision: 'APPROVED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id },
    });
    const forward = projectResolution([escalate, approved]);
    const reversed = projectResolution([approved, escalate]);
    assert.deepEqual(forward, reversed);
  });

  test('entries with no artifactPath at all (malformed event payload) still resolve via explicit id linkage', () => {
    const escalate = entry({ eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE', artifactPath: 'unknown' });
    const approved = entry({
      eventType: 'L3_APPROVED', overseerDecision: 'APPROVED',
      payload: { sourceLedgerEntryId: escalate.id },
    });
    const [proj] = projectResolution([escalate, approved]);
    assert.equal(proj.state, 'DECIDED_APPROVED');
  });
});

// Pins the documented SLA blind spot (module header, and the review that
// found it): L3ApprovalService.pruneExpired() discards an SLA-expired queue
// item with no ledger record, so the projector cannot tell a genuinely
// pending escalation from one that silently lapsed. This wires a REAL
// L3ApprovalService (not a hand-built ledger fixture) so the pin breaks if
// that behavior is ever fixed without updating this test and the module
// doc comment together.
suite('AuditResolutionProjector — SLA-expiry blind spot (FailSafe#367 review)', () => {
  test('an expired-and-discarded L3 escalation still projects ESCALATED_UNDECIDED, not a distinct "expired" state', async () => {
    const ledgerCalls: any[] = [];
    let nextLedgerId = 1;
    const ledger: any = {
      appendEntry: async (e: any) => {
        const stored = { id: nextLedgerId++, ...e };
        ledgerCalls.push(stored);
        return stored;
      },
    };
    const state: any = { l3Queue: [] };
    const stateStore: any = {
      get: <T,>(k: string, def: T) => (state[k] ?? def) as T,
      update: async (k: string, v: any) => { state[k] = v; },
    };
    // l3SLA: 0 -> the queued item is already past its deadline the instant
    // it's queued, matching pruneExpired's `deadline < now` branch.
    const config: any = { getConfig: () => ({ qorelogic: { l3SLA: 0 } }) };
    const bus = new EventBus();
    const trust: any = { updateTrust: async () => {} };
    const svc = new L3ApprovalService(stateStore, config, ledger, trust, bus);

    // Simulate VerdictRouter escalating a real ledger entry (id 1 below).
    const sourceLedgerEntryId = 1;
    ledgerCalls.push({ id: sourceLedgerEntryId, eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE', artifactPath: 'src/a.ts' });
    nextLedgerId = 2;
    await svc.queueL3Approval({
      agentDid: 'did:t:agent-1', agentTrust: 0.5, filePath: 'src/a.ts',
      riskGrade: 'L3', sentinelSummary: 'escalated', flags: [], sourceLedgerEntryId,
    });

    // Bypass the 5s prune throttle (mirrors L3ApprovalService.test.ts's
    // own EXPIRED-pruning test) and force the prune to run.
    (svc as any).lastPruneAt = 0;
    const queueAfterExpiry = svc.getQueue();

    assert.equal(queueAfterExpiry.length, 0, 'expired item must be gone from the live queue');
    assert.equal(
      ledgerCalls.filter((c) => c.eventType !== 'AUDIT_FAIL').length, 1,
      'pruneExpired must not append any ledger entry beyond the original L3_QUEUED — this is the blind spot',
    );

    const entries = ledgerCalls.map((c, i) => ({
      id: c.id ?? i + 1, timestamp: '2026-08-21T00:00:00Z', agentDid: 'did:t:agent-1',
      agentTrustAtAction: 0.5, gdprTrigger: false, entryHash: 'h', prevHash: 'p', signature: 's',
      payload: c.payload ?? {}, eventType: c.eventType, verificationResult: c.verificationResult,
      artifactPath: c.artifactPath,
    })) as any;
    const [proj] = projectResolution(entries);
    assert.equal(
      proj.state, 'ESCALATED_UNDECIDED',
      'ledger evidence alone cannot show this was silently discarded, not genuinely pending',
    );
  });
});
