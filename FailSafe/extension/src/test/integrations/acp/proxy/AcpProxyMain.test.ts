// Interruption-teardown regression tests for the ACP enforce-proxy transport
// (GH #240 — "integration child process interrupted by close/reload"). The
// proxy runs as a standalone process a host (e.g. Devin) launches and can
// terminate independently of the real-agent child it spawns. These tests
// prove the proxy kills that child on a host-issued SIGTERM/SIGINT or a bare
// stdio close (host disconnect without a signal) instead of orphaning it, and
// that it does not double-kill or leak process-level listeners once the
// child has already exited on its own.

import { strict as assert } from 'assert';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { runAcpProxy, type AcpGovernanceBacking, type RunAcpProxyOptions } from '../../../../integrations/acp/proxy/AcpProxyMain';

function fakeBacking(): AcpGovernanceBacking {
  return {
    governanceInterceptor: { evaluate: async () => ({ verdict: 'ALLOW' } as never) },
    effectiveMode: () => ({ mode: 'observe', enforcing: false }),
  };
}

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stdin = new PassThrough();
  killed = false;
  killCalls = 0;
  kill(): boolean {
    this.killCalls++;
    if (!this.killed) {
      this.killed = true;
      this.emit('exit', 0, null);
    }
    return true;
  }
}

// `runAcpProxy` wires the fake streams into the SDK's NDJSON reader loops,
// which hold the event loop open until the streams are torn down — destroy
// every stream this suite creates so mocha can exit after the run.
let liveStreams: Array<PassThrough> = [];

function setup(child: FakeChild): { incoming: PassThrough; outgoing: PassThrough; signals: EventEmitter } {
  const incoming = new PassThrough();
  const outgoing = new PassThrough();
  // An isolated emitter, never the real `process` — this suite runs alongside
  // other suites in one shared process, and emitting a real 'SIGTERM' there
  // would also reach every other suite's own listeners.
  const signals = new EventEmitter();
  liveStreams.push(incoming, outgoing, child.stdout, child.stdin);
  const opts: RunAcpProxyOptions = {
    incoming,
    outgoing,
    agentCommand: 'fake-agent',
    agentArgs: [],
    backing: fakeBacking(),
    spawnFn: () => child as unknown as ChildProcessWithoutNullStreams,
    signals,
  };
  runAcpProxy(opts);
  return { incoming, outgoing, signals };
}

suite('integrations/acp/proxy AcpProxyMain interruption teardown (GH #240)', () => {
  teardown(() => {
    for (const stream of liveStreams) stream.destroy();
    liveStreams = [];
  });

  test('kills the spawned agent when the proxy process receives SIGTERM', () => {
    const child = new FakeChild();
    const { signals } = setup(child);
    signals.emit('SIGTERM');
    assert.equal(child.killCalls, 1, 'SIGTERM must terminate the orphaned agent child');
  });

  test('kills the spawned agent when the proxy process receives SIGINT', () => {
    const child = new FakeChild();
    const { signals } = setup(child);
    signals.emit('SIGINT');
    assert.equal(child.killCalls, 1, 'SIGINT must terminate the orphaned agent child');
  });

  test('kills the spawned agent when the host closes its stdio without a signal', () => {
    const child = new FakeChild();
    const { incoming } = setup(child);
    incoming.emit('close');
    assert.equal(child.killCalls, 1, 'host stdio close must terminate the orphaned agent child');
  });

  test('does not double-kill and removes its listeners once the child has already exited', () => {
    const child = new FakeChild();
    const { signals } = setup(child);
    assert.equal(signals.listenerCount('SIGTERM'), 1, 'proxy registers exactly one SIGTERM listener');

    child.emit('exit', 0, null); // the real agent exits on its own, not via our kill()
    assert.equal(child.killCalls, 0, 'kill() was never called for a self-terminated child');
    assert.equal(signals.listenerCount('SIGTERM'), 0, 'listener is removed once the child has exited');

    signals.emit('SIGTERM');
    assert.equal(child.killCalls, 0, 'a later SIGTERM must not call kill() on an already-exited child');
  });
});
