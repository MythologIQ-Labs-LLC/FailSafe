// Functional tests for VerdictEngine (FX346).

import { strict as assert } from 'assert';
import { VerdictEngine } from '../../sentinel/engines/VerdictEngine';
import type { HeuristicResult, SentinelEvent } from '../../shared/types';

interface Stubs {
  trust: any;
  policy: any;
  ledger: any;
  shadow: any;
  ledgerCalls: any[];
  trustUpdates: any[];
  shadowArchives: any[];
  quarantines: any[];
}

function makeStubs(opts: {
  riskGrade?: string;
  trustScore?: number | null;
  ledgerThrows?: boolean;
  shadowThrows?: boolean;
  trustThrows?: boolean;
} = {}): Stubs {
  const ledgerCalls: any[] = [];
  const trustUpdates: any[] = [];
  const shadowArchives: any[] = [];
  const quarantines: any[] = [];
  return {
    trust: {
      getTrustScore: (_did: string) =>
        opts.trustScore === null ? null : { score: opts.trustScore ?? 0.85 },
      updateTrust: async (did: string, outcome: string) => {
        if (opts.trustThrows) throw new Error('trust boom');
        trustUpdates.push({ did, outcome });
      },
      quarantineAgent: async (did: string, reason: string, hours: number) => {
        quarantines.push({ did, reason, hours });
      },
    },
    policy: { classifyRisk: (_p: string) => opts.riskGrade ?? 'L1' },
    ledger: {
      appendEntry: async (e: any) => {
        if (opts.ledgerThrows) throw new Error('ledger boom');
        ledgerCalls.push(e);
        return { id: ledgerCalls.length };
      },
    },
    shadow: {
      archiveFailure: async (e: any) => {
        if (opts.shadowThrows) throw new Error('shadow boom');
        shadowArchives.push(e);
        return { id: shadowArchives.length };
      },
    },
    ledgerCalls, trustUpdates, shadowArchives, quarantines,
  };
}

const EVT = (overrides: Partial<SentinelEvent> = {}): SentinelEvent => ({
  id: overrides.id ?? 'evt-1',
  timestamp: overrides.timestamp ?? new Date().toISOString(),
  type: overrides.type ?? 'file.modified' as any,
  payload: overrides.payload ?? {},
} as SentinelEvent);

const HR = (overrides: Partial<HeuristicResult>): HeuristicResult => ({
  patternId: overrides.patternId ?? 'P1',
  matched: overrides.matched ?? false,
  severity: overrides.severity ?? 'low',
  ...overrides,
} as HeuristicResult);

