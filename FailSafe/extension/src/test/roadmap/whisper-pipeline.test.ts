import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { WhisperPipeline } from "../../../src/roadmap/ui/modules/whisper-pipeline.js";

function makeProgressRecorder() {
  const calls: Array<{ status: string; n?: number }> = [];
  const fn = (status: string, n?: number) => { calls.push({ status, n }); };
  return { calls, fn };
}

suite("WhisperPipeline", () => {
  test("happy path resolves with isReady=true and emits loading + ready", async () => {
    const fakePipeline = { __id: "fake" };
    const loaderFn = async () => fakePipeline;
    const pipeline = new WhisperPipeline(loaderFn);
    const { calls, fn } = makeProgressRecorder();

    await pipeline.load("Xenova/whisper-tiny", fn);

    assert.strictEqual(pipeline.isReady(), true);
    assert.strictEqual(pipeline.pipeline(), fakePipeline);
    const statuses = calls.map((c) => c.status);
    assert.ok(statuses.includes("loading"), "should emit 'loading'");
    assert.ok(statuses.includes("ready"), "should emit 'ready'");
  });

  test("timeout retry success: throws once then resolves; isReady=true", async () => {
    let attempts = 0;
    const fakePipeline = { __id: "after-retry" };
    const loaderFn = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("timeout");
      return fakePipeline;
    };
    const pipeline = new WhisperPipeline(loaderFn);
    const { fn } = makeProgressRecorder();

    await pipeline.load("Xenova/whisper-tiny", fn);

    assert.strictEqual(pipeline.isReady(), true);
    assert.strictEqual(attempts, 2, "loader invoked exactly twice (initial + 1 retry)");
    assert.strictEqual(pipeline.pipeline(), fakePipeline);
  });

  test("timeout retry exhausted: isReady=false and onProgress sees 'error:timeout_after_retry' once", async () => {
    let attempts = 0;
    const loaderFn = async () => { attempts += 1; throw new Error("timeout"); };
    const pipeline = new WhisperPipeline(loaderFn);
    const { calls, fn } = makeProgressRecorder();

    await pipeline.load("Xenova/whisper-tiny", fn);

    assert.strictEqual(pipeline.isReady(), false);
    assert.strictEqual(pipeline.pipeline(), null);
    assert.strictEqual(attempts, 2, "loader invoked exactly twice (initial + 1 retry)");
    const errorCalls = calls.filter((c) => c.status === "error:timeout_after_retry");
    assert.strictEqual(errorCalls.length, 1, "error:timeout_after_retry emitted exactly once");
  });

  test("teardown after successful load: isReady=false, pipeline()=null", async () => {
    const loaderFn = async () => ({ __id: "x" });
    const pipeline = new WhisperPipeline(loaderFn);
    const { fn } = makeProgressRecorder();

    await pipeline.load("Xenova/whisper-tiny", fn);
    assert.strictEqual(pipeline.isReady(), true);

    pipeline.teardown();

    assert.strictEqual(pipeline.isReady(), false);
    assert.strictEqual(pipeline.pipeline(), null);
    assert.strictEqual(pipeline.status(), "idle");
  });
});
