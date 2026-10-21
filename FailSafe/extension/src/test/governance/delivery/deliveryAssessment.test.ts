// #532 (plan-532b LD6, plan-532c LD2/LD5, plan-b320 LD7/LD8): the pure delivery assessment rule, as a table.
//
// Six steps. "recorded" means present, not passed. The review step reads the assessed delivery
// reviews: `passing` only for a current covering PASS; `failing` for any blocking item or the
// intent's own VETO; `stale` when the latest PASS no longer matches the workspace; `missing`
// (awaiting review) otherwise; `unavailable` when the ledger or git cannot be read. An intent PASS
// is approval for implementation, shown as a record, never `passing`. Outcomes: failing, then
// evidence-complete-except-receipt, then awaiting-review, then incomplete. completeReachable is
// derived. The receipt is `unavailable` in every row, with the #467 / B216 reason, and is never a gap.

import { strict as assert } from 'assert';
import {
  assessDelivery, RECEIPT_REASON, REVIEW_AWAITING_REASON,
  type ArchitectureEdgeCheck, type CodeEdgeCheck, type DeliveryInputs, type DeliveryOutcome, type StepKey,
} from '../../../governance/delivery/deliveryAssessment';
import type { GovernanceEvidence } from '../../../governance/delivery/deliveryEvidence';
import type { BlockingItem, ReviewAssessment, ReviewRecordView } from '../../../governance/delivery/deliveryReview';

const ID = '11111111-1111-4111-8111-111111111111';
const SHA = 'b'.repeat(40);
const arch = (status: ArchitectureEdgeCheck['status'], target = 'runtime'): ArchitectureEdgeCheck => ({
  target, docPath: `docs/architecture/${target}.md`, docSha256: 'd'.repeat(64), sourceSha: SHA, status,
});
const code = (status: CodeEdgeCheck['status'], sha = SHA): CodeEdgeCheck => ({ sha, tree: 't'.repeat(40), branch: 'main', status });
const evidence = (n: number): GovernanceEvidence => ({
  state: 'ok', truncated: false, chain: 'unknown', chainReason: 'x', total: n, digest: 'g'.repeat(64), unverifiable: [],
  records: Array.from({ length: n }, (_, i) => ({
    entryId: i + 1, eventType: 'PROVENANCE_RECORDED', timestamp: 't', entryHash: `h${i}`, matchedBy: 'intentId' as const, value: ID,
    kind: 'presence' as const, outcome: null, chain: 'unknown' as const, sealOk: true,
  })),
});
const PASS = { status: 'PASS' as const, actor: 'judge', timestamp: '2026-10-19T00:00:00.000Z', entryHash: 'p'.repeat(64) };
const VETO = { status: 'VETO' as const, actor: 'judge', timestamp: '2026-10-19T01:00:00.000Z', entryHash: 'v'.repeat(64) };

const review = (over: Partial<ReviewRecordView> = {}): ReviewRecordView => ({
  reviewId: '22222222-2222-4222-8222-222222222222', verdict: 'PASS', entryId: 9, entryHash: 'r'.repeat(64), timestamp: '2026-10-20T00:00:00.000Z',
  commitSha: SHA, tree: 't'.repeat(40), branch: 'main', covers: [{ commitSha: SHA, edgeEntryHash: 'e'.repeat(64) }], evidenceDigest: 'g'.repeat(64),
  evidenceCount: 1, supersedes: [], note: '', reviewerDid: 'did:myth:overseer:local',
  authentication: { method: 'vscode-modal-confirmation', channel: 'console:/api/actions/delivery/review', proves: 'A person approved a modal VS Code dialog.' },
  operationId: 'op_x', mirrorEntryHash: 'm'.repeat(64), historyPosition: 3, ...over,
});
const blocking = (kind: BlockingItem['kind'] = 'veto'): BlockingItem => ({
  kind, id: 8, hash: 'h'.repeat(64), label: kind === 'veto' ? 'Rejected by review: VETO on b at t (ledger entry #8).' : 'Review record unverifiable: ledger entry #8 fails its seal.',
  verdict: kind === 'veto' ? 'VETO' : null, commitSha: SHA, commitTrusted: kind === 'veto', timestamp: 't', note: null, after: { ledgerId: 8, historyPosition: null },
});
const none: ReviewAssessment = { state: 'checked', blocking: [], cleared: [], reviews: [], latestPass: null };
const current: ReviewAssessment = { state: 'checked', blocking: [], cleared: [], reviews: [review()], latestPass: { review: review(), current: true, staleReasons: [] } };
const stale: ReviewAssessment = { ...current, latestPass: { review: review(), current: false, staleReasons: ['new governance evidence was recorded since the review'] } };
const vetoed: ReviewAssessment = { state: 'checked', blocking: [blocking('veto')], cleared: [], reviews: [review({ verdict: 'VETO' })], latestPass: null };
const unverifiable: ReviewAssessment = { ...current, blocking: [blocking('bad-seal')] };
const ledgerDown: ReviewAssessment = { state: 'unavailable', cause: 'ledger-unavailable', reason: 'The FailSafe ledger is unavailable.' };
const gitDown: ReviewAssessment = { state: 'unavailable', cause: 'git-unavailable', reason: 'Git could not answer.' };

