import * as assert from "assert";
import { BUILT_IN_AGENTS } from "../../qorelogic/AgentDefinitions";

suite("AgentDefinitions Test Suite", () => {
  test("BUILT_IN_AGENTS has exactly 7 entries", () => {
    assert.strictEqual(BUILT_IN_AGENTS.length, 7);
  });

  test("includes the kilo-code built-in", () => {
    const ids = BUILT_IN_AGENTS.map((a) => a.id);
    assert.ok(ids.includes("kilo-code"), "kilo-code must be a built-in agent");
  });

  test("all agent IDs are unique", () => {
    const agentIds = BUILT_IN_AGENTS.map((a) => a.id);
    assert.strictEqual(new Set(agentIds).size, agentIds.length);
  });

  test("every agent has at least one governancePaths entry", () => {
    for (const agent of BUILT_IN_AGENTS) {
      assert.ok(
        agent.governancePaths && agent.governancePaths.length > 0,
        `${agent.id} must have governancePaths`,
      );
    }
  });

  test("every agent has at least one detection method", () => {
    for (const agent of BUILT_IN_AGENTS) {
      const d = agent.detection;
      assert.ok(d, `${agent.id} must have detection rules`);
      const hasMethod =
        (d.folderExists?.length ?? 0) > 0 ||
        (d.extensionIds?.length ?? 0) > 0 ||
        (d.extensionKeywords?.length ?? 0) > 0 ||
        (d.hostAppNames?.length ?? 0) > 0;
      assert.ok(hasMethod, `${agent.id} must have at least one detection method`);
    }
  });

  test("every agent has at least one high-confidence signal (extensionId or agent-specific folder)", () => {
    for (const agent of BUILT_IN_AGENTS) {
      const d = agent.detection ?? {};
      const strong =
        (d.extensionIds?.length ?? 0) > 0 || (d.folderExists?.length ?? 0) > 0;
      assert.ok(strong, `${agent.id} must carry a high-confidence detection signal`);
    }
  });

  test("no agent uses AGENTS.md as a detection marker", () => {
    for (const agent of BUILT_IN_AGENTS) {
      const folders = agent.detection?.folderExists ?? [];
      assert.ok(
        !folders.includes("AGENTS.md"),
        `${agent.id} must not detect via AGENTS.md`,
      );
    }
  });

  test("codex detection does not match AGENTS.md", () => {
    const codex = BUILT_IN_AGENTS.find((a) => a.id === "codex");
    assert.ok(codex);
    const folders = codex.detection?.folderExists ?? [];
    assert.ok(!folders.includes("AGENTS.md"));
    assert.ok(folders.includes(".codex"));
  });

  test("every agent has a non-empty description", () => {
    for (const agent of BUILT_IN_AGENTS) {
      assert.ok(agent.description && agent.description.length > 0);
    }
  });

  test("all agents have targetDir set to null", () => {
    for (const agent of BUILT_IN_AGENTS) {
      assert.strictEqual(agent.targetDir, null, `${agent.id} targetDir`);
    }
  });
});
