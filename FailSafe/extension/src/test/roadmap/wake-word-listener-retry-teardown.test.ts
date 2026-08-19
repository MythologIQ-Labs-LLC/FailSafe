// #240 media/voice teardown lifecycle audit (relay cycle #128): WakeWordListener's
// exponential error-retry backoff schedules a bare globalThis.setTimeout that
// destroy()/stop() never cancels. A close/reload arriving between a transient
// recognition error and its scheduled retry leaves that timer alive; when it
// fires later it resurrects a brand-new SpeechRecognition session on an
// operator surface that already believes voice capture was torn down.
import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { WakeWordListener } from "../../../src/roadmap/ui/modules/wake-word-listener.js";

function useFakeTimers() {
  const origSetTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  let now = 0;
  const timers: { id: number; cb: () => void; at: number }[] = [];
  let nextId = 1;

  (globalThis as any).setTimeout = (cb: () => void, ms = 0) => {
    const id = nextId++;
    timers.push({ id, cb, at: now + ms });
    return id;
  };
  (globalThis as any).clearTimeout = (id: number) => {
    const idx = timers.findIndex((t) => t.id === id);
    if (idx !== -1) timers.splice(idx, 1);
  };

  return {
    tick(ms: number) {
      const target = now + ms;
      while (true) {
        const next = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at;
        timers.splice(timers.indexOf(next), 1);
        next.cb();
      }
      now = target;
    },
    pending() { return timers.length; },
    restore() {
      globalThis.setTimeout = origSetTimeout;
      globalThis.clearTimeout = origClearTimeout;
    },
  };
}

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  started = false;
  private _listeners: Record<string, Array<(e?: any) => void>> = {};
  constructor() { FakeRecognition.instances.push(this); }
  addEventListener(type: string, fn: (e?: any) => void) {
    (this._listeners[type] ||= []).push(fn);
  }
  start() { this.started = true; }
  stop() { this.started = false; }
  emit(type: string, ev?: any) {
    for (const fn of [...(this._listeners[type] || [])]) fn(ev);
  }
}

function makeStore(): any {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => { m.set(k, v); } };
}

suite("WakeWordListener — retry timer teardown (#240)", () => {
  let clock: ReturnType<typeof useFakeTimers>;

  setup(() => {
    clock = useFakeTimers();
    FakeRecognition.instances.length = 0;
    (globalThis as any).SpeechRecognition = FakeRecognition;
  });

  teardown(() => {
    delete (globalThis as any).SpeechRecognition;
    clock.restore();
  });

  test("destroy() before a scheduled error-retry fires must not resurrect a new recognition session", () => {
    const wake: any = new WakeWordListener(makeStore());
    wake.setEnabled(true);
    wake.start(() => {}, () => {}, () => "idle");
    assert.strictEqual(FakeRecognition.instances.length, 1, "precondition: one live recognition session");

    // A transient (non-permanent) error schedules a backoff retry.
    FakeRecognition.instances[0].emit("error", { error: "network" });
    assert.strictEqual(clock.pending(), 1, "precondition: retry backoff timer scheduled");

    // Teardown (webview close / extension deactivate) arrives before the retry fires.
    wake.destroy();

    clock.tick(30000);
    assert.strictEqual(
      FakeRecognition.instances.length,
      1,
      "destroy() must cancel the pending retry timer instead of leaking a resurrected recognition session"
    );
  });

  test("stop() while idle (no scheduled retry) remains a no-op on the timer queue", () => {
    const wake: any = new WakeWordListener(makeStore());
    wake.stop();
    assert.strictEqual(clock.pending(), 0);
  });
});
