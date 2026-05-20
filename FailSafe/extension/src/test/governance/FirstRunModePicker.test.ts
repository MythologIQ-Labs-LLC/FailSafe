// FX538 — B-EM-3 Phase 2: FirstRunModePicker.
// First-run gate; QuickPick selection persists to failsafe.governance.mode;
// dismissal still marks onboarded (no re-prompting).
import { strict as assert } from "assert";
import * as vscode from "vscode";
import { FirstRunModePicker } from "../../governance/FirstRunModePicker";
import type { ConfigManager } from "../../shared/ConfigManager";

interface ConfigUpdate {
  key: string;
  value: unknown;
  target: vscode.ConfigurationTarget;
}

function makeConfigManager(initialOnboarded: boolean): {
  configManager: ConfigManager;
  state: Record<string, unknown>;
} {
  const state: Record<string, unknown> = {
    "failsafe.onboarded.mode": initialOnboarded,
  };
  const cm = {
    getGlobalState: <T>(key: string, defaultValue: T): T =>
      (state[key] as T | undefined) ?? defaultValue,
    setGlobalState: async <T>(key: string, value: T): Promise<void> => {
      state[key] = value;
    },
  } as unknown as ConfigManager;
  return { configManager: cm, state };
}

suite("FirstRunModePicker (FX538)", () => {
  let originalShowQuickPick: typeof vscode.window.showQuickPick;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
  let quickPickCalls: number;
  let configUpdates: ConfigUpdate[];
  let nextQuickPickReturn: { mode: "observe" | "assist" | "enforce" } | undefined;

  suiteSetup(() => {
    originalShowQuickPick = vscode.window.showQuickPick;
    originalGetConfiguration = vscode.workspace.getConfiguration;
    (vscode.window as { showQuickPick: unknown }).showQuickPick = async (
      _picks: unknown,
      _opts?: unknown,
    ): Promise<{ mode: "observe" | "assist" | "enforce" } | undefined> => {
      quickPickCalls++;
      return nextQuickPickReturn;
    };
    (vscode.workspace as { getConfiguration: unknown }).getConfiguration = (
      _section?: string,
    ): vscode.WorkspaceConfiguration => ({
      get: () => undefined,
      has: () => false,
      inspect: () => undefined,
      update: async (key: string, value: unknown, target?: vscode.ConfigurationTarget) => {
        configUpdates.push({
          key,
          value,
          target: target ?? vscode.ConfigurationTarget.Global,
        });
      },
    } as unknown as vscode.WorkspaceConfiguration);
  });

  suiteTeardown(() => {
    (vscode.window as { showQuickPick: unknown }).showQuickPick = originalShowQuickPick;
    (vscode.workspace as { getConfiguration: unknown }).getConfiguration = originalGetConfiguration;
  });

  setup(() => {
    quickPickCalls = 0;
    configUpdates = [];
    nextQuickPickReturn = undefined;
  });

  test("already onboarded: checkAndRun is a no-op (showQuickPick NOT called)", async () => {
    const { configManager } = makeConfigManager(true);
    const picker = new FirstRunModePicker(configManager);
    await picker.checkAndRun();
    assert.equal(quickPickCalls, 0);
    assert.equal(configUpdates.length, 0);
  });

  test("first-run + selects observe: config written, onboarded marked", async () => {
    const { configManager, state } = makeConfigManager(false);
    nextQuickPickReturn = { mode: "observe" };
    const picker = new FirstRunModePicker(configManager);
    await picker.checkAndRun();
    assert.equal(quickPickCalls, 1);
    assert.equal(configUpdates.length, 1);
    assert.equal(configUpdates[0].key, "governance.mode");
    assert.equal(configUpdates[0].value, "observe");
    assert.equal(configUpdates[0].target, vscode.ConfigurationTarget.Global);
    assert.equal(state["failsafe.onboarded.mode"], true);
  });

  test("first-run + selects assist: config persists assist mode", async () => {
    const { configManager, state } = makeConfigManager(false);
    nextQuickPickReturn = { mode: "assist" };
    const picker = new FirstRunModePicker(configManager);
    await picker.checkAndRun();
    assert.equal(configUpdates[0].value, "assist");
    assert.equal(state["failsafe.onboarded.mode"], true);
  });

  test("first-run + selects enforce: config persists enforce mode", async () => {
    const { configManager, state } = makeConfigManager(false);
    nextQuickPickReturn = { mode: "enforce" };
    const picker = new FirstRunModePicker(configManager);
    await picker.checkAndRun();
    assert.equal(configUpdates[0].value, "enforce");
    assert.equal(state["failsafe.onboarded.mode"], true);
  });

  test("first-run + dismisses (no selection): NO config write, onboarded STILL marked", async () => {
    const { configManager, state } = makeConfigManager(false);
    nextQuickPickReturn = undefined;
    const picker = new FirstRunModePicker(configManager);
    await picker.checkAndRun();
    assert.equal(quickPickCalls, 1);
    assert.equal(configUpdates.length, 0);
    assert.equal(state["failsafe.onboarded.mode"], true);
  });

  test("multiple rapid invocations: second call sees onboarded=true and short-circuits", async () => {
    const { configManager } = makeConfigManager(false);
    nextQuickPickReturn = { mode: "observe" };
    const picker = new FirstRunModePicker(configManager);
    await picker.checkAndRun();
    assert.equal(quickPickCalls, 1);
    // Second call.
    await picker.checkAndRun();
    assert.equal(quickPickCalls, 1, "second call must not re-trigger the picker");
    assert.equal(configUpdates.length, 1, "no extra config writes on second call");
  });
});
