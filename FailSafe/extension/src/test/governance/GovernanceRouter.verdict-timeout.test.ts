// Verdict-generation timeout path (Myth-Tech-Forge relay #97 -> FailSafe#297
// "core governance and enforcement" audit, Slice 2 candidate 3: "No test
// exists exercising a timeout during verdict generation anywhere in
// test/sentinel or test/governance").
//
// GovernanceRouter.test.ts (Slice 1) and the governanceAdapter-preflight
// test (Slice 2 candidate 2) both prove that a *rejecting*
// verdict-generation call fails CLOSED via the existing try/catch. Neither
// proves anything about a call that never settles at all -- a promise stuck
// on a stalled ledger/db write, for example. A try/catch does not help
// against a hang: without an explicit bound, handleFileOperation simply
// never resolves, and the editor-save gate (wired via
// vscode.workspace.onWillSaveTextDocument's event.waitUntil(...)) is left
// with no code-level fail-closed guarantee -- only undocumented VS Code
// waitUntil-timeout behavior.
//
// This test proves the fixed behavior: a verdict-generation call that never
// settles is bounded by an explicit timeout and fails CLOSED (returns
// false, notifies the operator) within that bound, exactly like a rejection.
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

// A real EnforcementEngine wired to an IntentProvider whose getActiveIntent()
// never settles -- evaluateAction()'s first line is `await
// this.intentProvider.getActiveIntent()`, so this genuinely reproduces a
// stuck verdict-generation call, not a stubbed-out timeout.
const hangingIntentProvider: IntentProvider = {
  getActiveIntent: () => new Promise(() => {
    /* never resolves or rejects */
  }),
  createIntent: async () => {
    throw new Error("unused in this test");
  },
};

const TEST_VERDICT_TIMEOUT_MS = 50;

suite("GovernanceRouter.handleFileOperation - verdict-generation timeout path", () => {
  test("EnforcementEngine.evaluateAction hanging fails CLOSED within the configured bound", async function () {
    // Generous headroom over TEST_VERDICT_TIMEOUT_MS so this fails on a
    // genuine regression (no bound at all) rather than on scheduling noise.
    this.timeout(TEST_VERDICT_TIMEOUT_MS * 20);

    const capture: NotifyCapture = { errors: [] };
    const notifications = makeNotifications(capture);
    const engine = new EnforcementEngine(
      hangingIntentProvider,
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
      undefined,
      undefined,
      TEST_VERDICT_TIMEOUT_MS,
    );

    const started = Date.now();
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
    const elapsedMs = Date.now() - started;

    assert.equal(
      rejected,
      false,
      "handleFileOperation must never leave a verdict-generation timeout as an uncaught rejection",
    );
    assert.equal(
      allowed,
      false,
      "a verdict-generation timeout must block the save (fail-closed), not allow it, and must not hang indefinitely",
    );
    assert.ok(
      elapsedMs < TEST_VERDICT_TIMEOUT_MS * 10,
      `handleFileOperation must resolve near the configured timeout bound, took ${elapsedMs}ms`,
    );
    assert.ok(
      capture.errors.length >= 1,
      "the operator must be told the save was blocked, not left silent",
    );
    assert.ok(
      capture.errors.some((msg) => /timed out/i.test(msg)),
      "operator notification should name the timeout fault so it is diagnosable",
    );
  });
});
