// FX044 — functional test that the `failsafe.governance.mode` config value
// actually routes EnforcementEngine.evaluateAction to the correct evaluator
// (observe / assist / enforce). The sibling unit tests for each evaluator
// prove the evaluators work in isolation, but they do NOT prove the config
// string is the selector. This file fills that gap.
//
// Strategy: hand each call to evaluateAction a context that would trigger a
// distinguishable observable in each evaluator path, then flip the value
// returned by the stubbed IConfigProvider.getConfig() across three it()
// blocks. Because EnforcementEngine reads governance.mode through the
// provider on every evaluateAction call, swapping the returned string
// must change the routing — otherwise the test fails.
//
// Distinguishing observables (with axiom1.enforce stubbed to BLOCK):
//   observe -> verdict.status === "ALLOW" + reason starts "Observe mode:"
//              + notifications.showInfo invoked (NOT showWarning)
//   assist  -> verdict.status === "ALLOW" + reason starts "Assist mode:"
//              + notifications.showWarning invoked (NOT showInfo)
//   enforce -> verdict.status === "BLOCK" (axiom1 BLOCK propagates)
//
// Acceptance: if routing were silently broken (always Assist regardless of
// config), the observe case would not get reason "Observe mode:" and the
// enforce case would not yield BLOCK — both assertions fail.

import * as assert from "assert";
import { EnforcementEngine, IntentProvider } from "../../governance/EnforcementEngine";
import type { ProposedAction, Intent } from "../../governance/types/IntentTypes";
import type { IConfigProvider } from "../../core/interfaces/IConfigProvider";
import type { INotificationService } from "../../core/interfaces/INotificationService";
import type { IFeatureGate } from "../../core/interfaces/IFeatureGate";
import type { FailSafeConfig } from "../../shared/types";

type ModeString = "observe" | "assist" | "enforce";

interface NotifyCapture {
  info: string[];
  warning: string[];
  error: string[];
}

function makeConfigProvider(modeRef: { value: ModeString | string }): IConfigProvider {
  return {
    getConfig: () =>
      // The EnforcementEngine reads config.governance.mode at the call site
      // via the IConfigProvider seam — which in production is fed by
      // vscode.workspace.getConfiguration("failsafe").get("governance.mode").
      // The mutable ref lets each test swap the consumed value.
      ({
        governance: { mode: modeRef.value },
      } as unknown as FailSafeConfig),
    getWorkspaceRoot: () => "/workspace",
    getFailSafeDir: () => "/workspace/.failsafe",
    getLedgerPath: () => "/workspace/.failsafe/ledger.db",
    getFeedbackDir: () => "/workspace/.failsafe/feedback",
    getSentinelConfigPath: () => "/workspace/.failsafe/config/sentinel.yaml",
    onConfigChange: () => () => {},
  };
}

function makeNotifications(capture: NotifyCapture): INotificationService {
  return {
    showInfo: async (msg: string) => {
      capture.info.push(msg);
      return undefined;
    },
    showWarning: async (msg: string) => {
      capture.warning.push(msg);
      return undefined;
    },
    showError: async (msg: string) => {
      capture.error.push(msg);
      return undefined;
    },
    showProgress: async <T>(_title: string, task: (r: (m: string) => void) => Promise<T>) =>
      task(() => {}),
  };
}

