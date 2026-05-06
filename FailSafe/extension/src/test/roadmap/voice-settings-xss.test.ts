import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { renderVoiceSettings } from "../../../src/roadmap/ui/modules/voice-settings.js";

function makeStore(initial: Record<string, unknown>) {
  const m = new Map<string, unknown>(Object.entries(initial));
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

const HOSTILE = '" autofocus onfocus=alert(1) x="';
// The breakout signature: a bare `"` (closing the attribute) followed by space + attribute name.
// After escapeHtml, the quotes become &quot; so this signature should NOT appear in the output.
const BREAKOUT_SIGNATURE = '" autofocus';

suite("Voice settings XSS escape discipline (D-1, D-2, D-3)", () => {
  test("D-1: hostile wake-word-phrase value is escaped (no attribute breakout)", () => {
    const html = renderVoiceSettings(makeStore({ 'wake-word-phrase': HOSTILE }));
    assert.ok(!html.includes(BREAKOUT_SIGNATURE),
      'attribute breakout signature (bare quote + attr name) must not appear in rendered HTML');
    assert.ok(html.includes('&quot;'),
      'escaped quote entity must appear, proving escape ran');
  });

  test("D-2: hostile audio-input-device data-saved is escaped", () => {
    const html = renderVoiceSettings(makeStore({ 'audio-input-device': HOSTILE }));
    assert.ok(!html.includes(BREAKOUT_SIGNATURE),
      'audio-input-device must be escaped: no bare-quote breakout signature');
  });

  test("D-2: hostile audio-output-device data-saved is escaped", () => {
    const html = renderVoiceSettings(makeStore({ 'audio-output-device': HOSTILE }));
    assert.ok(!html.includes(BREAKOUT_SIGNATURE),
      'audio-output-device must be escaped: no bare-quote breakout signature');
  });

  test("D-3: hostile tts-voice value renders without attribute breakout", () => {
    const html = renderVoiceSettings(makeStore({ 'tts-voice': '"><script>alert(1)</script>' }));
    assert.ok(!html.includes('<script>alert(1)</script>'),
      'tts-voice must not introduce a script tag via unescaped value');
    // tts-voice is a select option — value is checked against catalog ids, so the hostile
    // value is dropped entirely. Confirm no `selected` flag or option carries the payload.
    assert.ok(!html.includes('><script>'),
      'no attribute-context-breaking-into-tag-context allowed');
  });
});
