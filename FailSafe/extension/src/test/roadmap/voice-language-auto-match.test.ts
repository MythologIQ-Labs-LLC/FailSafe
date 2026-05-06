import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { VoiceController } from "../../../src/roadmap/ui/modules/voice-controller.js";
// @ts-expect-error JS module import in TS test context
import { LANGUAGE_TO_DEFAULT_VOICE } from "../../../src/roadmap/ui/modules/voice-catalog.js";

function makeStt(): any {
  return {
    onTranscript: null, onStateChange: null, onAutoStop: null,
    onWakeWordTriggered: null, onModelProgress: null,
    onAnalyserCreated: null, onAudioCaptured: null,
    state: 'idle', modelReady: true, loadingStatus: 'ready', language: null,
    setSilenceTimeout() {}, startWakeWordListener() {}, destroy() {},
    init() { return Promise.resolve(); },
    teardownPipeline() {},
  };
}
function makeTts(): any { return { onStateChange: null, voiceId: 'en_US-hfc_female-medium', destroy() {} }; }
function makeStore(initial: Record<string, unknown> = {}) {
  const m = new Map<string, unknown>(Object.entries(initial));
  return {
    get: (k: string) => m.get(k),
    set: (k: string, v: unknown) => { m.set(k, v); },
    _map: m,
  };
}

suite("VoiceController.setLanguage with auto-match toggle", () => {
  test("setLanguage persists to store under stt-language", () => {
    const store = makeStore();
    const ctrl = new VoiceController(makeStt(), makeTts(), store);
    ctrl.setLanguage('fr-FR');
    assert.strictEqual(store._map.get('stt-language'), 'fr-FR');
  });

  test("setLanguage updates stt.language", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    ctrl.setLanguage('de-DE');
    assert.strictEqual(stt.language, 'de-DE');
  });

  test("auto-match=true pulls voice from LANGUAGE_TO_DEFAULT_VOICE map", () => {
    const tts = makeTts();
    const store = makeStore({ 'voice-auto-match': 'true' });
    const ctrl = new VoiceController(makeStt(), tts, store);
    ctrl.setLanguage('fr-FR');
    assert.strictEqual(tts.voiceId, LANGUAGE_TO_DEFAULT_VOICE['fr-FR']);
    assert.strictEqual(store._map.get('tts-voice'), LANGUAGE_TO_DEFAULT_VOICE['fr-FR']);
  });

  test("auto-match=false leaves voice unchanged", () => {
    const tts = makeTts();
    const original = tts.voiceId;
    const store = makeStore({ 'voice-auto-match': 'false' });
    const ctrl = new VoiceController(makeStt(), tts, store);
    ctrl.setLanguage('fr-FR');
    assert.strictEqual(tts.voiceId, original);
  });

  test("auto-match=true with unknown language leaves voice unchanged", () => {
    const tts = makeTts();
    const original = tts.voiceId;
    const store = makeStore({ 'voice-auto-match': 'true' });
    const ctrl = new VoiceController(makeStt(), tts, store);
    ctrl.setLanguage('xx-XX');
    assert.strictEqual(tts.voiceId, original);
  });

  test("setLanguage with empty arg falls back to DEFAULT_STT_LANGUAGE", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    ctrl.setLanguage('');
    assert.strictEqual(stt.language, 'en-US');
  });
});
