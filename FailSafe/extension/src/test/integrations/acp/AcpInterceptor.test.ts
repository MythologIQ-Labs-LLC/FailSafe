// Functional tests for AcpInterceptor (GH #172). Uses a fake backing
// IGovernanceInterceptor (no EnforcementEngine) and the REAL evaluation_request
// AJV validation, mirroring the McpInterceptor test posture.

import { strict as assert } from 'assert';
import { EvaluationRequestContract, ReceiptContract, ReceiptVerdict } from '../../../contracts';
import { IGovernanceInterceptor } from '../../../governance/interceptor/IGovernanceInterceptor';
import { AcpInterceptor } from '../../../integrations/acp/AcpInterceptor';
import { AcpGovernableIntent } from '../../../integrations/acp/acpTypes';

function receipt(verdict: ReceiptVerdict): ReceiptContract {
  return { receiptId: 'r', evaluationRequestId: 'e', verdict, issuedAt: '2026-01-01T00:00:00Z', issuedBy: 'test' };
}

function fakeBacking(verdict: ReceiptVerdict, captured: EvaluationRequestContract[]): IGovernanceInterceptor {
  return { evaluate: async (req) => { captured.push(req); return receipt(verdict); } };
}

const FS_WRITE: AcpGovernableIntent = { type: 'fs_write', params: { sessionId: 's', path: '/abs/x.ts', content: 'hi' } };

suite('integrations/acp AcpInterceptor', () => {
  test('well-formed intent dispatches to the backing and returns its receipt verdict', async () => {
    const captured: EvaluationRequestContract[] = [];
    const out = await new AcpInterceptor(fakeBacking('ALLOW', captured)).intercept(FS_WRITE);
    assert.equal(out.verdict, 'ALLOW');
    assert.equal(captured.length, 1, 'backing invoked once');
  });

  test('emits a DISTINCT acp_* action.kind (ledger fidelity, not flat tool_call)', async () => {
    const captured: EvaluationRequestContract[] = [];
    await new AcpInterceptor(fakeBacking('ALLOW', captured)).intercept(FS_WRITE);
    assert.equal(captured[0].action.kind, 'acp_fs_write');
    assert.equal(captured[0].action.target, '/abs/x.ts');
    assert.equal(captured[0].agentDid, 'did:failsafe:agent:acp');
  });

  test('each intent type maps to its own kind', async () => {
    const cap: EvaluationRequestContract[] = [];
    const i = new AcpInterceptor(fakeBacking('ALLOW', cap));
    await i.intercept({ type: 'tool_call', toolCall: { toolCallId: 't' } });
    await i.intercept({ type: 'terminal_create', params: { sessionId: 's', command: 'ls' } });
    await i.intercept({ type: 'permission', request: { sessionId: 's', options: [] } });
    assert.deepEqual(cap.map((r) => r.action.kind), ['acp_tool_call', 'acp_terminal_create', 'acp_permission']);
  });

  test('malformed intent → QUARANTINE WITHOUT invoking the backing (fail-closed)', async () => {
    const captured: EvaluationRequestContract[] = [];
    const bad = { type: 'fs_write', params: { sessionId: 's', path: '', content: 'x' } } as AcpGovernableIntent;
    const out = await new AcpInterceptor(fakeBacking('ALLOW', captured)).intercept(bad);
    assert.equal(out.verdict, 'QUARANTINE');
    assert.equal(captured.length, 0, 'backing NOT invoked on malformed intent');
    assert.match(out.verdictRationale || '', /malformed ACP intent/);
  });

  test('unknown intent type → QUARANTINE without invoking the backing', async () => {
    const captured: EvaluationRequestContract[] = [];
    const out = await new AcpInterceptor(fakeBacking('ALLOW', captured)).intercept({ type: 'mystery' } as unknown as AcpGovernableIntent);
    assert.equal(out.verdict, 'QUARANTINE');
    assert.equal(captured.length, 0);
  });

  test('a BLOCK verdict from the backing is passed straight through', async () => {
    const out = await new AcpInterceptor(fakeBacking('BLOCK', [])).intercept(FS_WRITE);
    assert.equal(out.verdict, 'BLOCK');
  });
});
