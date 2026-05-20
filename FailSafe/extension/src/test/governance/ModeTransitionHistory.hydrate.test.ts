// FX537 — B-EM-2 Phase 1: ModeTransitionHistory.hydrateFromLedger.
// Seeds the ring buffer from the most recent USER_OVERRIDE ledger entries
// matching governance_mode_changed / break_glass_{activated,revoked,expired}.
import { strict as assert } from "assert";
import { EventBus } from "../../shared/EventBus";
import { ModeTransitionHistory } from "../../governance/ModeTransitionHistory";

interface FakeLedgerEntry {
  id?: number | string | null;
  agentDid?: string | null;
  payload?: unknown;
}

function makeLedger(entries: FakeLedgerEntry[], opts: { throws?: boolean; delayMs?: number } = {}) {
  return {
    async getEntriesByType(_t: "USER_OVERRIDE", limit: number): Promise<FakeLedgerEntry[]> {
      if (opts.throws) throw new Error("ledger-failed");
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      return entries.slice(0, limit);
    },
  };
}

function modeChangedEntry(opts: {
  id?: number;
  previousMode?: string;
  newMode?: string;
  timestamp?: string;
  agentDid?: string;
}): FakeLedgerEntry {
  return {
    id: opts.id ?? 1,
    agentDid: opts.agentDid ?? "vscode-user",
    payload: {
      action: "governance_mode_changed",
      previousMode: opts.previousMode ?? "observe",
      newMode: opts.newMode ?? "assist",
      timestamp: opts.timestamp ?? "2026-05-20T10:00:00Z",
    },
  };
}

function breakGlassEntry(opts: { id?: number; action: string; timestamp?: string }): FakeLedgerEntry {
  return {
    id: opts.id ?? 2,
    agentDid: "vscode-user",
    payload: {
      action: opts.action,
      previousMode: "observe",
      newMode: "enforce",
      timestamp: opts.timestamp ?? "2026-05-20T11:00:00Z",
      requestedBy: "operator-1",
    },
  };
}

suite("ModeTransitionHistory.hydrateFromLedger (FX537)", () => {
  test("empty ledger leaves ring empty", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    await h.hydrateFromLedger(makeLedger([]));
    assert.equal(h.getRecent().length, 0);
  });

  test("10 matching entries: ring contains all 10 in DESC order", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    // Ledger returns DESC (newest first by id). Build 10 entries with descending ids.
    const entries = Array.from({ length: 10 }, (_, i) =>
      modeChangedEntry({ id: 100 - i, timestamp: `2026-05-20T${String(10 + i).padStart(2, "0")}:00:00Z` }),
    );
    await h.hydrateFromLedger(makeLedger(entries));
    const ring = h.getRecent();
    assert.equal(ring.length, 10);
    // After projection (ASC) + push(unshift), ring[0] = newest = id 100 = timestamp 10:00.
    assert.equal(ring[0].timestamp, "2026-05-20T10:00:00Z");
    assert.equal(ring[9].timestamp, "2026-05-20T19:00:00Z");
  });

  test("more than 10 matching entries: ring caps at 10 via getEntriesByType limit", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    const entries = Array.from({ length: 15 }, (_, i) => modeChangedEntry({ id: 200 - i }));
    await h.hydrateFromLedger(makeLedger(entries));
    assert.equal(h.getRecent().length, 10);
  });

  test("non-matching entries (bicameral.ratify etc.) are skipped", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    const entries: FakeLedgerEntry[] = [
      modeChangedEntry({ id: 5 }),
      { id: 4, agentDid: "vscode-user", payload: { action: "bicameral.ratify", decisionId: "d1" } },
      modeChangedEntry({ id: 3 }),
      { id: 2, agentDid: "vscode-user", payload: { action: "other-thing", foo: "bar" } },
      modeChangedEntry({ id: 1 }),
    ];
    await h.hydrateFromLedger(makeLedger(entries));
    assert.equal(h.getRecent().length, 3);
  });

  test("malformed entry (missing fields) is skipped without throwing", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    const entries: FakeLedgerEntry[] = [
      modeChangedEntry({ id: 3 }),
      { id: 2, agentDid: "x", payload: { action: "governance_mode_changed" /* missing prev/new/ts */ } },
      modeChangedEntry({ id: 1 }),
    ];
    await h.hydrateFromLedger(makeLedger(entries));
    assert.equal(h.getRecent().length, 2);
  });

  test("getEntriesByType throws: hydration swallows error, ring remains empty, hydrating flag clears", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    await h.hydrateFromLedger(makeLedger([], { throws: true }));
    assert.equal(h.getRecent().length, 0);
    // Verify hydrating flag cleared: live event should now record immediately.
    eb.emit("governance.modeChanged", {
      previousMode: "observe",
      newMode: "assist",
      reason: "config_edit",
      actor: "vscode-user",
      timestamp: "2026-05-20T12:00:00Z",
    });
    assert.equal(h.getRecent().length, 1);
  });

  test("hydration THEN live event: live event lands at index 0 (DESC preserved)", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    await h.hydrateFromLedger(makeLedger([modeChangedEntry({ id: 1, timestamp: "2026-05-20T10:00:00Z" })]));
    eb.emit("governance.modeChanged", {
      previousMode: "assist",
      newMode: "enforce",
      reason: "config_edit",
      actor: "vscode-user",
      timestamp: "2026-05-20T15:00:00Z",
    });
    const ring = h.getRecent();
    assert.equal(ring.length, 2);
    assert.equal(ring[0].timestamp, "2026-05-20T15:00:00Z");
    assert.equal(ring[1].timestamp, "2026-05-20T10:00:00Z");
  });

  test("live event during hydration: queued + drained after, ends at index 0", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    // Start hydration with a 50ms delay (simulating slow ledger).
    const hydratePromise = h.hydrateFromLedger(
      makeLedger([modeChangedEntry({ id: 1, timestamp: "2026-05-20T08:00:00Z" })], { delayMs: 50 }),
    );
    // Fire a live event during the await window.
    await new Promise((r) => setTimeout(r, 10));
    eb.emit("governance.modeChanged", {
      previousMode: "observe",
      newMode: "enforce",
      reason: "config_edit",
      actor: "vscode-user",
      timestamp: "2026-05-20T09:00:00Z",
    });
    await hydratePromise;
    const ring = h.getRecent();
    assert.equal(ring.length, 2);
    // Live event should be at index 0 (drained AFTER hydrated entries, so on top).
    assert.equal(ring[0].timestamp, "2026-05-20T09:00:00Z");
    assert.equal(ring[1].timestamp, "2026-05-20T08:00:00Z");
  });

  test("break_glass_activated entry projects with reason=break_glass_activated + requestedBy actor", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    await h.hydrateFromLedger(makeLedger([breakGlassEntry({ id: 1, action: "break_glass_activated" })]));
    const ring = h.getRecent();
    assert.equal(ring.length, 1);
    assert.equal(ring[0].reason, "break_glass_activated");
    assert.equal(ring[0].actor, "operator-1");
  });

  test("break_glass_revoked entry projects with reason=revoked", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    await h.hydrateFromLedger(makeLedger([breakGlassEntry({ id: 1, action: "break_glass_revoked" })]));
    assert.equal(h.getRecent()[0].reason, "revoked");
  });

  test("break_glass_expired entry projects with reason=expired", async () => {
    const eb = new EventBus();
    const h = new ModeTransitionHistory(eb);
    await h.hydrateFromLedger(makeLedger([breakGlassEntry({ id: 1, action: "break_glass_expired" })]));
    assert.equal(h.getRecent()[0].reason, "expired");
  });
});
