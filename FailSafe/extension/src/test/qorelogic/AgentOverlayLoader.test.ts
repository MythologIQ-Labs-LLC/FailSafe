import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  loadAgentOverlay,
  mergeAgentOverlay,
} from "../../qorelogic/AgentOverlayLoader";
import { AgentSystemManifest } from "../../qorelogic/types/DetectionTypes";

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-overlay-test-"));
}

function writeOverlay(root: string, contents: string): void {
  const dir = path.join(root, ".failsafe");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "agents.json"), contents, "utf-8");
}

function cleanup(root: string): void {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* Windows may briefly lock temp dirs */
  }
}

suite("AgentOverlayLoader Test Suite", () => {
  test("valid overlay parses correctly", () => {
    const root = makeWorkspace();
    try {
      writeOverlay(
        root,
        JSON.stringify({
          agents: [
            {
              id: "cline",
              name: "Cline",
              description: "Cline AI coding assistant",
              detection: {
                extensionIds: ["saoudrizwan.claude-dev"],
                folderExists: [".cline"],
              },
              governancePaths: [".clinerules"],
            },
          ],
        }),
      );
      const result = loadAgentOverlay(root);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, "cline");
      assert.strictEqual(result[0].targetDir, null);
      assert.deepStrictEqual(result[0].detection?.extensionIds, [
        "saoudrizwan.claude-dev",
      ]);
    } finally {
      cleanup(root);
    }
  });

  test("empty agents array returns empty", () => {
    const root = makeWorkspace();
    try {
      writeOverlay(root, JSON.stringify({ agents: [] }));
      assert.deepStrictEqual(loadAgentOverlay(root), []);
    } finally {
      cleanup(root);
    }
  });

  test("missing file returns empty", () => {
    const root = makeWorkspace();
    try {
      assert.deepStrictEqual(loadAgentOverlay(root), []);
    } finally {
      cleanup(root);
    }
  });

  test("invalid JSON returns empty", () => {
    const root = makeWorkspace();
    try {
      writeOverlay(root, "{ this is not valid json ");
      assert.deepStrictEqual(loadAgentOverlay(root), []);
    } finally {
      cleanup(root);
    }
  });

  test("agent missing required fields is skipped with warning", () => {
    const root = makeWorkspace();
    const originalWarn = console.warn;
    let warned = 0;
    console.warn = () => {
      warned += 1;
    };
    try {
      writeOverlay(
        root,
        JSON.stringify({
          agents: [
            { name: "No Id Here", description: "missing id" },
            { id: "ok", name: "OK", description: "fine" },
          ],
        }),
      );
      const result = loadAgentOverlay(root);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, "ok");
      assert.ok(warned >= 1, "should warn on the skipped entry");
    } finally {
      console.warn = originalWarn;
      cleanup(root);
    }
  });

  test("overlay entry with path-traversal in governancePaths is rejected", () => {
    const root = makeWorkspace();
    const originalWarn = console.warn;
    console.warn = () => undefined;
    try {
      writeOverlay(
        root,
        JSON.stringify({
          agents: [
            {
              id: "evil",
              name: "Evil",
              description: "tries to escape the workspace",
              governancePaths: ["../../etc/passwd"],
            },
          ],
        }),
      );
      assert.deepStrictEqual(loadAgentOverlay(root), []);
    } finally {
      console.warn = originalWarn;
      cleanup(root);
    }
  });

  test("mergeAgentOverlay overrides matching id and appends new", () => {
    const builtIns: AgentSystemManifest[] = [
      { id: "claude", name: "Claude Code", description: "builtin", targetDir: null },
      { id: "codex", name: "OpenAI Codex", description: "builtin", targetDir: null },
    ];
    const overlay: AgentSystemManifest[] = [
      { id: "claude", name: "Claude Override", description: "overlay", targetDir: null },
      { id: "cline", name: "Cline", description: "overlay", targetDir: null },
    ];
    const merged = mergeAgentOverlay(builtIns, overlay);
    assert.strictEqual(merged.length, 3);
    assert.strictEqual(merged.find((m) => m.id === "claude")?.name, "Claude Override");
    assert.ok(merged.some((m) => m.id === "cline"));
    assert.ok(merged.some((m) => m.id === "codex"));
  });
});
