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

// #297 completion (FX905): the Slice-1 guard covered only step 3's
// evaluateAction call. Four other awaits in handleFileOperation could still
// reject out of the method (getActiveIntent, evaluationRouter.route,
// qorLogicManager.processEvaluationDecision, governanceAdapter.evaluate),
// and showBlockade itself could throw via the notifier. These tests pin the
// total guard: handleFileOperation NEVER rejects — every fault resolves false.
suite("GovernanceRouter.handleFileOperation - total fail-closed guard (FX905/#297)", () => {
  function makeWorkingEngine(notifications: INotificationService): EnforcementEngine {
    return new EnforcementEngine(
      {
        getActiveIntent: async () => null,
        createIntent: async () => {
          throw new Error("unused");
        },
      },
      "/workspace",
      makeConfigProvider(),
      notifications,
    );
  }

  async function callNeverRejects(
    router: GovernanceRouter,
  ): Promise<{ rejected: boolean; allowed: boolean | undefined }> {
    let rejected = false;
    let allowed: boolean | undefined;
    try {
      allowed = await router.handleFileOperation("file_write", "/workspace/src/x.ts");
    } catch {
      rejected = true;
    }
    return { rejected, allowed };
  }

  test("T1: intentService.getActiveIntent rejecting fails CLOSED (returns false, notifies)", async () => {
    const capture: NotifyCapture = { errors: [] };
    const notifications = makeNotifications(capture);
    const router = new GovernanceRouter(
      {
        getActiveIntent: async () => {
          throw new Error("intent service backing store unreadable");
        },
      } as unknown as IntentService,
      makeWorkingEngine(notifications),
      {} as unknown as GovernanceStatusBar,
      makeEvaluationRouter(),
      notifications,
    );
    const r = await callNeverRejects(router);
    assert.equal(r.rejected, false, "must not reject on intent-service fault");
    assert.equal(r.allowed, false, "intent-service fault must block the save");
    assert.ok(capture.errors.length >= 1, "operator must be notified");
  });

  test("T2: evaluationRouter.route rejecting fails CLOSED (returns false)", async () => {
    const capture: NotifyCapture = { errors: [] };
    const notifications = makeNotifications(capture);
    const router = new GovernanceRouter(
      { getActiveIntent: async () => null } as unknown as IntentService,
      makeWorkingEngine(notifications),
      {} as unknown as GovernanceStatusBar,
      {
        route: async () => {
          throw new Error("routing table corrupted");
        },
      } as unknown as EvaluationRouter,
      notifications,
    );
    const r = await callNeverRejects(router);
    assert.equal(r.rejected, false, "must not reject on routing fault");
    assert.equal(r.allowed, false, "routing fault must block the save");
  });

  test("T3: governanceAdapter.evaluate rejecting fails CLOSED (returns false)", async () => {
    const capture: NotifyCapture = { errors: [] };
    const notifications = makeNotifications(capture);
    const router = new GovernanceRouter(
      { getActiveIntent: async () => null } as unknown as IntentService,
      makeWorkingEngine(notifications),
      {} as unknown as GovernanceStatusBar,
      makeEvaluationRouter(),
      notifications,
    );
    router.setGovernanceAdapter({
      evaluate: async () => {
        throw new Error("adapter backing ledger unavailable");
      },
    } as unknown as import("../../governance/GovernanceAdapter").GovernanceAdapter);
    const r = await callNeverRejects(router);
    assert.equal(r.rejected, false, "must not reject on adapter fault");
    assert.equal(r.allowed, false, "adapter fault must block the save");
  });

  test("T4: qorLogicManager.processEvaluationDecision rejecting fails CLOSED (returns false)", async () => {
    const capture: NotifyCapture = { errors: [] };
    const notifications = makeNotifications(capture);
    const invokingRouter = {
      route: async () => ({
        tier: 2,
        triage: { risk: "high", novelty: "high", confidence: "low" },
        invokeQorLogic: true,
        writeLedger: true,
        enforceSentinel: true,
        requiredActions: [],
      }),
    } as unknown as EvaluationRouter;
    const throwingManager = {
      processEvaluationDecision: async () => {
        throw new Error("qorlogic pipeline fault");
      },
    } as unknown as import("../../qorelogic/QorLogicManager").QorLogicManager;
    const router = new GovernanceRouter(
      { getActiveIntent: async () => null } as unknown as IntentService,
      makeWorkingEngine(notifications),
      {} as unknown as GovernanceStatusBar,
      invokingRouter,
      notifications,
      undefined,
      throwingManager,
    );
    const r = await callNeverRejects(router);
    assert.equal(r.rejected, false, "must not reject on qorlogic pipeline fault");
    assert.equal(r.allowed, false, "qorlogic pipeline fault must block the save");
  });

  test("T5: evaluateAction never settling times out and fails CLOSED (returns false)", async () => {
    const capture: NotifyCapture = { errors: [] };
    const notifications = makeNotifications(capture);
    const hangingEngine = {
      evaluateAction: () => new Promise(() => {}),
    } as unknown as EnforcementEngine;
    const router = new GovernanceRouter(
      { getActiveIntent: async () => null } as unknown as IntentService,
      hangingEngine,
      {} as unknown as GovernanceStatusBar,
      makeEvaluationRouter(),
      notifications,
      undefined,
      undefined,
      50,
    );
    const r = await callNeverRejects(router);
    assert.equal(r.rejected, false, "timeout must not surface as a rejection");
    assert.equal(r.allowed, false, "a hung verdict generation must block the save");
    assert.ok(capture.errors.length >= 1, "operator must be told the save was blocked");
  });

  test("T6: a throwing notifier during blockade still resolves false (showBlockade total)", async () => {
    const throwingNotifications: INotificationService = {
      showInfo: async () => undefined,
      showWarning: async () => undefined,
      showError: async () => {
        throw new Error("notification host disposed");
      },
      showProgress: async <T>(
        _title: string,
        task: (r: (m: string) => void) => Promise<T>,
      ) => task(() => {}),
    };
    const router = new GovernanceRouter(
      { getActiveIntent: async () => null } as unknown as IntentService,
      makeWorkingEngine(throwingNotifications),
      {} as unknown as GovernanceStatusBar,
      makeEvaluationRouter(),
      throwingNotifications,
    );
    router.setGovernanceAdapter({
      evaluate: async () => ({
        allowed: false,
        reason: "policy denies this write",
        riskGrade: "L3",
      }),
    } as unknown as import("../../governance/GovernanceAdapter").GovernanceAdapter);
    const r = await callNeverRejects(router);
    assert.equal(r.rejected, false, "a throwing notifier must not surface as a rejection");
    assert.equal(r.allowed, false, "the block decision must survive a notifier fault");
  });
});

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