function inputs(over: Partial<DeliveryInputs> = {}): DeliveryInputs {
  return {
    intentId: ID,
    issue: { provenance: { source: 'jira', key: 'PROJ-1', contentSha256: 'c'.repeat(64) }, createdEntryHash: 'e'.repeat(64) },
    architecture: { state: 'checked', edges: [arch('recorded')] },
    code: { state: 'checked', edges: [code('recorded')] },
    governance: evidence(1),
    decision: null,
    review: none,
    ...over,
  };
}

const statuses = (input: DeliveryInputs): Record<string, string> =>
  Object.fromEntries(assessDelivery(input).steps.map((s) => [s.key, s.status]));

interface Row {
  name: string;
  input: DeliveryInputs;
  steps: Partial<Record<StepKey, string>>;
  overall: DeliveryOutcome;
  gaps: StepKey[];
  reachable?: string[];
}

const ROWS: Row[] = [
  { name: 'every presence step recorded and no review: awaiting review (recorded is not passed)', input: inputs(),
    steps: { issue: 'recorded', architecture: 'recorded', code: 'recorded', review: 'missing', governance: 'recorded' },
    overall: 'awaiting-review', gaps: ['review'] },
  { name: 'a current covering review PASS: evidence complete except the receipt', input: inputs({ review: current }),
    steps: { review: 'passing' }, overall: 'evidence-complete-except-receipt', gaps: [] },
  { name: 'a stale PASS is awaiting review again', input: inputs({ review: stale }),
    steps: { review: 'stale' }, overall: 'awaiting-review', gaps: ['review'] },
  { name: 'a current PASS with another gap is incomplete, not complete', input: inputs({ review: current, governance: evidence(0) }),
    steps: { review: 'passing', governance: 'missing' }, overall: 'incomplete', gaps: ['governance'] },
  { name: 'a review VETO makes review failing and the delivery failing', input: inputs({ review: vetoed }),
    steps: { review: 'failing' }, overall: 'failing', gaps: ['review'] },
  { name: 'an unverifiable record blocks even with a current PASS', input: inputs({ review: unverifiable }),
    steps: { review: 'failing' }, overall: 'failing', gaps: ['review'] },
  { name: 'an intent PASS is approval for implementation, not a review: review stays missing', input: inputs({ decision: PASS }),
    steps: { review: 'missing' }, overall: 'awaiting-review', gaps: ['review'] },
  { name: "the intent's own VETO makes review failing even with a current PASS", input: inputs({ decision: VETO, review: current }),
    steps: { review: 'failing' }, overall: 'failing', gaps: ['review'] },
  { name: 'an unreadable ledger makes review and governance unavailable; complete is not reachable', input: inputs({ review: ledgerDown, governance: { state: 'unavailable', reason: 'no ledger' } }),
    steps: { review: 'unavailable', governance: 'unavailable' }, overall: 'incomplete', gaps: ['review', 'governance'], reachable: ['ledger-unavailable'] },
  { name: 'git that cannot answer ancestry makes review unavailable', input: inputs({ review: gitDown }),
    steps: { review: 'unavailable' }, overall: 'incomplete', gaps: ['review'], reachable: ['git-unavailable'] },
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
  { name: 'LD8: a commit that resolves to another tree is stale', input: inputs({ code: { state: 'checked', edges: [{ ...code('stale'), currentTree: 'u'.repeat(40) }] }, review: current }),
    steps: { code: 'stale' }, overall: 'incomplete', gaps: ['code'] },
  { name: 'git that cannot run is unavailable', input: inputs({ code: { state: 'unavailable', reason: 'git unavailable' } }),
    steps: { code: 'unavailable' }, overall: 'incomplete', gaps: ['code', 'review'], reachable: ['git-unavailable'] },
  { name: 'no governance evidence is missing', input: inputs({ governance: evidence(0) }),
    steps: { governance: 'missing' }, overall: 'incomplete', gaps: ['review', 'governance'] },
  { name: 'every gap is named in step order; a VETO still makes it failing', input: inputs({
    issue: { provenance: null, createdEntryHash: null }, architecture: { state: 'checked', edges: [] },
    code: { state: 'unavailable', reason: 'x' }, governance: evidence(0), decision: VETO,
  }), steps: { issue: 'missing', architecture: 'missing', code: 'unavailable', review: 'failing', governance: 'missing' }, overall: 'failing',
  gaps: ['issue', 'architecture', 'code', 'review', 'governance'], reachable: ['git-unavailable'] },
];

