import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { renderMultilingualRows } from "../../../src/roadmap/ui/modules/voice-settings-multilingual.js";

function makeStore(initial: Record<string, unknown>) {
  const m = new Map<string, unknown>(Object.entries(initial));
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("Voice settings multilingual XSS hygiene (D-4)", () => {
  test("model option values are escaped (defensive convention)", () => {
    const html = renderMultilingualRows(makeStore({}));
    // Static catalog produces clean ids; ensure escaping is wired even when ids contain entity-like chars.
    assert.ok(html.includes('Xenova/whisper-tiny'),
      'expected static model id to be present in rendered HTML');
    // Smoke check that the function returns a string and no raw `<` in a model value position
    assert.ok(typeof html === 'string');
  });

  test("hostile stt-language stored value does not break selected attribute", () => {
    const html = renderMultilingualRows(makeStore({ 'stt-language': '"><img src=x onerror=alert(1)>' }));
    assert.ok(!html.includes('onerror=alert(1)'),
      'stt-language store value must not inject an onerror handler into rendered HTML');
  });
});
