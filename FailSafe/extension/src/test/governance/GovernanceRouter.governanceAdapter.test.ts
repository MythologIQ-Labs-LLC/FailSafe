// GovernanceAdapter preflight fault path (Myth-Tech-Forge relay #158 /
// FailSafe#297 Slice 2 candidate 2): GovernanceRouter.handleFileOperation's
// step 2 ("GovernanceAdapter Preflight") called
// `await this.governanceAdapter.evaluate(...)` with no surrounding
// try/catch — unlike step 3 (EnforcementEngine.evaluateAction), which
// Slice 1 (PR #296) already made fail closed on throw/reject.
//
// If GovernanceAdapter.evaluate() throws or rejects (e.g. a PolicyEngine or
// LedgerRecorder fault), the rejection propagated out of
// handleFileOperation as an uncaught promise rejection into
// vscode.workspace.onWillSaveTextDocument's event.waitUntil(...) — not
// guaranteed to block the save — breaking the method's own documented
// contract ("Returns FALSE if blocked, TRUE if allowed"), the same defect
// class Slice 1 fixed for the EnforcementEngine call site.
//
// This test proves the fixed behavior: a GovernanceAdapter preflight fault
// fails CLOSED (returns false, notifies the operator) rather than
// rejecting.
import { strict as assert } from "assert";
import { GovernanceRouter } from "../../governance/GovernanceRouter";
import { EnforcementEngine, IntentProvider } from "../../governance/EnforcementEngine";
import type { EvaluationRouter } from "../../governance/EvaluationRouter";
import type { IntentService } from "../../governance/IntentService";
import type { GovernanceStatusBar } from "../../governance/GovernanceStatusBar";
import type { INotificationService } from "../../core/interfaces/INotificationService";
import type { IConfigProvider } from "../../core/interfaces/IConfigProvider";
import type { GovernanceAdapter } from "../../governance/GovernanceAdapter";
import type { FailSafeConfig } from "../../shared/types";

function makeConfigProvider(): IConfigProvider {
  return {
    getConfig: () =>
      ({ governance: { mode: "enforce" } } as unknown as FailSafeConfig),
    getWorkspaceRoot: () => "/workspace",
    getFailSafeDir: () => "/workspace/.failsafe",
    getLedgerPath: () => "/workspace/.failsafe/ledger.db",
    getFeedbackDir: () => "/workspace/.failsafe/feedback",
    getSentinelConfigPath: () => "/workspace/.failsafe/config/sentinel.yaml",
    onConfigChange: () => () => {},
  };
}

interface NotifyCapture {
  errors: string[];
}

function makeNotifications(capture: NotifyCapture): INotificationService {
  return {
    showInfo: async () => undefined,
    showWarning: async () => undefined,
    showError: async (msg: string) => {
      capture.errors.push(msg);
      return undefined;
    },
    showProgress: async <T>(
      _title: string,
      task: (r: (m: string) => void) => Promise<T>,
    ) => task(() => {}),
  };
}

function makeEvaluationRouter(): EvaluationRouter {
  return {
    route: async () => ({
      tier: 1,
      triage: { risk: "low", novelty: "low", confidence: "high" },
      invokeQorLogic: false,
      writeLedger: false,
      enforceSentinel: true,
      requiredActions: [],
    }),
  } as unknown as EvaluationRouter;
}

// A benign IntentProvider: step 2's fault must short-circuit
// handleFileOperation before step 3 (EnforcementEngine.evaluateAction) is
// ever reached, so this engine's own behavior is irrelevant to the
// assertion beyond constructing a valid GovernanceRouter.
const benignIntentProvider: IntentProvider = {
  getActiveIntent: async () => null,
  createIntent: async () => {
    throw new Error("unused in this test");
  },
};

// A GovernanceAdapter-shaped stub whose evaluate() rejects — a realistic
// preflight fault (e.g. a PolicyEngine or LedgerRecorder throw), not a
// contrived double.
const throwingGovernanceAdapter = {
  evaluate: async () => {
    throw new Error("policy engine unavailable");
  },
} as unknown as GovernanceAdapter;

suite("GovernanceRouter.handleFileOperation - GovernanceAdapter preflight fault path", () => {
  test("GovernanceAdapter.evaluate rejecting fails CLOSED (returns false, notifies operator)", async () => {
    const capture: NotifyCapture = { errors: [] };
    const notifications = makeNotifications(capture);
    const engine = new EnforcementEngine(
      benignIntentProvider,
      "/workspace",
      makeConfigProvider(),
      notifications,
    );
    const router = new GovernanceRouter(
      { getActiveIntent: async () => null } as unknown as IntentService,
      engine,
      {} as unknown as GovernanceStatusBar,
      makeEvaluationRouter(),
      notifications,
    );
    router.setGovernanceAdapter(throwingGovernanceAdapter);

    let rejected = false;
    let allowed: boolean | undefined;
    try {
      allowed = await router.handleFileOperation(
        "file_write",
        "/workspace/src/x.ts",
      );
    } catch {
      rejected = true;
    }

    assert.equal(
      rejected,
      false,
      "handleFileOperation must never leave a GovernanceAdapter preflight fault as an uncaught rejection",
    );
    assert.equal(
      allowed,
      false,
      "a GovernanceAdapter preflight fault must block the save (fail-closed), not allow it",
    );
    assert.ok(
      capture.errors.length >= 1,
      "the operator must be told the save was blocked, not left silent",
    );
  });
});