suite('deliveryAssessment (#532 LD6, plan-532c LD2/LD5, plan-b320 LD7/LD8)', () => {
  for (const row of ROWS) {
    test(row.name, () => {
      const out = assessDelivery(row.input);
      assert.deepEqual(out.steps.map((s) => s.key), ['issue', 'architecture', 'code', 'review', 'governance', 'receipt']);
      const got = statuses(row.input);
      for (const [k, v] of Object.entries(row.steps)) assert.equal(got[k], v, `${k} in "${row.name}"`);
      assert.equal(out.overall, row.overall);
      assert.deepEqual(out.gaps, row.gaps);
      assert.deepEqual(out.completeBlockedBy, row.reachable ?? [], 'completeReachable is derived');
      assert.equal(out.completeReachable, !(row.reachable ?? []).length);
      const receipt = out.steps[5];
      assert.equal(receipt.status, 'unavailable', 'the receipt is unavailable in every row');
      assert.equal(receipt.reason, RECEIPT_REASON);
      assert.match(receipt.reason, /#467/);
      assert.match(receipt.reason, /B216/);
      assert.equal(out.intentId, ID);
    });
  }

  test('the review step: awaiting review names the command; PASS of the intent is a record labelled not a review; VETO says intent vetoed and that a status change clears it', () => {
    const awaiting = assessDelivery(inputs()).steps.find((s) => s.key === 'review')!;
    assert.equal(awaiting.reason, REVIEW_AWAITING_REASON);
    assert.match(awaiting.reason, /Record a Delivery Review/);
    assert.deepEqual(awaiting.records, []);
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
    assert.match(veto.reason, /cleared by a later status change/);
    assert.equal(veto.records[0].decision, 'vetoed');
  });

  test('review records: blocking items carry their commit state; reviews carry the reviewer, what the confirmation proves and their currency', () => {
    const r = assessDelivery(inputs({ review: { ...vetoed, blocking: [blocking('veto'), blocking('bad-seal')] } })).steps.find((s) => s.key === 'review')!;
    assert.match(r.reason, /^Rejected by review: VETO/);
    assert.match(r.reason, /and 1 more blocking item\)$/);
    const items = r.records.filter((x) => x.record === 'blocking');
    assert.deepEqual(items.map((x) => x.commitState), ['sealed', 'recorded, unverified']);
    const passing = assessDelivery(inputs({ review: current })).steps.find((s) => s.key === 'review')!;
    assert.match(passing.reason, /^Reviewed: PASS on b{40}/);
    assert.match(passing.reason, /New evidence will need a fresh review/);
    const rec = passing.records.find((x) => x.record === 'review')!;
    assert.equal(rec.reviewerDid, 'did:myth:overseer:local');
    assert.match(String(rec.proves), /modal VS Code dialog/);
    assert.equal(rec.current, true);
    const st = assessDelivery(inputs({ review: stale })).steps.find((s) => s.key === 'review')!;
    assert.match(st.reason, /no longer current: new governance evidence/);
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

  test('the governance step counts the complete set and says how many are not listed', () => {
    const ev = evidence(200);
    const g = assessDelivery(inputs({ governance: { ...(ev as Extract<GovernanceEvidence, { state: 'ok' }>), total: 250, truncated: true } }))
      .steps.find((s) => s.key === 'governance')!;
    assert.match(g.reason, /^250 FailSafe ledger entries name this intent\. Present, not passed\. The newest 200 are listed; 50 more are not\.$/);
  });
});
