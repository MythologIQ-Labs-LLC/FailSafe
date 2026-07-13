// FX896 — Voice transition state machine (#236). Every voice transition
// (toggle / PTT / wake / model swap) serializes through one transition gate;
// voiceActive/pttActive are DERIVED from awaited engine state with rollback.
// Written red-then-green: against the pre-#236 controller the mid-flight,
// rollback, ordering and engine wake self-start pins all fail.

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

suite("FX896 transition legality", () => {
  test("toggle start: voiceActive stays false until startListening resolves with engine state 'listening'", async () => {
    const stt = makeStt();
    stt.startGate = deferred();
    const ctrl: any = new VoiceController(stt, makeTts(), makeStore());
    const p = ctrl.toggle();
    await flush();
    assert.ok(stt.calls.includes('startListening'), 'start entered the engine');
    assert.strictEqual(ctrl.voiceActive, false, 'mid-flight voiceActive must stay false');
    stt.startGate.resolve();
    await p;
    assert.strictEqual(ctrl.voiceActive, true, 'derived true once engine reports listening');
  });

  test("toggle start failure (engine resolves with state 'idle') -> voiceActive false, mic button reset to LISTEN, no recording UI", async () => {
    const stt = makeStt();
    stt.startResult = 'idle';
    const ctrl: any = new VoiceController(stt, makeTts(), makeStore());
    const ui = wireUi(ctrl);
    await ctrl.toggle();
    assert.strictEqual(ctrl.voiceActive, false, 'failed acquisition rolls voiceActive back');
    assert.deepStrictEqual(ui.mic[ui.mic.length - 1], ['🎙️ LISTEN', false], 'mic reset to LISTEN');
    assert.ok(!ui.mic.some((m) => m[0] === '⏹️ STOP'), 'no recording button ever shown');
    assert.ok(!ui.status.includes('Recording...'), 'no recording status ever shown');
  });
});

suite("FX896 transition legality", () => {
  test("startPtt awaits acquisition; failure rolls back pttActive and UI", async () => {
    const stt = makeStt();
    stt.startGate = deferred();
    stt.startResult = 'idle';
    const ctrl: any = new VoiceController(stt, makeTts(), makeStore());
    const ui = wireUi(ctrl);
    let settled = false;
    const p = Promise.resolve(ctrl.startPtt()).then((ok: unknown) => { settled = true; return ok; });
    await flush();
    assert.strictEqual(settled, false, 'startPtt must await acquisition');
    stt.startGate.resolve();
    const ok = await p;
    assert.strictEqual(ok, false, 'failed acquisition reports false');
    assert.strictEqual(ctrl.pttActive, false, 'pttActive rolled back');
    assert.strictEqual(ctrl.voiceActive, false, 'voiceActive rolled back');
    assert.deepStrictEqual(ui.mic[ui.mic.length - 1], ['🎙️ LISTEN', false], 'UI rolled back to LISTEN');
  });

  test("stopPtt: idle UI callbacks fire only AFTER stopListening resolves", async () => {
    const stt = makeStt();
    const ctrl: any = new VoiceController(stt, makeTts(), makeStore());
    await ctrl.startPtt();
    assert.strictEqual(ctrl.pttActive, true, 'precondition: PTT recording active');
    const ui = wireUi(ctrl);
    stt.stopGate = deferred();
    const p = ctrl.stopPtt();
    await flush();
    assert.deepStrictEqual(ui.mic, [], 'no mic callback before stopListening resolves');
    assert.deepStrictEqual(ui.status, [], 'no status callback before stopListening resolves');
    assert.strictEqual(ctrl.pttActive, true, 'pttActive holds until the stop completes');
    stt.stopGate.resolve();
    await p;
    assert.strictEqual(ctrl.pttActive, false, 'pttActive cleared after stop resolves');
    assert.deepStrictEqual(ui.mic[ui.mic.length - 1], ['🎙️ LISTEN', false], 'idle UI painted after stop resolves');
  });
});

suite("FX896 transition legality", () => {
  test("toggle stop keeps active state and recording UI until stopListening resolves", async () => {
    const stt = makeStt();
    const ctrl: any = new VoiceController(stt, makeTts(), makeStore());
    await ctrl.toggle();
    const ui = wireUi(ctrl);
    stt.stopGate = deferred();
    const stopping = ctrl.toggle();
    await flush();
    assert.strictEqual(ctrl.voiceActive, true, "active remains truthful while engine stops");
    assert.deepStrictEqual(ui.mic, [], "idle mic state is not painted early");
    stt.stopGate.resolve();
    await stopping;
    assert.strictEqual(ctrl.voiceActive, false, "inactive only after engine reaches idle");
    assert.deepStrictEqual(ui.mic.at(-1), ["🎙️ LISTEN", false]);
  });

  test("concurrent toggle + swapWhisperModel serialize: second operation observes the first's completed state, no interleaved engine calls", async () => {
    const stt = makeStt();
    stt.startGate = deferred();
    const ctrl: any = new VoiceController(stt, makeTts(), makeStore());
    const p1 = ctrl.toggle();
    const p2 = ctrl.swapWhisperModel('Xenova/whisper-base');
    await flush();
    assert.ok(!stt.calls.includes('teardownPipeline'), 'swap must queue behind the in-flight start');
    stt.startGate.resolve();
    await p1;
    await p2;
    assert.ok(stt.calls.indexOf('startListening') < stt.calls.indexOf('teardownPipeline'),
      'strict order: start completes before swap begins');
    // Queue-semantics pin (declared ux_change): rapid double-toggle = start-then-stop.
    const stt2 = makeStt();
    const ctrl2: any = new VoiceController(stt2, makeTts(), makeStore());
    const q1 = ctrl2.toggle();
    const q2 = ctrl2.toggle();
    await q1;
    await q2;
    assert.strictEqual(ctrl2.voiceActive, false, 'second toggle observes started state and stops');
    assert.ok(stt2.calls.indexOf('startListening') < stt2.calls.indexOf('stopListening'), 'click-click = start then stop');
  });
});
