/**
 * #538 lane B (plan-538b LD8), #514 residual: an L3 decision records how it was
 * authenticated. The descriptor is passed through `as never` so this suite runs on
 * the source before the change, where the third argument was `conditions`.
 */
import { strict as assert } from 'assert';
import { L3ApprovalService } from '../../qorelogic/L3ApprovalService';
import { QorLogicManager } from '../../qorelogic/QorLogicManager';
import { EventBus } from '../../shared/EventBus';

const REQ = {
  agentDid: 'did:t:agent-1', agentTrust: 0.8, filePath: 'src/foo.ts',
  riskGrade: 'L3' as const, sentinelSummary: 'critical issue', flags: ['F1'],
};

const MODAL_PROVES = 'A person approved a modal VS Code dialog. This does not identify which local process sent the request.';
const WEBVIEW_PROVES = 'A person clicked Approve or Reject in the FailSafe L3 approval panel inside VS Code.';
const UNVERIFIED_PROVES = 'No human confirmation was recorded for this decision.';

function service(): { svc: L3ApprovalService; ledgerCalls: any[] } {
  const ledgerCalls: any[] = [];
  const state: any = { l3Queue: [] };
  const svc = new L3ApprovalService(
    { get: <T>(k: string, def: T) => (state[k] ?? def) as T, update: async (k: string, v: any) => { state[k] = v; } } as any,
    { getConfig: () => ({ qorelogic: { l3SLA: 3600 } }) } as any,
    { appendEntry: async (e: any) => { ledgerCalls.push(e); return { id: ledgerCalls.length }; } } as any,
    { updateTrust: async () => undefined } as any,
    new EventBus(),
  );
  return { svc, ledgerCalls };
}

const decide = (svc: L3ApprovalService, id: string, decision: 'APPROVED' | 'REJECTED', auth: unknown, conditions?: string[]) =>
  (svc.processL3Decision as unknown as (...a: unknown[]) => Promise<void>)(id, decision, auth, conditions);

suite('#538 L3 decisions record how they were authenticated', () => {
  const rows: Array<[string, string, 'APPROVED' | 'REJECTED', string, string]> = [
    ['vscode-modal-confirmation', 'console:/api/actions/decide-l3', 'APPROVED', 'L3_APPROVED', MODAL_PROVES],
    ['vscode-modal-confirmation', 'console:/api/actions/approve-l3-batch', 'REJECTED', 'L3_REJECTED', MODAL_PROVES],
    ['vscode-webview', 'vscode:l3-approval-panel', 'APPROVED', 'L3_APPROVED', WEBVIEW_PROVES],
    ['unverified-loopback', 'test:caller', 'REJECTED', 'L3_REJECTED', UNVERIFIED_PROVES],
  ];
  for (const [method, channel, decision, eventType, proves] of rows) {
    test(`${method} on ${channel} is recorded in the ${eventType} payload`, async () => {
      const { svc, ledgerCalls } = service();
      const id = await svc.queueL3Approval(REQ);
      await decide(svc, id, decision, { method, channel });
      const entry = ledgerCalls.find((c) => c.eventType === eventType);
      assert.ok(entry, `${eventType} appended`);
      assert.deepEqual(entry.payload.authentication, { method, channel, proves });
    });
  }

  test('an unrecognised method is recorded as unverified-loopback', async () => {
    const { svc, ledgerCalls } = service();
    const id = await svc.queueL3Approval(REQ);
    await decide(svc, id, 'APPROVED', { method: 'trust-me', channel: 'somewhere' });
    const entry = ledgerCalls.find((c) => c.eventType === 'L3_APPROVED');
    assert.deepEqual(entry.payload.authentication, { method: 'unverified-loopback', channel: 'somewhere', proves: UNVERIFIED_PROVES });
  });

  test('conditions move to the fourth argument and are still recorded', async () => {
    const { svc, ledgerCalls } = service();
    const id = await svc.queueL3Approval(REQ);
    await decide(svc, id, 'APPROVED', { method: 'vscode-webview', channel: 'vscode:l3-approval-panel' }, ['keep tests green']);
    const entry = ledgerCalls.find((c) => c.eventType === 'L3_APPROVED');
    assert.deepEqual(entry.payload.conditions, ['keep tests green']);
    assert.equal(entry.payload.authentication.method, 'vscode-webview');
  });

  test('QorLogicManager forwards the authentication and the conditions', async () => {
    const ledgerCalls: any[] = [];
    const mgr = new QorLogicManager(
      { get: <T>(_k: string, def: T) => def, update: async () => undefined } as any,
      { getConfig: () => ({ qorelogic: { l3SLA: 3600 } }) } as any,
      { appendEntry: async (e: any) => { ledgerCalls.push(e); return { id: ledgerCalls.length }; } } as any,
      { updateTrust: async () => undefined } as any,
      {} as any, {} as any, new EventBus(),
    );
    const id = await mgr.queueL3Approval({ ...REQ });
    await (mgr.processL3Decision as unknown as (...a: unknown[]) => Promise<void>)(
      id, 'APPROVED', { method: 'vscode-modal-confirmation', channel: 'console:/api/actions/decide-l3' }, ['c1'],
    );
    const entry = ledgerCalls.find((c) => c.eventType === 'L3_APPROVED');
    assert.equal(entry.payload.authentication.method, 'vscode-modal-confirmation');
    assert.deepEqual(entry.payload.conditions, ['c1']);
  });
});
