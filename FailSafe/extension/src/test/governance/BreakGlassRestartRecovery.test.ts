import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BreakGlassProtocol, BreakGlassRequest, GovernanceMode } from "../../governance/BreakGlassProtocol";
import { breakGlassStatePath } from "../../governance/breakGlassState";

function createMockLedger() {
  const entries: unknown[] = [];
  return {
    appendEntry: async (entry: unknown) => { entries.push(entry); },
    getEntries: () => entries,
  } as any;
}

function createMockEventBus() {
  const emitted: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => { emitted.push({ type, payload }); },
    getEmitted: () => emitted,
  } as any;
}

function createValidRequest(overrides?: Partial<BreakGlassRequest>): BreakGlassRequest {
  return {
    reason: "Emergency production hotfix required immediately",
    durationMinutes: 30,
    requestedBy: "admin@test.local",
    targetMode: "observe",
    ...overrides,
  };
}

// Regression coverage for FailSafe#240's "abandoned locks, temporary files,
// and incomplete transactions" lifecycle-audit slice: a break-glass override
// left active when the extension host restarts (crash / "Reload Window" /
// ordinary reactivation) must not silently leave governance downgraded
// forever with no revert path. Reproduces red on the pre-fix
// BreakGlassProtocol (no persistence, no reconcile()) and green after.
describe("BreakGlassProtocol restart recovery", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "breakglass-restart-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persists the active override to disk on activate() and clears it on revoke()", async () => {
    const protocol = new BreakGlassProtocol(createMockLedger(), createMockEventBus(), tmpDir);
    protocol.setModeChangeHandler(async () => {});

    await protocol.activate(createValidRequest(), "enforce");
    assert.ok(fs.existsSync(breakGlassStatePath(tmpDir)), "state file must exist while override is active");

    await protocol.revoke("admin@test.local");
    assert.ok(!fs.existsSync(breakGlassStatePath(tmpDir)), "state file must be cleared once revoked");

    protocol.dispose();
  });

  it("reconcile() reverts an override recovered past its expiry", async () => {
    // Simulate a prior process that activated an override and crashed before
    // its timer fired: write the persisted record directly, past expiry.
    const expiredRecord = {
      id: "bg-past",
      activatedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      reason: "Emergency production hotfix required immediately",
      requestedBy: "admin@test.local",
      previousMode: "enforce" as GovernanceMode,
      overrideMode: "observe" as GovernanceMode,
      status: "active" as const,
    };
    fs.mkdirSync(path.dirname(breakGlassStatePath(tmpDir)), { recursive: true });
    fs.writeFileSync(breakGlassStatePath(tmpDir), JSON.stringify(expiredRecord));

    const protocol = new BreakGlassProtocol(createMockLedger(), createMockEventBus(), tmpDir);
    let currentMode: GovernanceMode = "observe"; // simulates the still-downgraded persisted workspace setting
    protocol.setModeChangeHandler(async (mode) => { currentMode = mode; });

    await protocol.reconcile();

    assert.strictEqual(currentMode, "enforce", "reconcile() must revert to the pre-override mode");
    assert.strictEqual(protocol.isActive(), false);
    assert.ok(!fs.existsSync(breakGlassStatePath(tmpDir)), "expired state file must be cleared after reconcile");

    protocol.dispose();
  });

  it("reconcile() reschedules the revert timer for an override still within its window", async () => {
    const activeRecord = {
      id: "bg-live",
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      reason: "Emergency production hotfix required immediately",
      requestedBy: "admin@test.local",
      previousMode: "enforce" as GovernanceMode,
      overrideMode: "observe" as GovernanceMode,
      status: "active" as const,
    };
    fs.mkdirSync(path.dirname(breakGlassStatePath(tmpDir)), { recursive: true });
    fs.writeFileSync(breakGlassStatePath(tmpDir), JSON.stringify(activeRecord));

    const protocol = new BreakGlassProtocol(createMockLedger(), createMockEventBus(), tmpDir);
    let modeChangeCalls = 0;
    protocol.setModeChangeHandler(async () => { modeChangeCalls += 1; });

    await protocol.reconcile();

    assert.strictEqual(protocol.isActive(), true, "override still within its window must resume as active");
    assert.strictEqual(modeChangeCalls, 0, "mode is already correctly set on disk; reconcile must not re-apply it");
    assert.ok(fs.existsSync(breakGlassStatePath(tmpDir)), "state file must remain while the override is still live");

    // A subsequent revoke must still work against the recovered state.
    await protocol.revoke("admin@test.local");
    assert.strictEqual(modeChangeCalls, 1);
    assert.ok(!fs.existsSync(breakGlassStatePath(tmpDir)));

    protocol.dispose();
  });

  it("reconcile() is a no-op without a persisted override", async () => {
    const protocol = new BreakGlassProtocol(createMockLedger(), createMockEventBus(), tmpDir);
    let modeChangeCalls = 0;
    protocol.setModeChangeHandler(async () => { modeChangeCalls += 1; });

    await protocol.reconcile();

    assert.strictEqual(protocol.isActive(), false);
    assert.strictEqual(modeChangeCalls, 0);

    protocol.dispose();
  });
});
