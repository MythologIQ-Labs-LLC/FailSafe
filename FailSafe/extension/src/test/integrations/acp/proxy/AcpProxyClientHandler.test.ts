// Functional tests for AcpProxyClientHandler (GH #172 Part 2). Real governor
// (fake backing) + mock Devin forwarder. SDK types are erased (import type), so
// this runs headlessly with plain-object SDK params.

import { strict as assert } from 'assert';
import { ReceiptContract, ReceiptVerdict } from '../../../../contracts';
import { IGovernanceInterceptor } from '../../../../governance/interceptor/IGovernanceInterceptor';
import { AcpInterceptor } from '../../../../integrations/acp/AcpInterceptor';
import { AcpProxyGovernor } from '../../../../integrations/acp/proxy/AcpProxyGovernor';
import { AcpProxyClientHandler, AcpGovernanceDenied, AcpDevinForwarder } from '../../../../integrations/acp/proxy/AcpProxyClientHandler';

function receipt(v: ReceiptVerdict): ReceiptContract {
  return { receiptId: 'r', evaluationRequestId: 'e', verdict: v, issuedAt: '2026-01-01T00:00:00Z', issuedBy: 't', verdictRationale: `v=${v}` };
}
function backing(v: ReceiptVerdict): IGovernanceInterceptor { return { evaluate: async () => receipt(v) }; }

function setup(verdict: ReceiptVerdict) {
  const calls: string[] = [];
  const devin = {
    requestPermission: async () => { calls.push('rp'); return { outcome: { outcome: 'cancelled' } }; },
    sessionUpdate: async () => { calls.push('su'); },
    writeTextFile: async () => { calls.push('wtf'); return {}; },
    readTextFile: async () => { calls.push('rtf'); return { content: 'relayed' }; },
    createTerminal: async () => { calls.push('ct'); return { terminalId: 'tid' }; },
  } as unknown as AcpDevinForwarder;
  const governor = new AcpProxyGovernor(new AcpInterceptor(backing(verdict)), { effectiveMode: () => ({ mode: 'enforce', enforcing: true }) });
  return { handler: new AcpProxyClientHandler(governor, devin), calls };
}

/** Forwarder without the optional fs capabilities — exercises the no-client-support path. */
function setupNoFsCapability(verdict: ReceiptVerdict) {
  const calls: string[] = [];
  const devin = {
    requestPermission: async () => { calls.push('rp'); return { outcome: { outcome: 'cancelled' } }; },
    sessionUpdate: async () => { calls.push('su'); },
  } as unknown as AcpDevinForwarder;
  const governor = new AcpProxyGovernor(new AcpInterceptor(backing(verdict)), { effectiveMode: () => ({ mode: 'enforce', enforcing: true }) });
  return { handler: new AcpProxyClientHandler(governor, devin), calls };
}

const PERM = {
  sessionId: 's',
  toolCall: { toolCallId: 't', title: 'shell', rawInput: { command: ['/bin/zsh', '-lc', 'rm x'] } },
  options: [
    { optionId: 'ao', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'ro', name: 'Reject once', kind: 'reject_once' },
  ],
} as never;

suite('integrations/acp/proxy AcpProxyClientHandler', () => {
  test('requestPermission: ALLOW verdict → allow_once outcome', async () => {
    const out = await setup('ALLOW').handler.requestPermission(PERM);
    assert.deepEqual(out, { outcome: { outcome: 'selected', optionId: 'ao' } });
  });

  test('requestPermission: BLOCK verdict → reject_once outcome (FailSafe is the authority)', async () => {
    const out = await setup('BLOCK').handler.requestPermission(PERM);
    assert.deepEqual(out, { outcome: { outcome: 'selected', optionId: 'ro' } });
  });

  test('writeTextFile: ALLOW relays to Devin', async () => {
    const { handler, calls } = setup('ALLOW');
    await handler.writeTextFile({ sessionId: 's', path: '/x', content: 'hi' } as never);
    assert.ok(calls.includes('wtf'), 'relayed to Devin');
  });

  test('writeTextFile: BLOCK under enforce → throws AcpGovernanceDenied, NEVER relays', async () => {
    const { handler, calls } = setup('BLOCK');
    await assert.rejects(
      () => handler.writeTextFile({ sessionId: 's', path: '/x', content: 'hi' } as never),
      (e: unknown) => e instanceof AcpGovernanceDenied && /fs\/write_text_file/.test((e as Error).message),
    );
    assert.ok(!calls.includes('wtf'), 'withheld — never relayed');
  });

  test('createTerminal: BLOCK under enforce → throws, never relays', async () => {
    const { handler, calls } = setup('BLOCK');
    await assert.rejects(
      () => handler.createTerminal({ sessionId: 's', command: 'rm', args: ['-rf', '/'] } as never),
      (e: unknown) => e instanceof AcpGovernanceDenied,
    );
    assert.ok(!calls.includes('ct'));
  });

  test('createTerminal: ALLOW relays to Devin', async () => {
    const { handler, calls } = setup('ALLOW');
    const res = await handler.createTerminal({ sessionId: 's', command: 'ls' } as never);
    assert.ok(calls.includes('ct'));
    assert.deepEqual(res, { terminalId: 'tid' });
  });

  test('sessionUpdate + readTextFile are relayed transparently (not governed)', async () => {
    const { handler, calls } = setup('BLOCK'); // even a BLOCK backing — these aren't governed
    await handler.sessionUpdate({} as never);
    const r = await handler.readTextFile({ sessionId: 's', path: '/x' } as never);
    assert.ok(calls.includes('su') && calls.includes('rtf'));
    assert.deepEqual(r, { content: 'relayed' });
  });

  test('writeTextFile: ALLOW but forwarder lacks fs support → throws NO_CLIENT_SUPPORT, does not fabricate success', async () => {
    const { handler } = setupNoFsCapability('ALLOW');
    await assert.rejects(
      () => handler.writeTextFile({ sessionId: 's', path: '/x', content: 'hi' } as never),
      (e: unknown) => e instanceof AcpGovernanceDenied
        && /fs\/write_text_file/.test((e as Error).message)
        && /NO_CLIENT_SUPPORT/.test((e as Error).message),
    );
  });

  test('readTextFile: forwarder lacks fs support → throws NO_CLIENT_SUPPORT, does not fabricate empty-file content', async () => {
    const { handler } = setupNoFsCapability('ALLOW');
    await assert.rejects(
      () => handler.readTextFile({ sessionId: 's', path: '/x' } as never),
      (e: unknown) => e instanceof AcpGovernanceDenied
        && /fs\/read_text_file/.test((e as Error).message)
        && /NO_CLIENT_SUPPORT/.test((e as Error).message),
    );
  });
});
