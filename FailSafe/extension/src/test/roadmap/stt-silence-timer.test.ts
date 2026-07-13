import * as assert from "assert";
import { SttEngine } from "../../../src/roadmap/ui/modules/stt-engine.js";

async function flush(rounds = 8): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

suite("SttEngine silence auto-stop", () => {
  test("publishes auto-stop only after stopListening reaches idle", async () => {
    const engine: any = new SttEngine(null);
    let timerCallback: (() => Promise<void>) | null = null;
    engine._silence = {
      reset(callback: () => Promise<void>) { timerCallback = callback; },
      clear() {},
    };
    let resolveStop!: () => void;
    const stopGate = new Promise<void>((resolve) => { resolveStop = resolve; });
    engine.state = "listening";
    engine.stopListening = async () => { await stopGate; engine._setState("idle"); };
    const observed: string[] = [];
    engine.onAutoStop = () => observed.push(engine.state);
    engine._resetSilenceTimer();
    const stopping = timerCallback!();
    await flush();
    assert.deepStrictEqual(observed, [], "no terminal callback while stop is pending");
    resolveStop();
    await stopping;
    assert.deepStrictEqual(observed, ["idle"]);
  });

  test("stop rejection is handled without an unhandled promise", async () => {
    const engine: any = new SttEngine(null);
    let timerCallback: (() => Promise<void>) | null = null;
    engine._silence = { reset(callback: () => Promise<void>) { timerCallback = callback; }, clear() {} };
    engine.state = "listening";
    engine.stopListening = async () => { throw new Error("stop failed"); };
    engine._resetSilenceTimer();
    await assert.doesNotReject(() => timerCallback!());
    assert.strictEqual(engine.state, "idle");
  });
});
