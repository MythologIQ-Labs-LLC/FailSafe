// B289: the Console top-bar API ticker is retired. It read only the Qor runtime snapshot's
// latency, which never arrived (the client was always disabled), so it always showed N/A.
// updateTickers must leave a stray latency element alone even when hub data carries a value.
// (Kept out of tickers-xss.test.ts so the FX165 classifier verdict and its override stay as they are.)
import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { updateTickers } from "../../../src/roadmap/ui/modules/tickers.js";

function makeEl(id: string): any {
  return { id, innerHTML: '', textContent: '', style: {}, title: '' };
}

suite("B289 tickers: the API latency ticker is retired", () => {
  test("a latency element and hub latency data are ignored", () => {
    const lat = makeEl('ticker-latency');
    (globalThis as any).document = {
      getElementById: (id: string) => (id === 'ticker-latency' ? lat : null),
      querySelector: () => null,
    };
    updateTickers({ qorRuntime: { latencyMs: 12 } });
    assert.strictEqual(lat.innerHTML, '', 'updateTickers must not write the retired API ticker');
  });
});