const intentProvider: IntentProvider = {
  getActiveIntent: async () => null,
  // For assist mode: makes the auto-create path produce a known intent.
  createIntent: async (params): Promise<Intent> => ({
    id: "auto-created-intent",
    type: params.type as Intent["type"],
    purpose: params.purpose,
    scope: {
      files: params.scope.files,
      modules: params.scope.modules,
      riskGrade: params.scope.riskGrade as "L1" | "L2" | "L3",
    },
    status: "PULSE",
    metadata: { author: params.metadata.author, tags: params.metadata.tags },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
};

// FeatureGate that ENABLES governance.lockstep so EnforceModeEvaluator does
// not short-circuit to ALLOW. Without this the enforce path would behave
// like assist and our distinguishing assertion would be invalid.
const featureGate: IFeatureGate = {
  getTier: () => "pro",
  isEnabled: (flag) => flag === "governance.lockstep",
  requireFeature: () => {},
  onTierChange: () => () => {},
};

// A path guaranteed to make Axiom1 BLOCK: there is no active intent, so the
// "every action must belong to an Intent" axiom fails. That gives every
// evaluator a non-ALLOW branch to take, and the branches differ per mode.
const blockingAction: ProposedAction = {
  type: "file_write",
  targetPath: "/workspace/src/anywhere.ts",
  intentId: null,
  proposedAt: new Date().toISOString(),
  proposedBy: "vscode-user",
};

suite("FX044 governance.mode config consumption (routing)", () => {
  test("FX044 — config 'observe' routes evaluateAction to ObserveModeEvaluator", async () => {
    const modeRef: { value: ModeString } = { value: "observe" };
    const capture: NotifyCapture = { info: [], warning: [], error: [] };
    const engine = new EnforcementEngine(
      intentProvider,
      "/workspace",
      makeConfigProvider(modeRef),
      makeNotifications(capture),
      featureGate,
    );

    const verdict = await engine.evaluateAction(blockingAction);

    // Observe always returns ALLOW even when axiom1 would have blocked.
    assert.strictEqual(verdict.status, "ALLOW", "observe must not BLOCK");
    assert.ok(
      verdict.reason.startsWith("Observe mode:"),
      `expected Observe-mode reason, got: ${verdict.reason}`,
    );
    // ObserveModeEvaluator fires showInfo (not showWarning) on the blocked branch.
    // Allow microtask for the .then() side-effect inside the evaluator to settle.
    await new Promise((r) => setImmediate(r));
    assert.ok(capture.info.length >= 1, "observe path should have called showInfo");
    assert.strictEqual(capture.warning.length, 0, "observe must not call showWarning");
  });

  test("FX044 — config 'assist' routes evaluateAction to AssistModeEvaluator", async () => {
    const modeRef: { value: ModeString } = { value: "assist" };
    const capture: NotifyCapture = { info: [], warning: [], error: [] };
    let createIntentCalls = 0;
    const trackingProvider: IntentProvider = {
      ...intentProvider,
      createIntent: async (params) => {
        createIntentCalls += 1;
        return intentProvider.createIntent(params);
      },
    };
    const engine = new EnforcementEngine(
      trackingProvider,
      "/workspace",
      makeConfigProvider(modeRef),
      makeNotifications(capture),
      featureGate,
    );

    const verdict = await engine.evaluateAction(blockingAction);

    // Assist always returns ALLOW but with a distinct reason and side effects.
    assert.strictEqual(verdict.status, "ALLOW", "assist must not BLOCK");
    assert.ok(
      verdict.reason.startsWith("Assist mode:"),
      `expected Assist-mode reason, got: ${verdict.reason}`,
    );
    // Assist auto-creates the intent when none active — proof of routing.
    assert.strictEqual(createIntentCalls, 1, "assist path should auto-create intent exactly once");
    // After auto-create, axiom1 still BLOCKs (DRIFT: action.intentId=null vs
    // active="auto-created-intent"), so assist surfaces a warning. This
    // warning is unique to assist — observe never calls showWarning.
    assert.ok(capture.warning.length >= 1, "assist path should have called showWarning");
    assert.strictEqual(capture.error.length, 0, "assist must not call showError");
  });

  test("FX044 — config 'enforce' routes evaluateAction to EnforceModeEvaluator", async () => {
    const modeRef: { value: ModeString } = { value: "enforce" };
    const capture: NotifyCapture = { info: [], warning: [], error: [] };
    const engine = new EnforcementEngine(
      intentProvider,
      "/workspace",
      makeConfigProvider(modeRef),
      makeNotifications(capture),
      featureGate,
    );

    const verdict = await engine.evaluateAction(blockingAction);

    // Enforce propagates the underlying axiom BLOCK verdict — the ONLY
    // mode that yields a non-ALLOW status for this action.
    assert.strictEqual(
      verdict.status,
      "BLOCK",
      `enforce must BLOCK when axiom1 fails; got ${verdict.status} (${(verdict as { reason?: string }).reason ?? ""})`,
    );
  });

  test("FX044 — flipping config mid-engine flips routing (same engine instance)", async () => {
    // Belt-and-suspenders: the engine reads the config on every call. Mutating
    // the ref between two evaluateAction calls must change the verdict path.
    const modeRef: { value: ModeString } = { value: "observe" };
    const capture: NotifyCapture = { info: [], warning: [], error: [] };
    const engine = new EnforcementEngine(
      intentProvider,
      "/workspace",
      makeConfigProvider(modeRef),
      makeNotifications(capture),
      featureGate,
    );

    const first = await engine.evaluateAction(blockingAction);
    assert.strictEqual(first.status, "ALLOW");
    assert.ok(first.reason.startsWith("Observe mode:"));

    modeRef.value = "enforce";
    const second = await engine.evaluateAction(blockingAction);
    assert.strictEqual(second.status, "BLOCK", "enforce path must take over after config flip");
  });

  test("FX044 — invalid/missing governance.mode defaults to observe routing", async () => {
    // EnforcementEngine.getGovernanceModeState() falls back to 'observe' on
    // unknown strings — this guards the production default-to-safe behavior.
    const modeRef: { value: string } = { value: "totally-invalid-mode" };
    const capture: NotifyCapture = { info: [], warning: [], error: [] };
    const engine = new EnforcementEngine(
      intentProvider,
      "/workspace",
      makeConfigProvider(modeRef as { value: ModeString }),
      makeNotifications(capture),
      featureGate,
    );

    const verdict = await engine.evaluateAction(blockingAction);
    assert.strictEqual(verdict.status, "ALLOW");
    assert.ok(
      verdict.reason.startsWith("Observe mode:"),
      `invalid mode should fall back to observe routing, got reason: ${verdict.reason}`,
    );
  });
});
