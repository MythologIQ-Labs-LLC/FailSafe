// Functional tests for AcpProxyGovernor (GH #172 Part 2): B3 effective-mode
// surfacing + B7 record emission + block semantics. Real AcpInterceptor + fake
// backing IGovernanceInterceptor; no SDK, no transport.

import { strict as assert } from 'assert';
import { ReceiptContract, ReceiptVerdict } from '../../../../contracts';
import { IGovernanceInterceptor } from '../../../../governance/interceptor/IGovernanceInterceptor';
import { AcpInterceptor } from '../../../../integrations/acp/AcpInterceptor';
import { AcpProxyGovernor, AcpEffectiveMode, AcpGovernanceRecord } from '../../../../integrations/acp/proxy/AcpProxyGovernor';
import { AcpPermissionRequest } from '../../../../integrations/acp/acpTypes';

function receipt(verdict: ReceiptVerdict): ReceiptContract {
  return { receiptId: 'r', evaluationRequestId: 'e', verdict, issuedAt: '2026-01-01T00:00:00Z', issuedBy: 'test', verdictRationale: `verdict=${verdict}` };
}
function backing(verdict: ReceiptVerdict): IGovernanceInterceptor {
  return { evaluate: async () => receipt(verdict) };
}
const ENFORCE: AcpEffectiveMode = { mode: 'enforce', enforcing: true };
const OBSERVE: AcpEffectiveMode = { mode: 'observe', enforcing: false };

const REQ: AcpPermissionRequest = {
  sessionId: 's',
  toolCall: { toolCallId: 't', title: 'run', rawInput: { command: ['ls'] } },
  options: [
    { optionId: 'ao', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'ro', name: 'Reject once', kind: 'reject_once' },
  ],
};

function governor(verdict: ReceiptVerdict, mode: AcpEffectiveMode, sink?: AcpGovernanceRecord[]) {
  return new AcpProxyGovernor(new AcpInterceptor(backing(verdict)), {
    effectiveMode: () => mode,
    ledger: sink ? { record: (e) => sink.push(e) } : undefined,
  });
}

suite('integrations/acp/proxy AcpProxyGovernor', () => {
  test('ALLOW under enforce → allow_once outcome, blocked=false, recorded', async () => {
    const sink: AcpGovernanceRecord[] = [];
    const { outcome, record } = await governor('ALLOW', ENFORCE, sink).governPermission(REQ);
    assert.deepEqual(outcome, { outcome: 'selected', optionId: 'ao' });
    assert.equal(record.verdict, 'ALLOW');
    assert.equal(record.blocked, false);
    assert.equal(record.enforcing, true);
    assert.equal(sink.length, 1, 'B7: decision recorded');
  });

  test('BLOCK under enforce → reject_once outcome, blocked=true', async () => {
    const { outcome, record } = await governor('BLOCK', ENFORCE).governPermission(REQ);
    assert.deepEqual(outcome, { outcome: 'selected', optionId: 'ro' });
    assert.equal(record.blocked, true);
  });

  test('B3: ALLOW under OBSERVE keeps the grant but records enforcing=false (not silently enforced)', async () => {
    const { outcome, record } = await governor('ALLOW', OBSERVE).governPermission(REQ);
    assert.deepEqual(outcome, { outcome: 'selected', optionId: 'ao' }, 'observe keeps "do not block"');
    assert.equal(record.enforcing, false, 'B3: non-enforcing surfaced');
    assert.equal(record.effectiveMode, 'observe');
    assert.equal(record.blocked, false, 'observe never withholds');
  });

  test('governEffect: a well-formed fs_write under enforce records an intent decision', async () => {
    const sink: AcpGovernanceRecord[] = [];
    const g = governor('ALLOW', ENFORCE, sink);
    const dec = await g.governEffect({ type: 'fs_write', params: { sessionId: 's', path: '/p', content: 'x' } });
    assert.equal(dec.receipt.verdict, 'ALLOW');
    assert.equal(dec.blocked, false);
    assert.equal(sink[0].kind, 'intent');
  });

  test('governEffect: a malformed intent QUARANTINEs and is WITHHELD under enforce', async () => {
    // empty path → AcpInterceptor QUARANTINEs without invoking the backing.
    const dec = await governor('ALLOW', ENFORCE).governEffect({ type: 'fs_write', params: { sessionId: 's', path: '', content: 'x' } });
    assert.equal(dec.receipt.verdict, 'QUARANTINE');
    assert.equal(dec.blocked, true);
  });

  test('a deny under OBSERVE is NOT withheld (observe = monitor only)', async () => {
    const dec = await governor('BLOCK', OBSERVE).governEffect({ type: 'terminal_create', params: { sessionId: 's', command: 'rm' } });
    assert.equal(dec.blocked, false);
    assert.equal(dec.record.enforcing, false);
  });

  test('a throwing ledger sink never breaks the decision path (degrade safe)', async () => {
    const g = new AcpProxyGovernor(new AcpInterceptor(backing('ALLOW')), {
      effectiveMode: () => ENFORCE,
      ledger: { record: () => { throw new Error('ledger down'); } },
    });
    const { outcome } = await g.governPermission(REQ);
    assert.deepEqual(outcome, { outcome: 'selected', optionId: 'ao' });
  });
});
