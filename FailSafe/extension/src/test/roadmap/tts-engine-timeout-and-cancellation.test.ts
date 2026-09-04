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

// Resolvers/rejecters are keyed by the `text` argument so a test can settle a
// specific in-flight predict() call regardless of call order — real Piper
// concurrency ordering is not something this suite should assume.
class ManualPiper {
  pending: Map<string, { resolve: (wav: unknown) => void; reject: (err: unknown) => void }> = new Map();
  async init() { /* no-op stub */ }
  predict({ text }: { text: string }) {
    return new Promise((resolve, reject) => { this.pending.set(text, { resolve, reject }); });
  }
  resolveFor(text: string, wav: unknown) {
    const r = this.pending.get(text);
    assert.ok(r, `no pending predict() call for text=${JSON.stringify(text)}`);
    this.pending.delete(text);
    r!.resolve(wav);
  }
  rejectFor(text: string, err: unknown) {
    const r = this.pending.get(text);
    assert.ok(r, `no pending predict() call for text=${JSON.stringify(text)}`);
    this.pending.delete(text);
    r!.reject(err);
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
  const tts = new TtsEngine(makeStore(), { loadPiperModule: stubLoader, logger: () => {} });
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

  test("stop() called while predict() is still pending immediately signals idle on the engine's own state channel", async () => {
    // NOTE: this only asserts TtsEngine.onStateChange itself — it does not
    // assert operator-facing UI reach. VoiceController's _wireStateEmit()
    // only forwards a tts 'idle' once its unified state has already reached
    // 'speaking', which never happens during a pending-synthesis cancel, so
    // this signal does not yet propagate to the badge. See the comment on
    // stop() in tts-engine.js.
    const piper = new ManualPiper();
    const tts = await makeReadyEngine(piper, 15000);
    const events: string[] = [];
    tts.onStateChange = (s: string) => events.push(s);

    const speakPromise = tts.speak('hello');
    // predict() has not resolved yet: no Audio exists, so pre-fix stop() was a silent no-op.
    assert.strictEqual(tts.audio, null);
    tts.stop();
    assert.deepStrictEqual(events, ['idle'], 'the engine-level cancellation signal must fire immediately');

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

  test("a superseded attempt that REJECTS late must not clobber a newer attempt's synthesizing flag either (catch-path clobber)", async () => {
    // Same defect class as the success-path clobber test above, but exercised
    // through speak()'s catch branch specifically -- the success path and the
    // catch path are two independent token guards, and the review that caught
    // the original clobber only exercised the success-path one. A rejected
    // predict() lands in the same catch block a real timeout would (withTimeout
    // just races predict() against a timer into the same Promise.race), so this
    // is a deterministic stand-in for a stale timeout settling late, without a
    // real-timer race between two concurrently-timing-out calls.
    const piper = new ManualPiper();
    const tts = await makeReadyEngine(piper, 15000);
    const events: string[] = [];
    tts.onStateChange = (s: string) => events.push(s);

    const speakA = tts.speak('a'); // predict() call #1, still pending
    const speakB = tts.speak('b'); // speak('b') supersedes 'a' (one idle emitted), then issues predict() call #2, still pending

    assert.deepStrictEqual(events, ['idle'], "starting 'b' must supersede 'a' with exactly one idle notification");
    events.length = 0;

    // 'a's stale predict() finally rejects (standing in for a late timeout) while 'b' is still in flight.
    piper.rejectFor('a', new Error('simulated stale predict() failure'));
    await speakA;
    assert.deepStrictEqual(events, [], 'the stale rejection of a superseded attempt must not emit any further state change');

    // 'b' is the current attempt and must still be seen as synthesizing --
    // pre-fix, 'a's late rejection unconditionally cleared _synthesizing here,
    // specifically via the catch-path branch.
    tts.stop();
    assert.deepStrictEqual(events, ['idle'], "stop() during b's pending predict() must surface idle, not silently no-op");

    piper.resolveFor('b', new Uint8Array([2])); // let 'b' drain so the test doesn't leave a dangling promise
    await speakB;
  });
});

// #406: TTS_TIMEOUT_MS (15000ms) was chosen by analogy, not measured against
// real Piper latency. These pin the measurement that will answer it. The
// load-bearing case is the TIMEOUT one: an implementation that samples only
// successful synthesis would omit exactly the slow runs the issue is about,
// and would pass every other test here.
suite("TtsEngine synthesis-latency sampling (#406)", () => {
  test("records duration and text length for a successful synthesis", async () => {
    const piper = new ManualPiper();
    const tts = await makeReadyEngine(piper, 5000);
    let clock = 1000;
    (tts as any)._now = () => clock;

    const speaking = tts.speak('hello world');
    clock = 1400;
    piper.resolveFor('hello world', new Uint8Array([1, 2, 3]));
    await speaking;

    const samples = tts.getLatencySamples();
    assert.strictEqual(samples.length, 1, 'one synthesis, one sample');
    assert.strictEqual(samples[0].ms, 400, 'duration is measured across predict()');
    assert.strictEqual(samples[0].textLength, 'hello world'.length);
    assert.strictEqual(samples[0].outcome, 'ok');
    assert.ok(samples[0].voiceId, 'the voice is recorded — latency is voice-dependent');
  });

  test("records the TIMEOUT path — the case the issue exists to measure", async () => {
    const tts = await makeReadyEngine(new NeverResolvingPiper(), 20);
    const long = 'x'.repeat(800);

    // The clock is injected, as in the success-path test above, for two reasons.
    // 1. Determinism: the previous assertion read the real wall clock against a
    //    20ms bound and went red in CI on timer coarseness (run 33751001155),
    //    blocking an unrelated dependency PR.
    // 2. Falsifiability: the previous assertion was `ms >= 20` where 20 IS the
    //    configured bound, so an implementation that echoed the bound back
    //    instead of measuring elapsed time satisfied it. The advance below is
    //    deliberately NOT 20, so only a real measurement can produce it.
    let clock = 1000;
    (tts as any)._now = () => { const t = clock; clock += 37; return t; };

    await tts.speak(long);

    const samples = tts.getLatencySamples();
    assert.strictEqual(samples.length, 1, 'a timed-out synthesis must still be sampled');
    assert.strictEqual(samples[0].outcome, 'timeout');
    assert.strictEqual(samples[0].textLength, 800,
      'text length is what the latency must be correlated against');
    assert.strictEqual(samples[0].ms, 37,
      'elapsed time is measured, not the configured 20ms bound echoed back');
  });

  test("tags a superseded attempt distinctly so it can be excluded from the distribution", async () => {
    const piper = new ManualPiper();
    const tts = await makeReadyEngine(piper, 5000);

    const first = tts.speak('first');
    const second = tts.speak('second');           // supersedes the first
    piper.resolveFor('first', new Uint8Array([1]));
    piper.resolveFor('second', new Uint8Array([2]));
    await Promise.all([first, second]);

    const outcomes = tts.getLatencySamples().map((s: any) => s.outcome);
    assert.ok(outcomes.includes('superseded'),
      'a discarded attempt is recorded but tagged, not silently dropped nor counted as ok');
    assert.ok(outcomes.includes('ok'));
  });

  test("the sample ring is bounded so a long session cannot grow it without limit", async () => {
    const piper = new ManualPiper();
    const tts = await makeReadyEngine(piper, 5000);
    for (let i = 0; i < 55; i++) {
      const p = tts.speak(`t${i}`);
      piper.resolveFor(`t${i}`, new Uint8Array([1]));
      await p;
    }
    assert.strictEqual(tts.getLatencySamples().length, 50, 'ring caps at LATENCY_RING_MAX');
  });

  test("a faulty sample sink cannot break synthesis", async () => {
    const piper = new ManualPiper();
    const stubLoader = async () => ({
      PiperTTS: class {
        constructor(_o: unknown) { void _o; }
        init() { return piper.init(); }
        predict(args: { text: string }) { return piper.predict(args); }
      },
    });
    (globalThis as any).fetch = async () => ({ ok: true, headers: { get: () => 'application/javascript' } });
    const tts = new TtsEngine(makeStore(), {
      loadPiperModule: stubLoader,
      onLatencySample: () => { throw new Error('sink exploded'); },
    });
    tts.timeoutMs = 5000;
    await tts.init();

    const speaking = tts.speak('resilient');
    piper.resolveFor('resilient', new Uint8Array([1]));
    await speaking;   // must not reject

    assert.strictEqual(tts.getLatencySamples().length, 1, 'the sample is still retained');
  });
});
