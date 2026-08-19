// Verdict-generation fault path (Myth-Tech-Forge relay #138 / FailSafe#239
// "core governance and enforcement" audit): GovernanceRouter.handleFileOperation
// is the primary editor-save enforcement gate wired in bootstrapGovernance.ts
// via vscode.workspace.onWillSaveTextDocument(...).event.waitUntil(...).
//
// Prior to this fix, step 3 ("Evaluate Verdict via EnforcementEngine") called
// `await this.enforcement.evaluateAction(action)` with no surrounding
// try/catch. If that call rejected (e.g. a corrupted on-disk intent-state
// file), the rejection propagated out of handleFileOperation as an uncaught
// promise rejection instead of resolving to `false` — breaking the method's
// own documented contract ("Returns FALSE if blocked, TRUE if allowed") and
// leaving this call site without the fail-closed guarantee the codebase
// already enforces on the ACP/MCP path (EngineBackedInterceptor: "Engine
// throws are caught and mapped to a QUARANTINE receipt — evaluate never
// rejects").
//
// This test proves the fixed behavior: a verdict-generation fault fails
// CLOSED (returns false, notifies the operator) rather than rejecting.
import { strict as assert } from "assert";
import { GovernanceRouter } from "../../governance/GovernanceRouter";
import { EnforcementEngine, IntentProvider } from "../../governance/EnforcementEngine";
import type { EvaluationRouter } from "../../governance/EvaluationRouter";
import type { IntentService } from "../../governance/IntentService";
import type { GovernanceStatusBar } from "../../governance/GovernanceStatusBar";
import type { INotificationService } from "../../core/interfaces/INotificationService";
import type { IConfigProvider } from "../../core/interfaces/IConfigProvider";
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

// A real EnforcementEngine wired to an IntentProvider that throws — a
// realistic verdict-generation fault, not a stubbed-out "engine". This makes
// the exact same call GovernanceRouter's step 3 makes
// (`intentProvider.getActiveIntent()` is evaluateAction()'s first line)
// genuinely reject.
const throwingIntentProvider: IntentProvider = {
  getActiveIntent: async () => {
    throw new Error("intent store corrupted");
  },
  createIntent: async () => {
    throw new Error("unused in this test");
  },
};

suite("GovernanceRouter.handleFileOperation - verdict-generation fault path", () => {
  test("EnforcementEngine.evaluateAction rejecting fails CLOSED (returns false, notifies operator)", async () => {
    const capture: NotifyCapture = { errors: [] };
    const notifications = makeNotifications(capture);
    const engine = new EnforcementEngine(
      throwingIntentProvider,
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
      "handleFileOperation must never leave a verdict-generation fault as an uncaught rejection",
    );
    assert.equal(
      allowed,
      false,
      "a verdict-generation fault must block the save (fail-closed), not allow it",
    );
    assert.ok(
      capture.errors.length >= 1,
      "the operator must be told the save was blocked, not left silent",
    );
  });
});
