import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { updateTickers } from "../../../src/roadmap/ui/modules/tickers.js";

function makeEl(id: string): any {
  return { id, innerHTML: '', textContent: '', style: {}, title: '' };
}

function installDom(map: Record<string, any>) {
  (globalThis as any).document = {
    getElementById: (id: string) => map[id] || null,
    querySelector: (sel: string) => {
      if (sel === '#ticker-workspace span') return map['#ticker-workspace span'] || null;
      return null;
    },
  };
}

suite("tickers XSS escape (R-1)", () => {
  test("hostile sentinelStatus.mode does not inject script via innerHTML", () => {
    const proto = makeEl('ticker-protocol');
    installDom({ 'ticker-protocol': proto });
    updateTickers({ sentinelStatus: { mode: '<img src=x onerror=alert(1)>' } });
    assert.ok(!proto.innerHTML.includes('<img src=x onerror=alert(1)>'),
      'sentinelStatus.mode must be escaped before innerHTML assignment');
    assert.ok(proto.innerHTML.includes('&lt;img') || proto.innerHTML.includes('&amp;lt;img'),
      'escaped < entity must appear');
  });
});
