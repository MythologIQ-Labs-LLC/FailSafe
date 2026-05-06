import * as assert from "assert";
// JS module import in TS test context (no path alias declared)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { SttEngine } from "../../../src/roadmap/ui/modules/stt-engine.js";

function makeStore(initial: Record<string, unknown> = {}) {
  const m = new Map<string, unknown>(Object.entries(initial));
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("SttEngine multilingual + model id selection", () => {
  test("default modelId is multilingual whisper-tiny (NOT .en)", () => {
    const stt = new SttEngine(makeStore());
    assert.strictEqual(stt.modelId, 'Xenova/whisper-tiny');
    assert.ok(!stt.modelId.endsWith('.en'),
      'default model must not be English-only — multilingual support requires whisper-tiny without .en suffix');
  });

  test("modelId reads from store override", () => {
    const stt = new SttEngine(makeStore({ 'whisper-model': 'Xenova/whisper-base' }));
    assert.strictEqual(stt.modelId, 'Xenova/whisper-base');
  });

  test("teardownPipeline clears modelReady and loadingStatus", () => {
    const stt = new SttEngine(makeStore());
    stt.modelReady = true;
    stt.loadingStatus = 'ready';
    stt.teardownPipeline();
    assert.strictEqual(stt.modelReady, false);
    assert.strictEqual(stt.loadingStatus, 'idle');
  });

  test("teardownPipeline does not throw when called repeatedly", () => {
    const stt = new SttEngine(makeStore());
    assert.doesNotThrow(() => {
      stt.teardownPipeline();
      stt.teardownPipeline();
    });
  });
});
