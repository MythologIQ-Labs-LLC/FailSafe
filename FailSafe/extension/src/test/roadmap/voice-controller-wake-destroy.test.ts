// FX896 — Voice transition state machine (#236), part 2: wake ownership,
// auto-stop composition, destroy-during-pending-start, settings parity.
// Split from voice-controller-transitions.test.ts to honor the Section 4
// 250-line file cap; shared harness intentionally duplicated (B206 pattern).
import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { VoiceController } from "../../../src/roadmap/ui/modules/voice-controller.js";
// @ts-expect-error JS module import in TS test context
import { applyVoiceSettings } from "../../../src/roadmap/ui/modules/voice-controller-support.js";
// stt-engine.js resolves via the src/types/shims.d.ts wildcard declaration.
import { SttEngine } from "../../../src/roadmap/ui/modules/stt-engine.js";

interface Deferred { promise: Promise<void>; resolve: () => void; reject: (e?: unknown) => void; }
function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flush(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

// Mock pattern per voice-controller-model-swap.test.ts:5-16, extended with
// controllable startListening/stopListening deferreds that flip `stt.state`.
function makeStt(): any {
  const stt: any = {
    onTranscript: null, onStateChange: null, onAutoStop: null,
    onWakeWordTriggered: null, onModelProgress: null,
    onAnalyserCreated: null, onAudioCaptured: null,
    state: 'idle', modelReady: true, loadingStatus: 'ready',
    calls: [] as string[],
    startResult: 'listening', // engine state once startListening settles
    startGate: null as Deferred | null,
    stopGate: null as Deferred | null,
    destroyed: false,
    setSilenceTimeout(ms: number) { stt.calls.push(`setSilenceTimeout:${ms}`); },
    startWakeWordListener() { stt.calls.push('startWakeWordListener'); },
    destroy() { stt.destroyed = true; stt.calls.push('destroy'); },
    teardownPipeline() { stt.calls.push('teardownPipeline'); },
    async init() { stt.calls.push('init'); },
    async startListening() {
      stt.calls.push('startListening');
      if (stt.startGate) await stt.startGate.promise;
      stt.state = stt.startResult;
    },
    async stopListening() {
      stt.calls.push('stopListening');
      if (stt.stopGate) await stt.stopGate.promise;
      stt.state = 'idle';
    },
  };
  return stt;
}
function makeTts(): any { return { onStateChange: null, destroyed: false, destroy() { this.destroyed = true; } }; }
function makeStore(): any {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => { m.set(k, v); }, _map: m };
}
interface UiLog { mic: Array<[unknown, unknown]>; status: string[]; }
function wireUi(ctrl: any): UiLog {
  const log: UiLog = { mic: [], status: [] };
  ctrl.onMicButton = (html: unknown, active: unknown) => log.mic.push([html, active]);
  ctrl.onStatus = (msg: string) => log.status.push(msg);
  return log;
}

suite("FX896 transition legality — wake / auto-stop / destroy / settings", () => {
  test("wake trigger -> CONTROLLER starts listening through the gate; trigger during an active swap starts only after the swap completes", async () => {
    // Controller half of LD7: the mock engine's trigger fires exactly where
    // stt-engine.js:112 now fires it (trigger emission only, no self-start).
    const stt = makeStt();
    const ctrl: any = new VoiceController(stt, makeTts(), makeStore());
    const ui = wireUi(ctrl);
    ctrl.loadSettings();
    assert.strictEqual(typeof stt.onWakeWordTriggered, 'function', 'loadSettings wires the wake handler');
    stt.onWakeWordTriggered();
    await flush();
    assert.ok(stt.calls.includes('startListening'), 'controller-originated, gate-serialized start');
    assert.strictEqual(ctrl.voiceActive, true, 'derived from awaited engine state');
    assert.deepStrictEqual(ui.mic[ui.mic.length - 1], ['⏹️ STOP', true], 'recording UI after successful wake start');
    // Wake during an active swap queues behind it.
    const stt2 = makeStt();
    const initGate = deferred();
    stt2.init = async () => { stt2.calls.push('init'); await initGate.promise; };
    const ctrl2: any = new VoiceController(stt2, makeTts(), makeStore());
    ctrl2.loadSettings();
    const pSwap = ctrl2.swapWhisperModel('Xenova/whisper-base');
    stt2.onWakeWordTriggered();
    await flush();
    assert.ok(!stt2.calls.includes('startListening'), 'wake start must wait for the swap');
    initGate.resolve();
    await pSwap;
    await flush();
    assert.ok(stt2.calls.indexOf('init') < stt2.calls.indexOf('startListening'), 'wake start only after the swap completes');
  });
});

