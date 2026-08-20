// FX909 (#83 Phases B+C) — runAgentsWindowConfigure guided flow. Written
// FIRST per TDD. Pure-logic module with an injected io seam, so the tests
// assert dispatched effects, not vscode internals.
import { strict as assert } from "assert";
import {
  runAgentsWindowConfigure,
  type AgentsWindowConfigureIo,
} from "../../extension/agentsWindowConfigure";

interface Capture {
  infos: Array<{ message: string; buttons: string[] }>;
  settingsOpened: string[];
  commandsRun: string[];
}

function makeIo(answers: Array<string | undefined>): { io: AgentsWindowConfigureIo; cap: Capture } {
  const cap: Capture = { infos: [], settingsOpened: [], commandsRun: [] };
  let call = 0;
  const io: AgentsWindowConfigureIo = {
    showInfo: async (message, ...buttons) => {
      cap.infos.push({ message, buttons });
      return answers[call++];
    },
    openSettings: async (query) => {
      cap.settingsOpened.push(query);
    },
    runCommand: async (id) => {
      cap.commandsRun.push(id);
    },
  };
  return { io, cap };
}

suite("agentsWindowConfigure (FX909/#83 B+C)", () => {
  test("T1: 'Open Settings' on the opt-in step opens the supportAgentsWindow query, runs no commands", async () => {
    const { io, cap } = makeIo(["Open Settings", undefined, undefined]);
    await runAgentsWindowConfigure(io);
    assert.deepEqual(cap.settingsOpened, ["extensions.supportAgentsWindow"]);
    assert.deepEqual(cap.commandsRun, []);
    assert.ok(
      cap.infos[0].message.includes("MythologIQ.mythologiq-failsafe"),
      "opt-in guidance must name the exact settings-map key",
    );
  });

  test("T2: 'Install Commit Hook' on the worktree step dispatches failsafe.installCommitHook once", async () => {
    const { io, cap } = makeIo([undefined, "Install Commit Hook", undefined]);
    await runAgentsWindowConfigure(io);
    assert.deepEqual(cap.commandsRun, ["failsafe.installCommitHook"]);
  });

  test("T3: 'Install MCP Integration' dispatches failsafe.mcp.installCatalog", async () => {
    const { io, cap } = makeIo([undefined, undefined, "Install MCP Integration"]);
    await runAgentsWindowConfigure(io);
    assert.deepEqual(cap.commandsRun, ["failsafe.mcp.installCatalog"]);
  });

  test("T4: dismissing every prompt is a clean idempotent no-op", async () => {
    const { io, cap } = makeIo([undefined, undefined, undefined]);
    await runAgentsWindowConfigure(io);
    assert.equal(cap.infos.length, 3, "all three guidance steps are offered");
    assert.deepEqual(cap.settingsOpened, []);
    assert.deepEqual(cap.commandsRun, []);
  });
});

suite("agentsWindowConfigure manifest + wiring (T5)", () => {
  test("T5: package.json contributes the command and bootstrapAdvancedCommands registers it", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const root = path.resolve(__dirname, "..", "..", "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const cmds: Array<{ command: string; title: string }> = pkg.contributes.commands;
    const entry = cmds.find((c) => c.command === "failsafe.configureAgentsWindow");
    assert.ok(entry, "manifest must contribute failsafe.configureAgentsWindow");
    assert.ok(/agents window/i.test(entry!.title), "title names the Agents window");
    const wiring = fs.readFileSync(
      path.join(root, "src", "extension", "bootstrapAdvancedCommands.ts"),
      "utf8",
    );
    assert.ok(
      wiring.includes('registerCommand("failsafe.configureAgentsWindow"'),
      "bootstrapAdvancedCommands must register the command",
    );
  });
});
