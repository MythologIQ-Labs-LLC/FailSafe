import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { TtsEngine } from "../../../src/roadmap/ui/modules/tts-engine.js";
// @ts-expect-error JS module import in TS test context
import { ALLOWED_PIPER_VOICES } from "../../../src/roadmap/ui/modules/voice-catalog.js";

function makeStore(initial: Record<string, unknown> = {}) {
  const m = new Map<string, unknown>(Object.entries(initial));
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("TtsEngine Piper voice allowlist (R-9)", () => {
  test("ALLOWED_PIPER_VOICES catalog exists and is non-empty", () => {
    assert.ok(ALLOWED_PIPER_VOICES instanceof Set);
    assert.ok(ALLOWED_PIPER_VOICES.size >= 10,
      'expected at least the 10 catalog voices');
    assert.ok(ALLOWED_PIPER_VOICES.has('en_US-hfc_female-medium'));
  });

  test("non-allowlisted store voiceId falls back to default at construction", () => {
    const tts = new TtsEngine(makeStore({ 'tts-voice': 'attacker/malicious-voice' }));
    assert.notStrictEqual(tts.voiceId, 'attacker/malicious-voice',
      'malicious voice id must not propagate to engine voiceId');
    assert.ok(ALLOWED_PIPER_VOICES.has(tts.voiceId),
      'fallback voiceId must be on allowlist');
  });

  test("allowlisted store voiceId is honored", () => {
    const tts = new TtsEngine(makeStore({ 'tts-voice': 'en_GB-alba-medium' }));
    assert.strictEqual(tts.voiceId, 'en_GB-alba-medium');
  });

  test("web: prefixed voice ids (browser TTS) bypass Piper allowlist", () => {
    const tts = new TtsEngine(makeStore({ 'tts-voice': 'web:Microsoft Zira' }));
    assert.strictEqual(tts.voiceId, 'web:Microsoft Zira',
      'web: prefix routes to Web Speech API, not Piper — allowlist does not apply');
  });
});
