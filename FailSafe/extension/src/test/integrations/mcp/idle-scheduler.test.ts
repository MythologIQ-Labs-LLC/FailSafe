// FX801 — Consolidated idle-scheduler (6 cases).
// Moved from src/integrations/{bicameral,open-design}/idle-scheduler.ts by B-INT-4.
//
// De-flaked: the positive ("should fire") cases previously armed a ~30ms timer
// then asserted after a fixed `sleep(60)`. Under a loaded CI runner (multiple
// test:all jobs competing for CPU) the fixed sleep could resolve before the
// idle callback ran — and IdleScheduler.checkIdle() re-arms when
// `Date.now() - lastActivityAt < idleMs` (sub-ms jitter), pushing the real fire
// past the 60ms window. Both produced a nondeterministic `0 !== 1`. The fix is
// to poll the observable (`fired`) until it reaches the expected value with a
// generous timeout instead of asserting after one fixed sleep. The negative
// ("must not fire") cases keep a bounded wait: a load-delayed timer can only
// fire LATER, so a fixed wait cannot turn a correct no-fire into a false red.

import { strict as assert } from 'assert';
import { IdleScheduler, DEFAULT_IDLE_DISCONNECT_MS } from '../../../integrations/mcp/idle-scheduler';

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** Poll `predicate` until true or `timeoutMs` elapses. Deterministic under load:
 *  a slow runner just polls a few more times rather than failing a fixed wait. */
async function waitFor(predicate: () => boolean, timeoutMs = 2000, intervalMs = 5): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) return; // give up; caller makes the assertion
    await sleep(intervalMs);
  }
}

suite('FX801 — IdleScheduler (consolidated)', () => {
  test('case 1: DEFAULT_IDLE_DISCONNECT_MS is 15 minutes (900_000 ms)', () => {
    assert.equal(DEFAULT_IDLE_DISCONNECT_MS, 900_000);
  });

  test('case 2: timer fires onIdle at idleMs when no calls inflight', async () => {
    let fired = 0;
    const sched = new IdleScheduler({ idleMs: 30, onIdle: () => { fired++; } });
    // Schedule by ending a (zero-call) interval.
    sched.endCall(); // first endCall arms the timer with lastActivityAt = now
    await waitFor(() => fired >= 1);
    assert.equal(fired, 1);
    sched.dispose();
  });

  test('case 3: beginCall suppresses fire while inflight; endCall resets activity timestamp at end-of-call', async () => {
    let fired = 0;
    const sched = new IdleScheduler({ idleMs: 40, onIdle: () => { fired++; } });
    sched.beginCall();
    sched.endCall();   // arms timer
    sched.beginCall(); // suppresses while inflight
    await sleep(120);  // > 2 idle windows: if it were going to fire while inflight, it would have
    assert.equal(fired, 0, 'should not fire while inflight');
    sched.endCall();   // re-arms with lastActivityAt = now
    await waitFor(() => fired >= 1);
    assert.equal(fired, 1, 'should fire after inflight resolves and idle window elapses');
    sched.dispose();
  });

  test('case 4: cancel() is idempotent and stops a pending fire', async () => {
    let fired = 0;
    const sched = new IdleScheduler({ idleMs: 30, onIdle: () => { fired++; } });
    sched.endCall();
    sched.cancel();
    sched.cancel(); // idempotent
    await sleep(120); // > 3 idle windows: a cancelled timer must never fire
    assert.equal(fired, 0);
    sched.dispose();
  });

  test('case 5: idleMs: 0 disables scheduling entirely', async () => {
    let fired = 0;
    const sched = new IdleScheduler({ idleMs: 0, onIdle: () => { fired++; } });
    sched.endCall();
    sched.endCall();
    await sleep(80); // disabled scheduler must never fire
    assert.equal(fired, 0);
    sched.dispose();
  });

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