suite('VerdictEngine (FX346)', () => {
  test('FX346 generateVerdict — clean L1 → PASS', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/foo.ts', [HR({ matched: false })]);
    assert.equal(v.decision, 'PASS');
    assert.equal(v.riskGrade, 'L1');
    assert.equal(v.summary, 'File passed verification (L1)');
  });

  test('FX346 generateVerdict — critical heuristic + L1 → BLOCK', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/foo.ts', [HR({ matched: true, severity: 'critical' })]);
    assert.equal(v.decision, 'BLOCK');
  });

  test('FX346 generateVerdict — critical heuristic + L3 → ESCALATE (not BLOCK)', async () => {
    const s = makeStubs({ riskGrade: 'L3' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/auth.ts', [HR({ matched: true, severity: 'critical' })]);
    assert.equal(v.decision, 'ESCALATE');
  });

  test('FX346 generateVerdict — L3 file with no findings → ESCALATE', async () => {
    const s = makeStubs({ riskGrade: 'L3' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/auth.ts', []);
    assert.equal(v.decision, 'ESCALATE');
  });

  test('FX346 generateVerdict — high severity + L2 → BLOCK', async () => {
    const s = makeStubs({ riskGrade: 'L2' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/x.ts', [HR({ matched: true, severity: 'high' })]);
    assert.equal(v.decision, 'BLOCK');
  });

  test('FX346 generateVerdict — high severity + L1 → WARN', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/x.ts', [HR({ matched: true, severity: 'high' })]);
    assert.equal(v.decision, 'WARN');
  });

  test('FX346 generateVerdict — medium severity → WARN regardless of L', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/x.ts', [HR({ matched: true, severity: 'medium' })]);
    assert.equal(v.decision, 'WARN');
  });

  test('FX346 generateVerdict — populates matchedPatterns from matched HRs', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/x.ts', [
      HR({ patternId: 'P1', matched: true, severity: 'medium' }),
      HR({ patternId: 'P2', matched: false }),
      HR({ patternId: 'P3', matched: true, severity: 'medium' }),
    ]);
    assert.deepEqual(v.matchedPatterns, ['P1', 'P3']);
  });

  test('FX346 generateVerdict — agentDid defaults to system watcher when payload absent', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT({ payload: {} }), 'src/x.ts', []);
    assert.equal(v.agentDid, 'did:myth:system:watcher');
  });

  test('FX346 generateVerdict — agentDid forwarded from event payload', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT({ payload: { agentDid: 'did:t:alice' } }), 'src/x.ts', []);
    assert.equal(v.agentDid, 'did:t:alice');
  });

  test('FX346 generateVerdict — null trust → fallback 0.35', async () => {
    const s = makeStubs({ riskGrade: 'L1', trustScore: null });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/x.ts', []);
    assert.equal(v.agentTrustAtVerdict, 0.35);
  });

  test('FX346 executeActions — PASS verdict logs AUDIT_PASS to ledger', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    await e.generateVerdict(EVT(), 'src/x.ts', []);
    assert.equal(s.ledgerCalls.length, 1);
    assert.equal(s.ledgerCalls[0].eventType, 'AUDIT_PASS');
  });

  test('FX346 executeActions — non-PASS verdict logs AUDIT_FAIL', async () => {
    const s = makeStubs({ riskGrade: 'L3' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    await e.generateVerdict(EVT(), 'src/auth.ts', []);
    assert.equal(s.ledgerCalls[0].eventType, 'AUDIT_FAIL');
  });

  test('FX346 executeActions — non-system agent updates trust', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    await e.generateVerdict(EVT({ payload: { agentDid: 'did:t:alice' } }), 'src/x.ts', []);
    assert.equal(s.trustUpdates.length, 1);
    assert.equal(s.trustUpdates[0].did, 'did:t:alice');
    assert.equal(s.trustUpdates[0].outcome, 'success');
  });

  test('FX346 executeActions — system agent does NOT update trust', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    await e.generateVerdict(EVT(), 'src/x.ts', []); // default did:myth:system:watcher
    assert.equal(s.trustUpdates.length, 0);
  });

  test('FX346 executeActions — non-PASS archives to Shadow Genome', async () => {
    const s = makeStubs({ riskGrade: 'L3' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    await e.generateVerdict(EVT(), 'src/auth.ts', []);
    assert.equal(s.shadowArchives.length, 1);
  });

  test('FX346 executeActions — PASS does NOT archive to Shadow Genome', async () => {
    const s = makeStubs({ riskGrade: 'L1' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    await e.generateVerdict(EVT(), 'src/x.ts', []);
    assert.equal(s.shadowArchives.length, 0);
  });

  test('FX346 executeActions — ESCALATE adds L3_QUEUE pending action', async () => {
    const s = makeStubs({ riskGrade: 'L3' });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/auth.ts', []);
    const l3 = v.actions.find(a => a.type === 'L3_QUEUE');
    assert.ok(l3);
    assert.equal(l3!.status, 'pending');
  });

  test('FX346 executeActions — ledger throw produces failed LOG action (no rethrow)', async () => {
    const s = makeStubs({ riskGrade: 'L1', ledgerThrows: true });
    const e = new VerdictEngine(s.trust, s.policy, s.ledger, s.shadow);
    const v = await e.generateVerdict(EVT(), 'src/x.ts', []);
    const log = v.actions.find(a => a.type === 'LOG');
    assert.equal(log!.status, 'failed');
    assert.match(String(log!.details), /Failed to log/);
  });
});
