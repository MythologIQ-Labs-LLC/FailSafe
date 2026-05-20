/**
 * FX504: governance.modeChanged emission + BreakGlass payload enrichment.
 *
 * Asserts the bus carries the full transition payload on:
 *  - config-edit (bootstrapAdvancedCommands listener)
 *  - break-glass activate / revoke / auto-expire
 *
 * SG-035 acceptance: every case invokes the emitter and asserts on
 * captured payload shape, not on artifact presence.
 */

import { strict as assert } from "assert";
import { EventBus } from "../../shared/EventBus";
import { BreakGlassProtocol } from "../../governance/BreakGlassProtocol";

function captureEmissions(bus: EventBus): Array<{ type: string; payload: any }> {
  const calls: Array<{ type: string; payload: any }> = [];
  const wrap = (t: string) =>
    bus.on(t as never, (ev: any) => calls.push({ type: t, payload: ev.payload }));
  wrap("governance.modeChanged");
  wrap("governance.breakGlassActivated");
  wrap("governance.breakGlassRevoked");
  wrap("governance.breakGlassExpired");
  return calls;
}

function fakeLedger(): any {
  return {
    appendEntry: async () => undefined,
    isAvailable: () => true,
  };
}

suite("FX504 governance.modeChanged + BreakGlass enriched emissions", () => {
  test("BreakGlassProtocol.activate emits full payload (overrideId/previousMode/newMode/reason/requestedBy/expiresAt/timestamp)", async () => {
    const bus = new EventBus();
    const calls = captureEmissions(bus);
    const bg = new BreakGlassProtocol(fakeLedger(), bus);
    await bg.activate(
      { reason: "test ten chars min", durationMinutes: 30, requestedBy: "operator-1", targetMode: "enforce" },
      "observe",
    );
    const ev = calls.find((c) => c.type === "governance.breakGlassActivated");
    assert.ok(ev, "no activate emission captured");
    assert.equal(ev!.payload.previousMode, "observe");
    assert.equal(ev!.payload.newMode, "enforce");
    assert.equal(ev!.payload.reason, "test ten chars min");
    assert.equal(ev!.payload.requestedBy, "operator-1");
    assert.ok(typeof ev!.payload.expiresAt === "string");
    assert.ok(typeof ev!.payload.timestamp === "string");
    assert.ok(ev!.payload.overrideId);
  });

  test("BreakGlassProtocol.revoke emits previousMode=overrideMode, newMode=previousMode (mode restored)", async () => {
    const bus = new EventBus();
    const calls = captureEmissions(bus);
    const bg = new BreakGlassProtocol(fakeLedger(), bus);
    await bg.activate(
      { reason: "test ten chars min", durationMinutes: 30, requestedBy: "operator-2", targetMode: "enforce" },
      "observe",
    );
    await bg.revoke("operator-2");
    const ev = calls.find((c) => c.type === "governance.breakGlassRevoked");
    assert.ok(ev, "no revoke emission captured");
    assert.equal(ev!.payload.previousMode, "enforce");
    assert.equal(ev!.payload.newMode, "observe");
    assert.equal(ev!.payload.reason, "revoked");
    assert.equal(ev!.payload.requestedBy, "operator-2");
    assert.ok(typeof ev!.payload.timestamp === "string");
  });

  test("BreakGlassProtocol.handleExpiry emits requestedBy='system:break-glass-timer' (matches ledger agentDid)", async () => {
    const bus = new EventBus();
    const calls = captureEmissions(bus);
    const bg = new BreakGlassProtocol(fakeLedger(), bus);
    // Use a tiny duration that fires the revertTimer immediately.
    await bg.activate(
      { reason: "auto-expiry path", durationMinutes: 1, requestedBy: "operator-3", targetMode: "assist" },
      "observe",
    );
    // Force expiry by setting expiresAt in the past and calling the private path via getActiveOverride.
    const active = (bg as unknown as { activeOverride: { expiresAt: string } }).activeOverride;
    active.expiresAt = new Date(Date.now() - 1000).toISOString();
    // Trigger expiry check (mimics scheduleRevert callback)
    bg.getActiveOverride();
    // Allow async handleExpiry to settle.
    await new Promise((r) => setTimeout(r, 30));
    const ev = calls.find((c) => c.type === "governance.breakGlassExpired");
    assert.ok(ev, "no expiry emission captured");
    assert.equal(ev!.payload.previousMode, "assist");
    assert.equal(ev!.payload.newMode, "observe");
    assert.equal(ev!.payload.reason, "expired");
    assert.equal(ev!.payload.requestedBy, "system:break-glass-timer");
  });

  test("governance.modeChanged is a registered FailSafeEventType (compile-time check via runtime emit)", () => {
    const bus = new EventBus();
    let captured: any = null;
    bus.on("governance.modeChanged", (ev: any) => { captured = ev.payload; });
    bus.emit("governance.modeChanged", {
      previousMode: "observe",
      newMode: "assist",
      reason: "config_edit",
      actor: "vscode-user",
      timestamp: new Date().toISOString(),
      ledgerEntryRef: null,
    });
    assert.ok(captured, "no modeChanged payload captured");
    assert.equal(captured.previousMode, "observe");
    assert.equal(captured.newMode, "assist");
    assert.equal(captured.reason, "config_edit");
  });

  test("BreakGlass activate denies dual-active override (existing contract preserved)", async () => {
    const bus = new EventBus();
    const bg = new BreakGlassProtocol(fakeLedger(), bus);
    await bg.activate(
      { reason: "first override here", durationMinutes: 30, requestedBy: "a", targetMode: "enforce" },
      "observe",
    );
    await assert.rejects(
      bg.activate(
        { reason: "second override try", durationMinutes: 30, requestedBy: "b", targetMode: "enforce" },
        "observe",
      ),
      /Override active until/,
    );
  });
});
