import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { DEFAULT_STT_LANGUAGE, LANGUAGE_TO_DEFAULT_VOICE } from "../../../src/roadmap/ui/modules/voice-catalog.js";

suite("voice-catalog", () => {
  test("DEFAULT_STT_LANGUAGE is 'en-US'", () => {
    assert.strictEqual(DEFAULT_STT_LANGUAGE, 'en-US');
  });

  test("LANGUAGE_TO_DEFAULT_VOICE maps en-US, fr-FR, ja-JP to known Piper voice ids", () => {
    assert.strictEqual(LANGUAGE_TO_DEFAULT_VOICE['en-US'], 'en_US-hfc_female-medium');
    assert.strictEqual(LANGUAGE_TO_DEFAULT_VOICE['fr-FR'], 'fr_FR-siwis-medium');
    assert.ok(typeof LANGUAGE_TO_DEFAULT_VOICE['ja-JP'] === 'string' && LANGUAGE_TO_DEFAULT_VOICE['ja-JP'].length > 0);
  });

  test("LANGUAGE_TO_DEFAULT_VOICE has exactly 12 entries", () => {
    assert.strictEqual(Object.keys(LANGUAGE_TO_DEFAULT_VOICE).length, 12);
  });

  test("every key matches BCP-47-like xx-XX pattern", () => {
    const re = /^[a-z]{2}-[A-Z]{2}$/;
    for (const k of Object.keys(LANGUAGE_TO_DEFAULT_VOICE)) {
      assert.match(k, re, `key "${k}" should match xx-XX`);
    }
  });

  test("every value is a non-empty string", () => {
    for (const v of Object.values(LANGUAGE_TO_DEFAULT_VOICE)) {
      assert.strictEqual(typeof v, 'string');
      assert.ok((v as string).length > 0);
    }
  });
});
