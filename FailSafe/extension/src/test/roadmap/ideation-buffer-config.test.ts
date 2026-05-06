import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { IdeationBuffer } from "../../../src/roadmap/ui/modules/ideation-buffer.js";

suite("IdeationBuffer constructor configuration", () => {
  test("default maxHistory is 10", () => {
    const buf = new IdeationBuffer();
    assert.strictEqual(buf.maxHistory, 10);
  });

  test("custom maxHistory is honored", () => {
    const buf = new IdeationBuffer(25);
    assert.strictEqual(buf.maxHistory, 25);
  });

  test("invalid maxHistory falls back to default", () => {
    const buf = new IdeationBuffer(0);
    assert.strictEqual(buf.maxHistory, 10);
    const buf2 = new IdeationBuffer(-5);
    assert.strictEqual(buf2.maxHistory, 10);
    const buf3 = new IdeationBuffer(NaN);
    assert.strictEqual(buf3.maxHistory, 10);
  });

  test("history honors custom maxHistory cap on overflow", () => {
    const buf = new IdeationBuffer(3);
    for (let i = 0; i < 5; i++) {
      buf.setText(`Thought ${i}`);
      buf.commit();
    }
    const history = buf.getHistory();
    assert.strictEqual(history.length, 3);
    assert.strictEqual(history[0].text, 'Thought 4');
    assert.strictEqual(history[2].text, 'Thought 2');
  });

  test("commit returns dropped when overflowing custom cap", () => {
    const buf = new IdeationBuffer(2);
    buf.setText('A'); buf.commit();
    buf.setText('B'); buf.commit();
    buf.setText('C');
    const { thought, dropped } = buf.commit();
    assert.ok(thought);
    assert.ok(dropped);
    assert.strictEqual(dropped.text, 'A');
  });
});
