// Functional tests for AcpProxyForwarder (GH #172 Part 2): the terminalId→handle
// map lifecycle + transparent relay of the non-terminal client methods. SDK types
// are erased (import type) — a mock connection + mock handles drive it headlessly.

import { strict as assert } from 'assert';
import {
  AcpProxyForwarder, AcpAgentSideConnLike, AcpTerminalHandleLike,
} from '../../../../integrations/acp/proxy/AcpProxyForwarder';

function fakeHandle(id: string, log: string[]): AcpTerminalHandleLike {
  return {
    id,
    currentOutput: async () => { log.push(`out:${id}`); return { output: `o-${id}`, truncated: false } as never; },
    waitForExit: async () => { log.push(`wait:${id}`); return { exitCode: 0 } as never; },
    kill: async () => { log.push(`kill:${id}`); return {} as never; },
    release: async () => { log.push(`release:${id}`); },
  };
}

function setup() {
  const log: string[] = [];
  let seq = 0;
  const conn = {
    requestPermission: async () => { log.push('rp'); return { outcome: { outcome: 'cancelled' } }; },
    sessionUpdate: async () => { log.push('su'); },
    writeTextFile: async () => { log.push('wtf'); return {}; },
    readTextFile: async () => { log.push('rtf'); return { content: 'c' }; },
    createTerminal: async () => { const h = fakeHandle(`t${++seq}`, log); log.push(`create:${h.id}`); return h; },
    extMethod: async (m: string) => { log.push(`ext:${m}`); return { ok: true }; },
    extNotification: async () => { log.push('extn'); },
  } as unknown as AcpAgentSideConnLike;
  return { fwd: new AcpProxyForwarder(conn), log };
}

suite('integrations/acp/proxy AcpProxyForwarder', () => {
  test('createTerminal stores the handle and returns its id', async () => {
    const { fwd, log } = setup();
    const res = await fwd.createTerminal({ sessionId: 's', command: 'ls' } as never);
    assert.deepEqual(res, { terminalId: 't1' });
    assert.ok(log.includes('create:t1'));
  });

  test('terminal lifecycle resolves the stored handle by terminalId', async () => {
    const { fwd, log } = setup();
    const { terminalId } = await fwd.createTerminal({ sessionId: 's', command: 'ls' } as never);
    await fwd.terminalOutput({ sessionId: 's', terminalId } as never);
    await fwd.waitForTerminalExit({ sessionId: 's', terminalId } as never);
    await fwd.killTerminal({ sessionId: 's', terminalId } as never);
    assert.deepEqual(log.filter((l) => l.endsWith(':t1')), ['create:t1', 'out:t1', 'wait:t1', 'kill:t1']);
  });

  test('two terminals are tracked independently', async () => {
    const { fwd } = setup();
    const a = await fwd.createTerminal({ sessionId: 's', command: 'a' } as never);
    const b = await fwd.createTerminal({ sessionId: 's', command: 'b' } as never);
    assert.notEqual(a.terminalId, b.terminalId);
    const oa = await fwd.terminalOutput({ sessionId: 's', terminalId: a.terminalId } as never);
    assert.equal((oa as { output: string }).output, 'o-t1');
  });

  test('releaseTerminal frees the handle — subsequent use throws', async () => {
    const { fwd, log } = setup();
    const { terminalId } = await fwd.createTerminal({ sessionId: 's', command: 'ls' } as never);
    await fwd.releaseTerminal({ sessionId: 's', terminalId } as never);
    assert.ok(log.includes('release:t1'));
    await assert.rejects(() => fwd.terminalOutput({ sessionId: 's', terminalId } as never), /unknown terminalId/);
  });

  test('lifecycle on an unknown terminalId throws (no silent success)', async () => {
    const { fwd } = setup();
    await assert.rejects(() => fwd.terminalOutput({ sessionId: 's', terminalId: 'ghost' } as never), /unknown terminalId/);
  });

  test('non-terminal client methods relay straight to the connection', async () => {
    const { fwd, log } = setup();
    await fwd.requestPermission({ sessionId: 's', options: [] } as never);
    await fwd.sessionUpdate({ sessionId: 's' } as never);
    await fwd.writeTextFile({ sessionId: 's', path: '/x', content: 'h' } as never);
    await fwd.readTextFile({ sessionId: 's', path: '/x' } as never);
    await fwd.extMethod('custom/x', {});
    assert.deepEqual(log, ['rp', 'su', 'wtf', 'rtf', 'ext:custom/x']);
  });
});
