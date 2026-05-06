import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { TtsEngine } from "../../../src/roadmap/ui/modules/tts-engine.js";

interface FetchResp { ok: boolean; headers: { get(name: string): string | null } }

function installFetch(fn: () => Promise<FetchResp>) {
  (globalThis as any).fetch = fn;
}

function makeStore() {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("TtsEngine vendor presence routing", () => {
  test("emits error:piper_not_vendored when HEAD is 404", async () => {
    const tts = new TtsEngine(makeStore());
    const events: string[] = [];
    tts.onStateChange = (s: string) => events.push(s);
    installFetch(async () => ({ ok: false, headers: { get: () => null } }));
    await tts.init();
    assert.ok(events.some(e => e === 'error:piper_not_vendored'),
      `expected error:piper_not_vendored, got: ${JSON.stringify(events)}`);
  });

  test("emits error:wrong_mime when content-type is text/html", async () => {
    const tts = new TtsEngine(makeStore());
    const events: string[] = [];
    tts.onStateChange = (s: string) => events.push(s);
    installFetch(async () => ({
      ok: true,
      headers: { get: () => 'text/html; charset=utf-8' },
    }));
    await tts.init();
    assert.ok(events.some(e => e === 'error:wrong_mime'),
      `expected error:wrong_mime, got: ${JSON.stringify(events)}`);
  });

  test("does NOT emit error when HEAD reports javascript content-type", async () => {
    const tts = new TtsEngine(makeStore());
    const events: string[] = [];
    tts.onStateChange = (s: string) => events.push(s);
    installFetch(async () => ({
      ok: true,
      headers: { get: () => 'application/javascript' },
    }));
    await tts.init();
    const errs = events.filter(e => e.startsWith('error:piper_not_vendored') || e.startsWith('error:wrong_mime'));
    assert.deepStrictEqual(errs, []);
  });
});
