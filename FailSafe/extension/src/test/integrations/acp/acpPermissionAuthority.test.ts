// Functional tests for the ACP permission authority (GH #172). verdictToOutcome
// is pure; decidePermission is tested against a fake interceptor (no AJV), incl.
// the argv-array rawInput fixture from cross-client ACP prior art (agent-shell#265).

import { strict as assert } from 'assert';
import { ReceiptContract, ReceiptVerdict } from '../../../contracts';
import { verdictToOutcome, decidePermission } from '../../../integrations/acp/acpPermissionAuthority';
import { AcpPermissionOption, AcpPermissionRequest } from '../../../integrations/acp/acpTypes';

const ALL_OPTIONS: AcpPermissionOption[] = [
  { optionId: 'ao', name: 'Allow once', kind: 'allow_once' },
  { optionId: 'aa', name: 'Allow always', kind: 'allow_always' },
  { optionId: 'ro', name: 'Reject once', kind: 'reject_once' },
  { optionId: 'ra', name: 'Reject always', kind: 'reject_always' },
];

function receipt(verdict: ReceiptVerdict): ReceiptContract {
  return { receiptId: 'r', evaluationRequestId: 'e', verdict, issuedAt: '2026-01-01T00:00:00Z', issuedBy: 'test' };
}

suite('integrations/acp acpPermissionAuthority', () => {
  test('ALLOW selects a permissive option, preferring allow_once (never auto allow_always)', () => {
    assert.deepEqual(verdictToOutcome('ALLOW', ALL_OPTIONS), { outcome: 'selected', optionId: 'ao' });
  });

  test('BLOCK and QUARANTINE select a reject option (prefer reject_once)', () => {
    assert.deepEqual(verdictToOutcome('BLOCK', ALL_OPTIONS), { outcome: 'selected', optionId: 'ro' });
    assert.deepEqual(verdictToOutcome('QUARANTINE', ALL_OPTIONS), { outcome: 'selected', optionId: 'ro' });
  });

  test('ESCALATE conservatively rejects (reject_once) — no ACP pending outcome exists', () => {
    assert.deepEqual(verdictToOutcome('ESCALATE', ALL_OPTIONS), { outcome: 'selected', optionId: 'ro' });
  });

  test('MODIFY denies in the foundation (no ACP narrowing channel)', () => {
    assert.deepEqual(verdictToOutcome('MODIFY', ALL_OPTIONS), { outcome: 'selected', optionId: 'ro' });
  });

  test('ALLOW with no allow option offered → cancelled (safe non-grant)', () => {
    const rejectOnly = ALL_OPTIONS.filter((o) => o.kind.startsWith('reject'));
    assert.deepEqual(verdictToOutcome('ALLOW', rejectOnly), { outcome: 'cancelled' });
  });

  test('BLOCK with no reject option offered → cancelled (never falls through to allow)', () => {
    const allowOnly = ALL_OPTIONS.filter((o) => o.kind.startsWith('allow'));
    assert.deepEqual(verdictToOutcome('BLOCK', allowOnly), { outcome: 'cancelled' });
  });

  test('decidePermission round-trips a verdict through the interceptor to an outcome', async () => {
    const req: AcpPermissionRequest = {
      sessionId: 's',
      toolCall: { toolCallId: 'tc', title: 'shell', rawInput: { command: ['/bin/zsh', '-lc', 'printf x > dummy.txt'] } },
      options: ALL_OPTIONS,
    };
    // Fake interceptor: asserts it receives the permission intent, returns BLOCK.
    let seenType = '';
    const fakeInterceptor = {
      intercept: async (intent: { type: string }) => { seenType = intent.type; return receipt('BLOCK'); },
    } as unknown as import('../../../integrations/acp/AcpInterceptor').AcpInterceptor;
    const outcome = await decidePermission(req, fakeInterceptor);
    assert.equal(seenType, 'permission');
    assert.deepEqual(outcome, { outcome: 'selected', optionId: 'ro' });
  });
});