suite("FX896 transition legality — wake / auto-stop / destroy / settings", () => {
  test("engine wake trigger no longer self-starts", async () => {
    // Engine half of LD7 (audit A1, emission-capture form — timing-immune):
    // a real SttEngine whose wake listener is faked; firing the captured
    // trigger must surface onWakeWordTriggered and NEVER emit 'listening'.
    const engine: any = new SttEngine(makeStore());
    let trigger: any = null;
    engine._wake = {
      enabled: false,
      start(onTriggered: () => void) { trigger = onTriggered; },
      stop() { /* noop */ },
      destroy() { /* noop */ },
    };
    const emissions: string[] = [];
    engine.onStateChange = (s: string) => { emissions.push(s); };
    let wakeObserved = 0;
    engine.onWakeWordTriggered = () => { wakeObserved += 1; };
    engine.startWakeWordListener();
    assert.ok(trigger, 'fake wake listener captured the trigger callback');
    trigger!();
    await new Promise((res) => setTimeout(res, 0));
    assert.strictEqual(wakeObserved, 1, 'trigger still surfaces onWakeWordTriggered');
    assert.ok(!emissions.includes('listening'), "engine must never emit 'listening' from a wake trigger");
  });

  test("auto-stop fires -> _lastAnalyser cleared AND settings auto-stop behavior (voiceActive false, LISTEN button) both run", async () => {
    const stt = makeStt();
    const ctrl: any = new VoiceController(stt, makeTts(), makeStore());
    ctrl.loadSettings();
    await ctrl.toggle();
    assert.strictEqual(ctrl.voiceActive, true, 'precondition: recording');
    stt.onAnalyserCreated({ fake: 'analyser' });
    assert.ok(ctrl._lastAnalyser, 'precondition: analyser cached');
    const ui = wireUi(ctrl);
    stt.onAutoStop();
    assert.strictEqual(ctrl._lastAnalyser, null, 'wrapper half: analyser cache cleared (B127)');
    assert.strictEqual(ctrl.voiceActive, false, 'settings half: voiceActive false');
    assert.strictEqual(ctrl.pttActive, false, 'settings half: pttActive false');
    assert.deepStrictEqual(ui.mic[ui.mic.length - 1], ['🎙️ LISTEN', false], 'settings half: LISTEN button');
    assert.ok(ui.status.some((s) => s.includes('Auto-stopped')), 'settings half: auto-stop status');
  });
});

suite("FX896 transition legality — wake / auto-stop / destroy / settings", () => {
  test("destroy during a permanently-pending startListening: engine/tts teardown runs immediately, no unhandled rejection, later settle no-ops", async () => {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown) => { seen.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      const stt = makeStt();
      const tts = makeTts();
      stt.startGate = deferred(); // simulates a getUserMedia prompt that never settles
      const ctrl: any = new VoiceController(stt, tts, makeStore());
      const ui = wireUi(ctrl);
      const p = ctrl.toggle();
      await flush();
      ctrl.destroy();
      assert.strictEqual(stt.destroyed, true, 'stt.destroy runs immediately, not behind the gate (LD8)');
      assert.strictEqual(tts.destroyed, true, 'tts.destroy runs immediately (LD8)');
      stt.startGate.resolve(); // the "later settle" — queued transition must no-op
      await p;
      assert.strictEqual(ctrl.voiceActive, false, 'late settle must not resurrect recording state');
      assert.ok(!ui.mic.some((m) => m[0] === '⏹️ STOP'), 'late settle paints no recording UI');
      await new Promise((res) => setTimeout(res, 0));
      assert.deepStrictEqual(seen, [], 'no unhandled rejection escaped the gate');
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });
});

suite("FX896 transition legality — wake / auto-stop / destroy / settings", () => {
  test("applyVoiceSettings: silence timeout, wake-word toggle, and PTT key reach the engine exactly as loadSettings did", () => {
    // Parity target = pre-#236 loadSettings (voice-controller.js:115-136):
    // silence timeout -> stt.setSilenceTimeout(Number(...)); wake-word-enabled
    // -> stt.startWakeWordListener(). The PTT key was never engine-wired by
    // loadSettings (it lives in the keybinding layer), so parity means
    // applyVoiceSettings adds no engine call for it either.
    const stt = makeStt();
    const store = makeStore();
    store.set('stt-silence-timeout', '7000');
    store.set('wake-word-enabled', 'true');
    store.set('ptt-key', 'Space');
    const ctrl: any = new VoiceController(stt, makeTts(), store);
    const wrapped = stt.onAutoStop;
    ctrl.loadSettings();
    assert.ok(stt.calls.includes('setSilenceTimeout:7000'), 'silence timeout reaches the engine as Number');
    assert.ok(stt.calls.includes('startWakeWordListener'), 'wake toggle starts the listener');
    assert.strictEqual(stt.onAutoStop, wrapped, 'loadSettings no longer reassigns stt.onAutoStop (LD6 sole-assignee)');
    assert.strictEqual(typeof ctrl._onAutoStopSettings, 'function', 'settings behavior lands on the composition hook');
    assert.ok(!stt.calls.some((c: string) => c.includes('Space')), 'PTT key adds no engine call (parity)');
    // Disabled wake stays parity: listener not started.
    const stt2 = makeStt();
    const ctrl2: any = new VoiceController(stt2, makeTts(), makeStore());
    applyVoiceSettings(ctrl2, stt2, makeStore());
    assert.ok(!stt2.calls.includes('startWakeWordListener'), 'wake disabled -> listener not started');
  });
});
