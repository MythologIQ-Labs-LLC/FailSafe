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
function makeStore(): any {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("VoiceController listener hygiene (D-7, D-8, D-15)", () => {
  test("D-7: _lastAnalyser cleared on processing too (not only idle)", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    stt.onStateChange('listening');
    stt.onAnalyserCreated({ tag: 'live' });
    stt.onStateChange('processing');
    const received: unknown[] = [];
    ctrl.addAnalyserListener((a: unknown) => received.push(a));
    assert.deepStrictEqual(received, [],
      'analyser cache must be invalidated on processing state, not only idle (closed AudioContext)');
  });

  test("D-8: re-entrant addStateListener during emit does not produce double-delivery", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    let secondListenerCount = 0;
    ctrl.addStateListener((s: string) => {
      if (s === 'listening') {
        // Re-entrant subscribe during fan-out
        ctrl.addStateListener(() => { secondListenerCount++; });
      }
    });
    stt.onStateChange('listening');
    assert.strictEqual(secondListenerCount, 1,
      'newly-added listener must receive cached state exactly once (synchronous replay), not also via in-flight iteration');
  });

  test("D-15: destroy() is idempotent (no throw on second call)", () => {
    const stt = makeStt();
    const tts = makeTts();
    let sttDestroyCount = 0;
    stt.destroy = () => { sttDestroyCount++; };
    const ctrl = new VoiceController(stt, tts, makeStore());
    ctrl.destroy();
    assert.doesNotThrow(() => ctrl.destroy(), 'second destroy must not throw');
    assert.strictEqual(sttDestroyCount, 1, 'underlying stt.destroy must only be invoked once');
  });
});
