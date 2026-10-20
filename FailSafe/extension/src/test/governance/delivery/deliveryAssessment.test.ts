// #532 (plan-532b LD6, plan-532c LD2/LD5/LD10): the pure delivery assessment rule, as a table.
//
// Six steps. "recorded" means present, not passed. The review step reads `missing` (B320/B321)
// unless the intent was vetoed (`failing`); an intent PASS is approval for implementation, shown
// as a record, never `passing`. No input yields evidence-complete-except-receipt in this slice.
// The receipt is `unavailable` in every row, with the #467 / B216 reason, and is never a gap.

import { strict as assert } from 'assert';
import {
  assessDelivery, COMPLETE_BLOCKED_BY, RECEIPT_REASON, REVIEW_MISSING_REASON,
  type ArchitectureEdgeCheck, type CodeEdgeCheck, type DeliveryInputs, type StepKey,
} from '../../../governance/delivery/deliveryAssessment';
import type { GovernanceEvidence } from '../../../governance/delivery/deliveryEvidence';

const ID = '11111111-1111-4111-8111-111111111111';
const SHA = 'b'.repeat(40);
const arch = (status: ArchitectureEdgeCheck['status'], target = 'runtime'): ArchitectureEdgeCheck => ({
  target, docPath: `docs/architecture/${target}.md`, docSha256: 'd'.repeat(64), sourceSha: SHA, status,
});
const code = (status: CodeEdgeCheck['status'], sha = SHA): CodeEdgeCheck => ({ sha, tree: 't'.repeat(40), branch: 'main', status });
const evidence = (n: number): GovernanceEvidence => ({
  state: 'ok', truncated: false, chain: 'unknown', chainReason: 'x',
  records: Array.from({ length: n }, (_, i) => ({
    entryId: i + 1, eventType: 'PROVENANCE_RECORDED', timestamp: 't', entryHash: `h${i}`, matchedBy: 'intentId' as const, value: ID,
    kind: 'presence' as const, outcome: null, chain: 'unknown' as const,
  })),
});
const PASS = { status: 'PASS' as const, actor: 'judge', timestamp: '2026-10-19T00:00:00.000Z', entryHash: 'p'.repeat(64) };
const VETO = { status: 'VETO' as const, actor: 'judge', timestamp: '2026-10-19T01:00:00.000Z', entryHash: 'v'.repeat(64) };

function inputs(over: Partial<DeliveryInputs> = {}): DeliveryInputs {
  return {
    intentId: ID,
    issue: { provenance: { source: 'jira', key: 'PROJ-1', contentSha256: 'c'.repeat(64) }, createdEntryHash: 'e'.repeat(64) },
    architecture: { state: 'checked', edges: [arch('recorded')] },
    code: { state: 'checked', edges: [code('recorded')] },
    governance: evidence(1),
    decision: null,
    ...over,
  };
}

const statuses = (input: DeliveryInputs): Record<string, string> =>
  Object.fromEntries(assessDelivery(input).steps.map((s) => [s.key, s.status]));

interface Row {
  name: string;
  input: DeliveryInputs;
  steps: Partial<Record<StepKey, string>>;
  overall: 'incomplete' | 'failing';
  gaps: StepKey[];
}

const ROWS: Row[] = [
  { name: 'every presence step recorded: review missing, incomplete (recorded is not passed)', input: inputs(),
    steps: { issue: 'recorded', architecture: 'recorded', code: 'recorded', review: 'missing', governance: 'recorded' },
    overall: 'incomplete', gaps: ['review'] },
  { name: 'an intent PASS is approval for implementation, not a review: review stays missing', input: inputs({ decision: PASS }),
    steps: { review: 'missing' }, overall: 'incomplete', gaps: ['review'] },
  { name: 'a standing VETO makes review failing and the delivery failing', input: inputs({ decision: VETO }),
    steps: { review: 'failing' }, overall: 'failing', gaps: ['review'] },
  { name: 'issue without provenance is missing', input: inputs({ issue: { provenance: null, createdEntryHash: 'e'.repeat(64) } }),
    steps: { issue: 'missing' }, overall: 'incomplete', gaps: ['issue', 'review'] },
  { name: 'provenance without contentSha256 is missing', input: inputs({ issue: { provenance: { source: 'jira' }, createdEntryHash: null } }),
    steps: { issue: 'missing' }, overall: 'incomplete', gaps: ['issue', 'review'] },
  { name: 'no architecture edge is missing', input: inputs({ architecture: { state: 'checked', edges: [] } }),
    steps: { architecture: 'missing' }, overall: 'incomplete', gaps: ['architecture', 'review'] },
  { name: 'a stale architecture edge is stale', input: inputs({ architecture: { state: 'checked', edges: [arch('recorded'), arch('stale', 'b')] } }),
    steps: { architecture: 'stale' }, overall: 'incomplete', gaps: ['architecture', 'review'] },
  { name: 'a missing edge wins over a stale one', input: inputs({ architecture: { state: 'checked', edges: [arch('stale'), arch('missing', 'b')] } }),
    steps: { architecture: 'missing' }, overall: 'incomplete', gaps: ['architecture', 'review'] },
  { name: 'architecture discovery that cannot run is unavailable', input: inputs({ architecture: { state: 'unavailable', reason: 'no-git' } }),
    steps: { architecture: 'unavailable' }, overall: 'incomplete', gaps: ['architecture', 'review'] },
  { name: 'no commit edge is missing', input: inputs({ code: { state: 'checked', edges: [] } }),
    steps: { code: 'missing' }, overall: 'incomplete', gaps: ['code', 'review'] },
  { name: 'an unresolvable commit is missing', input: inputs({ code: { state: 'checked', edges: [code('recorded'), code('missing', 'c'.repeat(40))] } }),
    steps: { code: 'missing' }, overall: 'incomplete', gaps: ['code', 'review'] },
  { name: 'git that cannot run is unavailable', input: inputs({ code: { state: 'unavailable', reason: 'git unavailable' } }),
    steps: { code: 'unavailable' }, overall: 'incomplete', gaps: ['code', 'review'] },
  { name: 'no governance evidence is missing', input: inputs({ governance: evidence(0) }),
    steps: { governance: 'missing' }, overall: 'incomplete', gaps: ['review', 'governance'] },
  { name: 'an unavailable ledger is unavailable, never missing', input: inputs({ governance: { state: 'unavailable', reason: 'no ledger' } }),
    steps: { governance: 'unavailable' }, overall: 'incomplete', gaps: ['review', 'governance'] },
  { name: 'every gap is named in step order; a VETO still makes it failing', input: inputs({
    issue: { provenance: null, createdEntryHash: null }, architecture: { state: 'checked', edges: [] },
    code: { state: 'unavailable', reason: 'x' }, governance: evidence(0), decision: VETO,
  }), steps: { issue: 'missing', architecture: 'missing', code: 'unavailable', review: 'failing', governance: 'missing' }, overall: 'failing',
  gaps: ['issue', 'architecture', 'code', 'review', 'governance'] },
];

