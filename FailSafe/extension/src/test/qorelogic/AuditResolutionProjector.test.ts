// Functional tests for AuditResolutionProjector (FailSafe#367).

import { strict as assert } from 'assert';
import { projectResolution } from '../../qorelogic/ledger/AuditResolutionProjector';

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

  test('WARN with no later entries for its artifact stays LIVE', () => {
    const warn = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const [proj] = projectResolution([warn]);
    assert.equal(proj.sourceEntryId, warn.id);
    assert.equal(proj.state, 'LIVE');
  });

  test('WARN superseded by a later PASS with no overlapping patterns', () => {
    const warn = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const pass = entry({
      eventType: 'AUDIT_PASS', verificationResult: 'PASS',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: [] },
    });
    const [proj] = projectResolution([warn, pass]);
    assert.equal(proj.state, 'SUPERSEDED');
    assert.equal(proj.resolvedByEntryId, pass.id);
  });

  test('WARN NOT superseded when the later PASS still lists the same pattern', () => {
    // Guards against a caller ever emitting an inconsistent PASS+matchedPatterns
    // pair; the projector must not trust the verdict label alone.
    const warn = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const stillFlagged = entry({
      eventType: 'AUDIT_PASS', verificationResult: 'PASS',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const [proj] = projectResolution([warn, stillFlagged]);
    assert.equal(proj.state, 'LIVE');
  });

  test('WARN stays LIVE when a later WARN for the same artifact re-flags the same pattern', () => {
    const warn1 = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const warn2 = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const [proj1] = projectResolution([warn1, warn2]);
    assert.equal(proj1.state, 'LIVE');
  });

  test('WARN stays LIVE when a later verdict for a different pattern exists but this pattern was never cleared', () => {
    const warn = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const otherWarn = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p2'] },
    });
    const [proj] = projectResolution([warn, otherWarn]);
    assert.equal(proj.state, 'LIVE');
  });

  test('ESCALATE explicitly decided APPROVED via sourceLedgerEntryId back-reference', () => {
    const escalate = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const approved = entry({
      eventType: 'L3_APPROVED', overseerDecision: 'APPROVED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id },
    });
    const [proj] = projectResolution([escalate, approved]);
    assert.equal(proj.state, 'DECIDED_APPROVED');
    assert.equal(proj.resolvedByEntryId, approved.id);
  });

  test('ESCALATE explicitly decided REJECTED via sourceLedgerEntryId back-reference', () => {
    const escalate = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const rejected = entry({
      eventType: 'L3_REJECTED', overseerDecision: 'REJECTED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id },
    });
    const [proj] = projectResolution([escalate, rejected]);
    assert.equal(proj.state, 'DECIDED_REJECTED');
  });

  test('explicit decision wins even when an unrelated later PASS could look like supersession', () => {
    const escalate = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const unrelatedPass = entry({
      eventType: 'AUDIT_PASS', verificationResult: 'PASS',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: [] },
    });
    const rejected = entry({
      eventType: 'L3_REJECTED', overseerDecision: 'REJECTED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: escalate.id },
    });
    const [proj] = projectResolution([escalate, unrelatedPass, rejected]);
    assert.equal(proj.state, 'DECIDED_REJECTED');
    assert.equal(proj.resolvedByEntryId, rejected.id);
  });

  test('a decision that references a different source entry does not resolve this one', () => {
    const warnA = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const decisionForSomethingElse = entry({
      eventType: 'L3_APPROVED', overseerDecision: 'APPROVED',
      artifactPath: 'src/a.ts', payload: { sourceLedgerEntryId: 9999 },
    });
    const [proj] = projectResolution([warnA, decisionForSomethingElse]);
    assert.equal(proj.state, 'LIVE');
  });

  test('BLOCK with no artifactPath is UNKNOWN, not LIVE', () => {
    const block = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'BLOCK',
      payload: { matchedPatterns: ['p1'] },
    });
    const [proj] = projectResolution([block]);
    assert.equal(proj.state, 'UNKNOWN');
  });

  test('entry with unreadable matchedPatterns is UNKNOWN', () => {
    const malformed = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: 'not-an-array' },
    });
    const [proj] = projectResolution([malformed]);
    assert.equal(proj.state, 'UNKNOWN');
  });

  test('a later same-artifact entry with unreadable matchedPatterns yields AMBIGUOUS, not a silent LIVE/SUPERSEDED guess', () => {
    const warn = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const malformedLater = entry({
      eventType: 'AUDIT_PASS', verificationResult: 'PASS',
      artifactPath: 'src/a.ts', payload: {},
    });
    const [proj] = projectResolution([warn, malformedLater]);
    assert.equal(proj.state, 'AMBIGUOUS');
  });

  test('PASS and non-resolvable entries are excluded from the projection output', () => {
    const pass = entry({ eventType: 'AUDIT_PASS', verificationResult: 'PASS', artifactPath: 'src/a.ts' });
    const sysEvent = entry({ eventType: 'SYSTEM_EVENT' });
    const results = projectResolution([pass, sysEvent]);
    assert.equal(results.length, 0);
  });

  test('QUARANTINE verdicts are not modeled as resolvable findings (out of scope for this projection)', () => {
    const quarantine = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'QUARANTINE',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const results = projectResolution([quarantine]);
    assert.equal(results.length, 0);
  });

  test('input order does not affect the result (projector sorts by id internally)', () => {
    const warn = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const pass = entry({
      eventType: 'AUDIT_PASS', verificationResult: 'PASS',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: [] },
    });
    const forward = projectResolution([warn, pass]);
    const reversed = projectResolution([pass, warn]);
    assert.deepEqual(forward, reversed);
  });

  test('the earliest qualifying clean verdict is reported, not the latest', () => {
    const warn = entry({
      eventType: 'AUDIT_FAIL', verificationResult: 'WARN',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: ['p1'] },
    });
    const firstClean = entry({
      eventType: 'AUDIT_PASS', verificationResult: 'PASS',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: [] },
    });
    const secondClean = entry({
      eventType: 'AUDIT_PASS', verificationResult: 'PASS',
      artifactPath: 'src/a.ts', payload: { matchedPatterns: [] },
    });
    const [proj] = projectResolution([warn, firstClean, secondClean]);
    assert.equal(proj.resolvedByEntryId, firstClean.id);
  });
});
