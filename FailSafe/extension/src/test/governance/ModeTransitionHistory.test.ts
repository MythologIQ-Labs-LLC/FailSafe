/**
 * FX505: ModeTransitionHistory ring buffer.
 *
 * Asserts ring boundedness, reverse-chronological order, oldest eviction,
 * dispose() unsubscribes, and full payload preservation per record.
 */

import { strict as assert } from "assert";
import { EventBus } from "../../shared/EventBus";
import { ModeTransitionHistory } from "../../governance/ModeTransitionHistory";

function emitModeChange(bus: EventBus, prev: string, next: string, ts: string, actor = "u"): void {
  bus.emit("governance.modeChanged", {
    previousMode: prev,
    newMode: next,
    reason: "config_edit",
    actor,
    timestamp: ts,
    ledgerEntryRef: null,
  });
}

suite("FX505 ModeTransitionHistory ring buffer", () => {
  test("getRecent(0) returns [] on empty history", () => {
    const bus = new EventBus();
    const ring = new ModeTransitionHistory(bus);
    assert.deepEqual(ring.getRecent(0), []);
    assert.deepEqual(ring.getRecent(10), []);
  });

  test("after 3 modeChanged emits, getRecent(10) returns 3 records in reverse-chronological order", () => {
    const bus = new EventBus();
    const ring = new ModeTransitionHistory(bus);
    emitModeChange(bus, "observe", "assist", "2026-01-01T00:00:00Z");
    emitModeChange(bus, "assist", "enforce", "2026-01-01T00:01:00Z");
    emitModeChange(bus, "enforce", "observe", "2026-01-01T00:02:00Z");
    const recent = ring.getRecent(10);
    assert.equal(recent.length, 3);
    assert.equal(recent[0].timestamp, "2026-01-01T00:02:00Z");
    assert.equal(recent[1].timestamp, "2026-01-01T00:01:00Z");
    assert.equal(recent[2].timestamp, "2026-01-01T00:00:00Z");
  });

  test("after 15 emits, ring caps at 10 with oldest-eviction", () => {
    const bus = new EventBus();
    const ring = new ModeTransitionHistory(bus);
    for (let i = 0; i < 15; i++) {
      emitModeChange(bus, "observe", "assist", `2026-01-01T00:${String(i).padStart(2, "0")}:00Z`);
    }
    const recent = ring.getRecent(20);
    assert.equal(recent.length, 10);
    // Newest first, oldest 5 (00-04) evicted.
    assert.equal(recent[0].timestamp, "2026-01-01T00:14:00Z");
    assert.equal(recent[9].timestamp, "2026-01-01T00:05:00Z");
  });

  test("dispose() unsubscribes — subsequent emits do not grow history", () => {
    const bus = new EventBus();
    const ring = new ModeTransitionHistory(bus);
    emitModeChange(bus, "observe", "assist", "2026-01-01T00:00:00Z");
    ring.dispose();
    emitModeChange(bus, "assist", "enforce", "2026-01-01T00:01:00Z");
    assert.equal(ring.getRecent(10).length, 1);
  });

  test("records carry full payload (previousMode/newMode/reason/actor/timestamp)", () => {
    const bus = new EventBus();
    const ring = new ModeTransitionHistory(bus);
    emitModeChange(bus, "observe", "enforce", "2026-01-01T00:00:00Z", "operator-x");
    const [r] = ring.getRecent(1);
    assert.equal(r.previousMode, "observe");
    assert.equal(r.newMode, "enforce");
    assert.equal(r.reason, "config_edit");
    assert.equal(r.actor, "operator-x");
    assert.equal(r.timestamp, "2026-01-01T00:00:00Z");
    assert.ok(r.id.startsWith("mt-"));
  });

  test("breakGlassActivated bus event projects to record with reason='break_glass_activated'", () => {
    const bus = new EventBus();
    const ring = new ModeTransitionHistory(bus);
    bus.emit("governance.breakGlassActivated", {
      overrideId: "bg-1",
      previousMode: "observe",
      newMode: "enforce",
      reason: "free-form text",
      requestedBy: "operator-y",
      timestamp: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-01T00:30:00Z",
    });
    const [r] = ring.getRecent(1);
    assert.equal(r.reason, "break_glass_activated");
    assert.equal(r.previousMode, "observe");
    assert.equal(r.newMode, "enforce");
    assert.equal(r.actor, "operator-y");
  });
});
