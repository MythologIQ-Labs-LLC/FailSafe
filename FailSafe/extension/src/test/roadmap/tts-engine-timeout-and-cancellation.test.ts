import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { TtsEngine } from "../../../src/roadmap/ui/modules/tts-engine.js";

function makeStore() {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

// #244 Tranche D follow-up: TtsEngine.speak() has no lower fallback tier
// (unlike WebLlmEngine), so a stalled tts.predict() must still be bounded and
// must not let a superseded attempt resurrect stale state/audio once a newer
// speak() or an explicit stop() has moved on.
class NeverResolvingPiper {
  async init() { /* no-op stub */ }
  predict() { return new Promise(() => { /* never settles, simulating a stuck WASM call */ }); }
}

// Resolvers are keyed by the `text` argument so a test can settle a specific
// in-flight predict() call regardless of call order — real Piper concurrency
// ordering is not something this suite should assume.
class ManualPiper {
  pending: Map<string, (wav: unknown) => void> = new Map();
  async init() { /* no-op stub */ }
  predict({ text }: { text: string }) {
    return new Promise((resolve) => { this.pending.set(text, resolve); });
  }
  resolveFor(text: string, wav: unknown) {
    const r = this.pending.get(text);
    assert.ok(r, `no pending predict() call for text=${JSON.stringify(text)}`);
    this.pending.delete(text);
    r!(wav);
  }
}

async function makeReadyEngine(piperInstance: any, timeoutMs = 15000) {
  const stubLoader = async () => ({
    PiperTTS: class {
      constructor(_opts: unknown) { void _opts; }
      init() { return piperInstance.init(); }
      predict(...args: unknown[]) { return piperInstance.predict(...args); }
    },
  });
  (globalThis as any).fetch = async () => ({ ok: true, headers: { get: () => 'application/javascript' } });
  const tts = new TtsEngine(makeStore(), { loadPiperModule: stubLoader });
  tts.timeoutMs = timeoutMs;
  await tts.init();
  assert.ok(tts.tts, 'engine must be ready before speak() is exercised');
  return tts;
}

suite("TtsEngine predict() timeout boundary (#244 Tranche D)", () => {
  test("a stalled predict() times out with error:tts_timeout instead of hanging forever", async () => {
    const tts = await makeReadyEngine(new NeverResolvingPiper(), 20);
    const events: string[] = [];
    tts.onStateChange = (s: string) => events.push(s);

    await tts.speak('hello');

    assert.deepStrictEqual(events, ['error:tts_timeout']);
    assert.strictEqual(tts.audio, null, 'no Audio object must be created for a timed-out attempt');
  });

  test("stop() called while predict() is still pending immediately surfaces idle (operator-visible cancellation)", async () => {
    const piper = new ManualPiper();
    const tts = await makeReadyEngine(piper, 15000);
    const events: string[] = [];
    tts.onStateChange = (s: string) => events.push(s);

    const speakPromise = tts.speak('hello');
    // predict() has not resolved yet: no Audio exists, so pre-fix stop() was a silent no-op.
    assert.strictEqual(tts.audio, null);
    tts.stop();
    assert.deepStrictEqual(events, ['idle'], 'operator must see the cancellation take effect immediately');

    piper.resolveFor('hello', new Uint8Array([1, 2, 3]));
    await speakPromise;
    assert.strictEqual(tts.audio, null, 'the superseded predict() resolution must not resurrect audio after stop()');
    assert.deepStrictEqual(events, ['idle'], 'the stale predict() resolution must not emit any further state change');
  });

  test("a superseded speak() cannot clobber a later speak() once the stale predict() finally resolves", async () => {
    const piper = new ManualPiper();
    const tts = await makeReadyEngine(piper, 15000);
    const events: string[] = [];
    tts.onStateChange = (s: string) => events.push(s);

    // Stub the browser audio pipeline this Node test environment lacks.
    class FakeAudio {
      constructor(public src: string) {}
      listeners: Record<string, Array<() => void>> = {};
      addEventListener(name: string, fn: () => void) { (this.listeners[name] ||= []).push(fn); }
      async play() { (this.listeners.play || []).forEach((fn) => fn()); }
      pause() {}
    }
    (globalThis as any).Audio = FakeAudio;

    const firstSpeak = tts.speak('first');   // predict() call #1, still pending
    const secondSpeak = tts.speak('second'); // speak() calls stop() first, invalidating #1's token, then issues predict() call #2

    // Resolve the CURRENT (second) attempt first, exactly the order a slow
    // stale call resolving after a fresh one would produce.
    piper.resolveFor('second', new Uint8Array([9, 9]));
    await secondSpeak;
    assert.ok(tts.audio instanceof FakeAudio, 'the current (second) speak() must produce audio');
    const currentAudio = tts.audio;

    piper.resolveFor('first', new Uint8Array([1, 1])); // the superseded first speak's predict() finally settles, late
    await firstSpeak;

    assert.strictEqual(tts.audio, currentAudio, 'the stale first speak() must not replace the current audio when it resolves late');
    delete (globalThis as any).Audio;
  });

  test("a superseded attempt settling late must not clobber a newer attempt's synthesizing flag (silent-no-op regression)", async () => {
    // Reviewer-identified scenario on FailSafe#396: speak('a') -> speak('b')
    // bumps the token; 'a's stale predict settles and, pre-fix, unconditionally
    // set _synthesizing = false — clobbering 'b's still-true flag. A stop()
    // during 'b's pending predict would then see _synthesizing already false
    // and silently do nothing, reproducing the exact no-op this PR fixes.
    const piper = new ManualPiper();
    const tts = await makeReadyEngine(piper, 15000);
    const events: string[] = [];
    tts.onStateChange = (s: string) => events.push(s);

    const speakA = tts.speak('a'); // predict() call #1, still pending
    const speakB = tts.speak('b'); // speak('b') calls stop() first (legitimately supersedes 'a', emitting one idle), then issues predict() call #2

    assert.deepStrictEqual(events, ['idle'], "starting 'b' must supersede 'a' with exactly one idle notification");
    events.length = 0;

    // 'a's stale predict() finally settles while 'b' is still in flight.
    piper.resolveFor('a', new Uint8Array([1]));
    await speakA;
    assert.deepStrictEqual(events, [], 'the stale settlement of a superseded attempt must not emit any further state change');

    // 'b' is the current attempt and must still be seen as synthesizing —
    // pre-fix, 'a's late settlement unconditionally cleared _synthesizing here.
    tts.stop();
    assert.deepStrictEqual(events, ['idle'], "stop() during b's pending predict() must surface idle, not silently no-op");

    piper.resolveFor('b', new Uint8Array([2])); // let 'b' drain so the test doesn't leave a dangling promise
    await speakB;
  });
});
