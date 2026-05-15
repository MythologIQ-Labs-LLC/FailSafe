import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { VoiceController } from "../../../src/roadmap/ui/modules/voice-controller.js";

function makeStt(): any {
  return {
    onTranscript: null, onStateChange: null, onAutoStop: null,
    onWakeWordTriggered: null, onModelProgress: null,
    onAnalyserCreated: null, onAudioCaptured: null,
    state: 'idle', modelReady: true, loadingStatus: 'ready',
    setSilenceTimeout() {}, startWakeWordListener() {}, destroy() {},
  };
}
function makeTts(): any { return { onStateChange: null, destroy() {} }; }
function makeStore() {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("VoiceController analyser cache + replay", () => {
  test("late subscriber receives cached analyser", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    const fakeAnalyser = { tag: 'A1' };
    stt.onAnalyserCreated(fakeAnalyser);
    const received: unknown[] = [];
    ctrl.addAnalyserListener((a: unknown) => received.push(a));
    assert.deepStrictEqual(received, [fakeAnalyser]);
  });

  test("multiple subscribers all receive new analyser broadcasts", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    const a: unknown[] = []; const b: unknown[] = [];
    ctrl.addAnalyserListener((x: unknown) => a.push(x));
    ctrl.addAnalyserListener((x: unknown) => b.push(x));
    const a1 = { tag: 'A1' };
    stt.onAnalyserCreated(a1);
    assert.deepStrictEqual(a, [a1]);
    assert.deepStrictEqual(b, [a1]);
  });

  test("analyser cache invalidates when state returns to idle", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    stt.onStateChange('listening');
    stt.onAnalyserCreated({ tag: 'live' });
    stt.onStateChange('idle');
    const received: unknown[] = [];
    ctrl.addAnalyserListener((a: unknown) => received.push(a));
    assert.deepStrictEqual(received, []);
  });

  test("unsubscribe stops further analyser notifications", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    const seen: unknown[] = [];
    const off = ctrl.addAnalyserListener((x: unknown) => seen.push(x));
    off();
    stt.onAnalyserCreated({ tag: 'A1' });
    assert.deepStrictEqual(seen, []);
  });
});
