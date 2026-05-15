import * as assert from "assert";

// whisper-loader's getSpeechRecognitionCtor() resolves at call time, so
// SttEngine + LiveTranscriber load cleanly under Node without browser globals.
// (Removed the legacy `globalThis.SpeechRecognition ??= class {}` stub — it
// leaked an addEventListener-less class into adjacent FX228 tests.)

import { SttEngine } from "../../../src/roadmap/ui/modules/stt-engine.js";

suite("SttEngine Silence Timer Integration", () => {
  let clock: { restore: () => void };
  let engine: any;

  setup(() => {
    clock = useFakeTimers();
    engine = new SttEngine(null);
  });

  teardown(() => {
    engine._silence.clear();
    clock.restore();
  });

  test("_resetSilenceTimer fires onAutoStop after silenceTimeoutMs", () => {
    engine.state = "listening";
    let fired = false;
    engine.onAutoStop = () => { fired = true; };
    engine.stopListening = () => { engine._silence.clear(); };

    engine._resetSilenceTimer();
    (clock as any).tick(engine.silenceTimeoutMs);
    assert.strictEqual(fired, true, "onAutoStop should have fired");
  });

  test("_resetSilenceTimer resets the timer when called again", () => {
    engine.state = "listening";
    let count = 0;
    engine.onAutoStop = () => { count++; };
    engine.stopListening = () => { engine._silence.clear(); };

    engine._resetSilenceTimer();
    (clock as any).tick(3000);
    engine._resetSilenceTimer();
    (clock as any).tick(3000);
    assert.strictEqual(count, 0, "should not have fired yet");
    (clock as any).tick(2000);
    assert.strictEqual(count, 1, "should fire exactly once");
  });

  test("silence timer cleared prevents onAutoStop from firing", () => {
    engine.state = "listening";
    let fired = false;
    engine.onAutoStop = () => { fired = true; };

    engine._resetSilenceTimer();
    engine._silence.clear();
    (clock as any).tick(10000);
    assert.strictEqual(fired, false, "onAutoStop must not fire after clear");
  });

  test("stopListening clears the silence timer", async () => {
    let fired = false;
    engine.state = "listening";
    engine.onAutoStop = () => { fired = true; };
    engine._stopWhisper = async () => {};
    engine._wake = { enabled: false, destroy() {}, stop() {} };

    engine._resetSilenceTimer();
    await engine.stopListening();
    assert.strictEqual(engine._silence._timer, null, "timer should be null");
    (clock as any).tick(10000);
    assert.strictEqual(fired, false, "onAutoStop must not fire after stop");
  });
});

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
    restore() {
      globalThis.setTimeout = origSetTimeout;
      globalThis.clearTimeout = origClearTimeout;
    },
  };
}
