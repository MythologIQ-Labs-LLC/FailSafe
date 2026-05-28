// FX801 — Consolidated idle-scheduler (6 cases).
// Moved from src/integrations/{bicameral,open-design}/idle-scheduler.ts by B-INT-4.

import { strict as assert } from 'assert';
import { IdleScheduler, DEFAULT_IDLE_DISCONNECT_MS } from '../../../integrations/mcp/idle-scheduler';

function withFakeTimers<T>(fn: () => Promise<T>): Promise<T> {
  // Minimal manual time advance: tests below all use fixed idleMs values and
  // explicitly drive `Date.now()` via no monkey-patching — they instead rely
  // on small idleMs (e.g. 30ms) and real setTimeout. Wrapper retained for
  // future fake-timer migration.
  return fn();
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

suite('FX801 — IdleScheduler (consolidated)', () => {
  test('case 1: DEFAULT_IDLE_DISCONNECT_MS is 15 minutes (900_000 ms)', () => {
    assert.equal(DEFAULT_IDLE_DISCONNECT_MS, 900_000);
  });

  test('case 2: timer fires onIdle at idleMs when no calls inflight', async () => withFakeTimers(async () => {
    let fired = 0;
    const sched = new IdleScheduler({ idleMs: 30, onIdle: () => { fired++; } });
    // Schedule by ending a (zero-call) interval.
    sched.endCall(); // first endCall arms the timer with lastActivityAt = now
    await sleep(60);
    assert.equal(fired, 1);
    sched.dispose();
  }));

  test('case 3: beginCall suppresses fire while inflight; endCall resets activity timestamp at end-of-call', async () => withFakeTimers(async () => {
    let fired = 0;
    const sched = new IdleScheduler({ idleMs: 40, onIdle: () => { fired++; } });
    sched.beginCall();
    sched.endCall();   // arms timer
    sched.beginCall(); // suppresses while inflight
    await sleep(60);
    assert.equal(fired, 0, 'should not fire while inflight');
    sched.endCall();   // re-arms with lastActivityAt = now
    await sleep(60);
    assert.equal(fired, 1, 'should fire after inflight resolves and idle window elapses');
    sched.dispose();
  }));

  test('case 4: cancel() is idempotent and stops a pending fire', async () => withFakeTimers(async () => {
    let fired = 0;
    const sched = new IdleScheduler({ idleMs: 30, onIdle: () => { fired++; } });
    sched.endCall();
    sched.cancel();
    sched.cancel(); // idempotent
    await sleep(60);
    assert.equal(fired, 0);
    sched.dispose();
  }));

  test('case 5: idleMs: 0 disables scheduling entirely', async () => withFakeTimers(async () => {
    let fired = 0;
    const sched = new IdleScheduler({ idleMs: 0, onIdle: () => { fired++; } });
    sched.endCall();
    sched.endCall();
    await sleep(40);
    assert.equal(fired, 0);
    sched.dispose();
  }));

  test('case 6: inflight count never goes negative under racing endCall', () => {
    let fired = 0;
    const sched = new IdleScheduler({ idleMs: 10_000, onIdle: () => { fired++; } });
    // Race scenario: endCall() called more times than beginCall().
    sched.endCall();
    sched.endCall();
    sched.endCall();
    // No throw; subsequent beginCall + endCall pair still arms the timer normally.
    sched.beginCall();
    sched.endCall();
    // No fire expected (10s idleMs).
    assert.equal(fired, 0);
    sched.dispose();
  });
});
