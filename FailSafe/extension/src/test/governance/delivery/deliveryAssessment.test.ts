// #532 part B (plan-532b LD6/LD10): the pure delivery assessment rule, as a table.
//
// One row per step status and overall outcome. The receipt is `unavailable` in every row,
// with the #467 / B216 reason, and is never a gap.

import { strict as assert } from 'assert';
import {
  assessDelivery, RECEIPT_REASON, type ArchitectureEdgeCheck, type CodeEdgeCheck, type DeliveryInputs, type StepKey,
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
    entryId: i + 1, eventType: 'PROVENANCE_RECORDED', timestamp: 't', entryHash: `h${i}`, matchedBy: 'intentId' as const, value: ID, chain: 'unknown' as const,
  })),
});

function inputs(over: Partial<DeliveryInputs> = {}): DeliveryInputs {
  return {
    intentId: ID,
    issue: { provenance: { source: 'jira', key: 'PROJ-1', contentSha256: 'c'.repeat(64) }, createdEntryHash: 'e'.repeat(64) },
    architecture: { state: 'checked', edges: [arch('recorded')] },
    code: { state: 'checked', edges: [code('recorded')] },
    governance: evidence(1),
    ...over,
  };
}

const statuses = (input: DeliveryInputs): Record<string, string> =>
  Object.fromEntries(assessDelivery(input).steps.map((s) => [s.key, s.status]));

interface Row {
  name: string;
  input: DeliveryInputs;
  steps: Partial<Record<StepKey, string>>;
  overall: 'evidence-complete-except-receipt' | 'incomplete';
  gaps: StepKey[];
}

const ROWS: Row[] = [
  { name: 'every step recorded', input: inputs(), steps: { issue: 'recorded', architecture: 'recorded', code: 'recorded', governance: 'recorded' },
    overall: 'evidence-complete-except-receipt', gaps: [] },
  { name: 'issue without provenance is missing', input: inputs({ issue: { provenance: null, createdEntryHash: 'e'.repeat(64) } }),
    steps: { issue: 'missing' }, overall: 'incomplete', gaps: ['issue'] },
  { name: 'provenance without contentSha256 is missing', input: inputs({ issue: { provenance: { source: 'jira' }, createdEntryHash: null } }),
    steps: { issue: 'missing' }, overall: 'incomplete', gaps: ['issue'] },
  { name: 'no architecture edge is missing', input: inputs({ architecture: { state: 'checked', edges: [] } }),
    steps: { architecture: 'missing' }, overall: 'incomplete', gaps: ['architecture'] },
  { name: 'a stale architecture edge is stale', input: inputs({ architecture: { state: 'checked', edges: [arch('recorded'), arch('stale', 'b')] } }),
    steps: { architecture: 'stale' }, overall: 'incomplete', gaps: ['architecture'] },
  { name: 'a missing edge wins over a stale one', input: inputs({ architecture: { state: 'checked', edges: [arch('stale'), arch('missing', 'b')] } }),
    steps: { architecture: 'missing' }, overall: 'incomplete', gaps: ['architecture'] },
  { name: 'architecture discovery that cannot run is unavailable', input: inputs({ architecture: { state: 'unavailable', reason: 'no-git' } }),
    steps: { architecture: 'unavailable' }, overall: 'incomplete', gaps: ['architecture'] },
  { name: 'no commit edge is missing', input: inputs({ code: { state: 'checked', edges: [] } }),
    steps: { code: 'missing' }, overall: 'incomplete', gaps: ['code'] },
  { name: 'an unresolvable commit is missing', input: inputs({ code: { state: 'checked', edges: [code('recorded'), code('missing', 'c'.repeat(40))] } }),
    steps: { code: 'missing' }, overall: 'incomplete', gaps: ['code'] },
  { name: 'git that cannot run is unavailable', input: inputs({ code: { state: 'unavailable', reason: 'git unavailable' } }),
    steps: { code: 'unavailable' }, overall: 'incomplete', gaps: ['code'] },
  { name: 'no governance evidence is missing', input: inputs({ governance: evidence(0) }),
    steps: { governance: 'missing' }, overall: 'incomplete', gaps: ['governance'] },
  { name: 'an unavailable ledger is unavailable, never missing', input: inputs({ governance: { state: 'unavailable', reason: 'no ledger' } }),
    steps: { governance: 'unavailable' }, overall: 'incomplete', gaps: ['governance'] },
  { name: 'every gap is named in step order', input: inputs({
    issue: { provenance: null, createdEntryHash: null }, architecture: { state: 'checked', edges: [] },
    code: { state: 'unavailable', reason: 'x' }, governance: evidence(0),
  }), steps: { issue: 'missing', architecture: 'missing', code: 'unavailable', governance: 'missing' }, overall: 'incomplete',
  gaps: ['issue', 'architecture', 'code', 'governance'] },
];

suite('deliveryAssessment (#532 LD6)', () => {
  for (const row of ROWS) {
    test(row.name, () => {
      const out = assessDelivery(row.input);
      assert.deepEqual(out.steps.map((s) => s.key), ['issue', 'architecture', 'code', 'governance', 'receipt']);
      const got = statuses(row.input);
      for (const [k, v] of Object.entries(row.steps)) assert.equal(got[k], v, `${k} in "${row.name}"`);
      assert.equal(out.overall, row.overall);
      assert.deepEqual(out.gaps, row.gaps);
      const receipt = out.steps[4];
      assert.equal(receipt.status, 'unavailable', 'the receipt is unavailable in every row');
      assert.equal(receipt.reason, RECEIPT_REASON);
      assert.match(receipt.reason, /#467/);
      assert.match(receipt.reason, /B216/);
      assert.equal(out.intentId, ID);
    });
  }

  test('each step lists its records: hashes, ids, sha and tree', () => {
    const out = assessDelivery(inputs());
    const by = Object.fromEntries(out.steps.map((s) => [s.key, s]));
    assert.equal(by.issue.records[0].contentSha256, 'c'.repeat(64));
    assert.equal(by.issue.records[0].createdEntryHash, 'e'.repeat(64));
    assert.equal(by.architecture.records[0].docSha256, 'd'.repeat(64));
    assert.equal(by.architecture.records[0].target, 'runtime');
    assert.equal(by.code.records[0].sha, SHA);
    assert.equal(by.code.records[0].tree, 't'.repeat(40));
    assert.equal(by.governance.records[0].entryId, 1);
    assert.equal(by.governance.records[0].eventType, 'PROVENANCE_RECORDED');
    assert.equal(by.governance.records[0].chain, 'unknown');
    assert.deepEqual(by.receipt.records, []);
  });
});
