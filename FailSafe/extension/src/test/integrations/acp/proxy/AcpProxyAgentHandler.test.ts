// Functional tests for AcpProxyAgentHandler (GH #172 Part 2): transparent
// client→agent relay + lazy forwarder resolution (the circular-wiring contract).
// SDK types are erased (import type), so this runs headlessly with plain objects.

import { strict as assert } from 'assert';
import { AcpProxyAgentHandler, AcpAgentForwarder } from '../../../../integrations/acp/proxy/AcpProxyAgentHandler';

function fakeAgent() {
  const calls: Array<[string, unknown]> = [];
  const tag = (name: string, ret: unknown) => async (p: unknown) => { calls.push([name, p]); return ret; };
  const agent = {
    initialize: tag('initialize', { protocolVersion: 1 }),
    newSession: tag('newSession', { sessionId: 's1' }),
    authenticate: tag('authenticate', undefined),
    prompt: tag('prompt', { stopReason: 'end_turn' }),
    cancel: tag('cancel', undefined),
    setSessionMode: tag('setSessionMode', undefined),
    // loadSession / listSessions / resumeSession intentionally ABSENT (agent lacks the cap)
  } as unknown as AcpAgentForwarder;
  return { agent, calls };
}

suite('integrations/acp/proxy AcpProxyAgentHandler', () => {
  test('relays the required client→agent methods verbatim', async () => {
    const { agent, calls } = fakeAgent();
    const h = new AcpProxyAgentHandler(() => agent);
    assert.deepEqual(await h.initialize({ protocolVersion: 1 } as never), { protocolVersion: 1 });
    assert.deepEqual(await h.newSession({ cwd: '/x', mcpServers: [] } as never), { sessionId: 's1' });
    assert.deepEqual(await h.prompt({ sessionId: 's1', prompt: [] } as never), { stopReason: 'end_turn' });
    await h.cancel({ sessionId: 's1' } as never);
    await h.authenticate({ methodId: 'm' } as never);
    assert.deepEqual(calls.map((c) => c[0]), ['initialize', 'newSession', 'prompt', 'cancel', 'authenticate']);
  });

  test('forwarder is resolved LAZILY (not at construction) — supports circular wiring', async () => {
    let resolverCalls = 0;
    const holder: { target?: AcpAgentForwarder } = {};
    const h = new AcpProxyAgentHandler(() => { resolverCalls++; return holder.target!; });
    assert.equal(resolverCalls, 0, 'resolver not called at construction');
    // wire the target AFTER the handler exists (mirrors AcpProxyMain)
    const { agent, calls } = fakeAgent();
    holder.target = agent;
    await h.initialize({ protocolVersion: 1 } as never);
    await h.prompt({ sessionId: 's', prompt: [] } as never);
    assert.equal(resolverCalls, 1, 'resolver invoked once, cached thereafter');
    assert.equal(calls.length, 2);
  });

  test('an optional method the agent does not support throws (not a silent no-op)', async () => {
    const { agent } = fakeAgent();
    const h = new AcpProxyAgentHandler(() => agent);
    await assert.rejects(() => h.loadSession({ sessionId: 's' } as never), /loadSession not supported/);
  });

  test('setSessionMode relays when the agent supports it', async () => {
    const { agent, calls } = fakeAgent();
    const h = new AcpProxyAgentHandler(() => agent);
    await h.setSessionMode({ sessionId: 's', modeId: 'code' } as never);
    assert.ok(calls.some((c) => c[0] === 'setSessionMode'));
  });
});
