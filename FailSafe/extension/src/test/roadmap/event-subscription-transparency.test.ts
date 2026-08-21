// Audit Log verdict signal — producer enrichment (plan-audit-log-verdict-signal).
//
// Operator-reported defect: a sentinel.verdict Audit Log record carried only
// {type, decision, riskGrade, timestamp} — the subscription read `p.filePath`
// (the SentinelVerdict field is `artifactPath`) and discarded summary,
// matchedPatterns, details, and id. These tests drive the REAL
// EventSubscriptionManager over a real EventBus and assert the logged payload
// against a fully-populated verdict.

import { strict as assert } from 'assert';
import { EventSubscriptionManager } from '../../roadmap/services/EventSubscriptionManager';
import { EventBus } from '../../shared/EventBus';

function makeDeps(captured: { transparencyEvents: any[]; broadcasts: any[] }): any {
  return {
    eventBus: new EventBus(),
    recordCheckpoint: () => {},
    broadcast: (d: any) => captured.broadcasts.push(d),
    logTransparencyEvent: (e: any) => captured.transparencyEvents.push(e),
    inferPhaseKey: () => 'plan',
    recordObservedFileMutation: () => {},
    getPlan: () => ({ phases: [] }),
    sealedSubstantiateCompletions: new Set<string>(),
  };
}

const FULL_VERDICT = {
  id: 'verdict-9f2',
  eventId: 'evt-31',
  timestamp: '2026-08-20T21:24:10.057Z',
  decision: 'WARN',
  riskGrade: 'L1',
  confidence: 0.82,
  heuristicResults: [],
  agentDid: 'did:test:agent',
  agentTrustAtVerdict: 0.7,
  artifactPath: 'src/auth/session.ts',
  summary: '1 issue(s) detected - review recommended',
  details: 'pattern hardcoded-credential at line 42',
  matchedPatterns: ['hardcoded-credential'],
  actions: [],
};

suite('EventSubscriptionManager transparency enrichment (audit-log-verdict-signal)', () => {
  test('logged payload carries the verdict substance: artifactPath->filePath, summary, patterns, details, id', () => {
    const cap = { transparencyEvents: [] as any[], broadcasts: [] as any[] };
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('sentinel.verdict' as never, FULL_VERDICT);

    const logged = cap.transparencyEvents.find(e => e.type === 'sentinel.verdict');
    assert.ok(logged, 'a sentinel.verdict transparency event must be logged');
    assert.equal(logged.filePath, 'src/auth/session.ts',
      'filePath must be sourced from SentinelVerdict.artifactPath (the field that actually exists)');
    assert.equal(logged.summary, FULL_VERDICT.summary, 'the human summary must survive into the log');
    assert.deepEqual(logged.matchedPatterns, ['hardcoded-credential']);
    assert.equal(logged.details, FULL_VERDICT.details);
    assert.equal(logged.id, 'verdict-9f2');
    assert.equal(logged.timestamp, FULL_VERDICT.timestamp,
      'origin timestamp is the deep-link identity and must never be re-clocked');
  });

  test('live broadcast transparency payload is the SAME enriched object as the logged one (no drift)', () => {
    const cap = { transparencyEvents: [] as any[], broadcasts: [] as any[] };
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('sentinel.verdict' as never, FULL_VERDICT);

    const logged = cap.transparencyEvents.find(e => e.type === 'sentinel.verdict');
    const streamed = cap.broadcasts.find(b => b.type === 'transparency');
    assert.ok(streamed, 'a transparency broadcast must be sent');
    assert.deepEqual(streamed.payload, logged,
      'stored log and live stream must carry identical verdict payloads');
  });

  test('legacy producers that already send filePath keep working (alias fallback)', () => {
    const cap = { transparencyEvents: [] as any[], broadcasts: [] as any[] };
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('sentinel.verdict' as never, {
      decision: 'BLOCK', riskGrade: 'L3', filePath: 'src/x.ts', timestamp: '2026-01-01T00:00:00.000Z',
    });
    const logged = cap.transparencyEvents.find(e => e.type === 'sentinel.verdict');
    assert.equal(logged.filePath, 'src/x.ts');
  });
});
