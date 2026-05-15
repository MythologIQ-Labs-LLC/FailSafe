import { strict as assert } from "assert";
// @ts-expect-error JS module import in TS test context
import { MonitorStaleness } from "../../../src/roadmap/ui/modules/monitor-staleness.js";

class FakeClassList {
  private classes = new Set<string>();
  add(cls: string) { this.classes.add(cls); }
  remove(cls: string) { this.classes.delete(cls); }
  contains(cls: string) { return this.classes.has(cls); }
}

class FakeEl {
  classList = new FakeClassList();
  textContent = '';
}

suite("MonitorStaleness", () => {
  test("notifyDisconnected adds .stale to phase-track and shows banner with text", () => {
    const track = new FakeEl();
    const banner = new FakeEl();
    banner.classList.add('hidden');
    const s = new MonitorStaleness({ phaseTrack: track, stalenessBanner: banner });
    s.notifyDisconnected();
    assert.ok(track.classList.contains('stale'), 'phase-track should have .stale');
    assert.ok(!banner.classList.contains('hidden'), 'banner .hidden should be removed');
    assert.match(banner.textContent, /Disconnected/);
    assert.equal(s.isStale(), true);
  });

  test("notifyConnected after disconnect removes .stale and re-hides banner", () => {
    const track = new FakeEl();
    const banner = new FakeEl();
    const s = new MonitorStaleness({ phaseTrack: track, stalenessBanner: banner });
    s.notifyDisconnected();
    s.notifyConnected();
    assert.ok(!track.classList.contains('stale'));
    assert.ok(banner.classList.contains('hidden'));
    assert.equal(banner.textContent, '');
    assert.equal(s.isStale(), false);
  });

  test("detach is idempotent", () => {
    const track = new FakeEl();
    const banner = new FakeEl();
    const s = new MonitorStaleness({ phaseTrack: track, stalenessBanner: banner });
    s.notifyDisconnected();
    s.detach();
    assert.ok(!track.classList.contains('stale'));
    assert.doesNotThrow(() => s.detach());
    assert.equal(s.isStale(), false);
  });

  test("missing DOM elements → no throw on any operation, state still tracked", () => {
    const s = new MonitorStaleness({});
    assert.doesNotThrow(() => s.notifyConnected());
    assert.equal(s.isStale(), false);
    assert.doesNotThrow(() => s.notifyDisconnected());
    assert.equal(s.isStale(), true, 'state tracked even without DOM');
    assert.doesNotThrow(() => s.detach());
    assert.equal(s.isStale(), false, 'detach resets state');
  });
});