suite('deliveryAssessment (#532 LD6, plan-532c LD2/LD5)', () => {
  for (const row of ROWS) {
    test(row.name, () => {
      const out = assessDelivery(row.input);
      assert.deepEqual(out.steps.map((s) => s.key), ['issue', 'architecture', 'code', 'review', 'governance', 'receipt']);
      const got = statuses(row.input);
      for (const [k, v] of Object.entries(row.steps)) assert.equal(got[k], v, `${k} in "${row.name}"`);
      assert.equal(out.overall, row.overall);
      assert.deepEqual(out.gaps, row.gaps);
      assert.equal(out.completeReachable, false, 'complete is unreachable until B320/B321');
      assert.deepEqual(out.completeBlockedBy, ['B320', 'B321']);
      const receipt = out.steps[5];
      assert.equal(receipt.status, 'unavailable', 'the receipt is unavailable in every row');
      assert.equal(receipt.reason, RECEIPT_REASON);
      assert.match(receipt.reason, /#467/);
      assert.match(receipt.reason, /B216/);
      assert.equal(out.intentId, ID);
    });
  }

  test('no input yields passing or evidence-complete-except-receipt', () => {
    for (const decision of [null, PASS, VETO]) {
      const out = assessDelivery(inputs({ decision }));
      assert.notEqual(out.overall, 'evidence-complete-except-receipt');
      assert.ok(!out.steps.some((s) => s.status === 'passing'), 'nothing produces passing in this slice');
    }
    assert.deepEqual([...COMPLETE_BLOCKED_BY], ['B320', 'B321']);
  });

  test('the review step: missing names B320/B321; PASS is a record labelled not a review; VETO says intent vetoed', () => {
    const none = assessDelivery(inputs()).steps.find((s) => s.key === 'review')!;
    assert.equal(none.reason, REVIEW_MISSING_REASON);
    assert.match(none.reason, /B320/);
    assert.match(none.reason, /B321/);
    assert.deepEqual(none.records, []);
    const pass = assessDelivery(inputs({ decision: PASS })).steps.find((s) => s.key === 'review')!;
    assert.equal(pass.status, 'missing');
    assert.equal(pass.records.length, 1);
    assert.equal(pass.records[0].decision, 'approved for implementation (not a review)');
    assert.equal(pass.records[0].actor, 'judge');
    assert.equal(pass.records[0].entryHash, 'p'.repeat(64));
    assert.match(String(pass.records[0].provenance), /not who wrote it/);
    const veto = assessDelivery(inputs({ decision: VETO })).steps.find((s) => s.key === 'review')!;
    assert.equal(veto.status, 'failing');
    assert.match(veto.reason, /^Intent vetoed/);
    assert.equal(veto.records[0].decision, 'vetoed');
  });

  test('each step lists its records: hashes, ids, sha, tree, origin, kind and outcome', () => {
    const out = assessDelivery(inputs({
      architecture: { state: 'checked', edges: [{ ...arch('recorded'), via: 'workspace-delivery' }] },
      code: { state: 'checked', edges: [{ ...code('recorded'), via: 'governed-commit', action: 'organize' }] },
    }));
    const by = Object.fromEntries(out.steps.map((s) => [s.key, s]));
    assert.equal(by.issue.records[0].contentSha256, 'c'.repeat(64));
    assert.equal(by.issue.records[0].createdEntryHash, 'e'.repeat(64));
    assert.equal(by.architecture.records[0].docSha256, 'd'.repeat(64));
    assert.equal(by.architecture.records[0].target, 'runtime');
    assert.equal(by.architecture.records[0].via, 'workspace-delivery');
    assert.equal(by.code.records[0].sha, SHA);
    assert.equal(by.code.records[0].tree, 't'.repeat(40));
    assert.equal(by.code.records[0].via, 'governed-commit');
    assert.equal(by.code.records[0].action, 'organize');
    assert.equal(by.governance.records[0].entryId, 1);
    assert.equal(by.governance.records[0].eventType, 'PROVENANCE_RECORDED');
    assert.equal(by.governance.records[0].kind, 'presence');
    assert.equal(by.governance.records[0].chain, 'unknown');
    assert.deepEqual(by.receipt.records, []);
  });
});
