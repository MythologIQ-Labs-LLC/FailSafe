import * as assert from "assert";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { SystemRegistry } from "../../qorelogic/SystemRegistry";
import { DetectionEnvironment } from "../../qorelogic/AgentDetectionEnvironment";

class FakeDetectionEnvironment implements DetectionEnvironment {
  constructor(
    private extensionIds: string[] = [],
    private keywords: string[] = [],
    private appName = "",
  ) {}
  hasExtensionId(id: string): boolean {
    return this.extensionIds.map((x) => x.toLowerCase()).includes(id.toLowerCase());
  }
  matchesExtensionKeyword(keyword: string): boolean {
    return this.keywords.map((x) => x.toLowerCase()).includes(keyword.toLowerCase());
  }
  matchesHostAppName(name: string): boolean {
    return this.appName.toLowerCase().includes(name.toLowerCase()) && this.appName !== "";
  }
}

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-registry-test-"));
}

function cleanup(root: string): void {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* Windows may briefly lock temp dirs */
  }
}

function emptyEnv(): DetectionEnvironment {
  return new FakeDetectionEnvironment();
}

suite("SystemRegistry Test Suite", () => {
  let tempDir: string;

  suiteSetup(() => {
    tempDir = makeWorkspace();
  });

  suiteTeardown(function () {
    this.timeout(10000);
    cleanup(tempDir);
  });

  test("should return all 7 built-in agent systems", async () => {
    const registry = new SystemRegistry(tempDir, undefined, emptyEnv());
    const systems = await registry.getSystems();
    assert.strictEqual(systems.length, 7, "Should return exactly 7 built-in agents");
    const agentIds = systems.map((s) => s.getManifest().id);
    for (const id of ["claude", "copilot", "cursor", "codex", "windsurf", "gemini", "kilo-code"]) {
      assert.ok(agentIds.includes(id), `missing built-in: ${id}`);
    }
  });

  test("detect() returns true when folder detection marker exists", async () => {
    const root = makeWorkspace();
    try {
      fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
      const registry = new SystemRegistry(root, undefined, emptyEnv());
      const claude = await registry.findById("claude");
      assert.ok(claude);
      const result = await registry.detect(claude);
      assert.strictEqual(result.detected, true);
    } finally {
      cleanup(root);
    }
  });

  test("codex not detected when only AGENTS.md exists", async () => {
    const root = makeWorkspace();
    try {
      fs.writeFileSync(path.join(root, "AGENTS.md"), "# Agents", "utf-8");
      const registry = new SystemRegistry(root, undefined, emptyEnv());
      const codex = await registry.findById("codex");
      assert.ok(codex);
      assert.strictEqual((await registry.detect(codex)).detected, false);
      assert.strictEqual(registry.detectWithConfidence(codex).confidence, 0);
    } finally {
      cleanup(root);
    }
  });

  test("codex detected when .codex/ exists", async () => {
    const root = makeWorkspace();
    try {
      fs.mkdirSync(path.join(root, ".codex"), { recursive: true });
      const registry = new SystemRegistry(root, undefined, emptyEnv());
      const codex = await registry.findById("codex");
      assert.ok(codex);
      const outcome = registry.detectWithConfidence(codex);
      assert.strictEqual(outcome.detected, true);
      assert.ok(outcome.confidence >= 0.5);
      assert.ok(outcome.signals.includes("folderExists:.codex"));
    } finally {
      cleanup(root);
    }
  });

  test("copilot detected via extension ID match", async () => {
    const root = makeWorkspace();
    try {
      const env = new FakeDetectionEnvironment(["github.copilot"]);
      const registry = new SystemRegistry(root, undefined, env);
      const copilot = await registry.findById("copilot");
      assert.ok(copilot);
      const outcome = registry.detectWithConfidence(copilot);
      assert.strictEqual(outcome.detected, true);
      assert.strictEqual(outcome.confidence, 1);
      assert.ok(outcome.signals.includes("extensionId:github.copilot"));
    } finally {
      cleanup(root);
    }
  });

  test("weighted detection returns confidence > 0 for single strong signal", async () => {
    const root = makeWorkspace();
    try {
      fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
      const registry = new SystemRegistry(root, undefined, emptyEnv());
      const claude = await registry.findById("claude");
      assert.ok(claude);
      assert.ok(registry.detectWithConfidence(claude).confidence > 0);
    } finally {
      cleanup(root);
    }
  });

  test("multiple extension-keyword matches for one agent count as a single weak signal", async () => {
    const root = makeWorkspace();
    try {
      // Claude defines extensionKeywords ["claude","anthropic"]; both matching
      // must still be below the 0.5 threshold (0.4, not 0.8).
      const env = new FakeDetectionEnvironment([], ["claude", "anthropic"]);
      const registry = new SystemRegistry(root, undefined, env);
      const claude = await registry.findById("claude");
      assert.ok(claude);
      const outcome = registry.detectWithConfidence(claude);
      assert.strictEqual(outcome.confidence, 0.4);
      assert.strictEqual(outcome.detected, false);
    } finally {
      cleanup(root);
    }
  });

  test("weighted detection returns confidence 0 when no signals match", async () => {
    const root = makeWorkspace();
    try {
      const registry = new SystemRegistry(root, undefined, emptyEnv());
      const cursor = await registry.findById("cursor");
      assert.ok(cursor);
      const outcome = registry.detectWithConfidence(cursor);
      assert.strictEqual(outcome.confidence, 0);
      assert.strictEqual(outcome.detected, false);
    } finally {
      cleanup(root);
    }
  });

  test("overlay agent merges with built-ins (matching id overrides)", async () => {
    const root = makeWorkspace();
    try {
      fs.mkdirSync(path.join(root, ".failsafe"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".failsafe", "agents.json"),
        JSON.stringify({ agents: [{ id: "claude", name: "Claude Override", description: "overlay" }] }),
        "utf-8",
      );
      const registry = new SystemRegistry(root, undefined, emptyEnv());
      const claude = await registry.findById("claude");
      assert.ok(claude);
      assert.strictEqual(claude.getManifest().name, "Claude Override");
      assert.strictEqual((await registry.getSystems()).length, 7);
    } finally {
      cleanup(root);
    }
  });

  test("overlay with unknown id appends to built-ins", async () => {
    const root = makeWorkspace();
    try {
      fs.mkdirSync(path.join(root, ".failsafe"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".failsafe", "agents.json"),
        JSON.stringify({ agents: [{ id: "cline", name: "Cline", description: "overlay" }] }),
        "utf-8",
      );
      const registry = new SystemRegistry(root, undefined, emptyEnv());
      const systems = await registry.getSystems();
      assert.strictEqual(systems.length, 8);
      assert.ok(systems.some((s) => s.getManifest().id === "cline"));
    } finally {
      cleanup(root);
    }
  });

  test("malformed overlay is ignored gracefully", async () => {
    const root = makeWorkspace();
    try {
      fs.mkdirSync(path.join(root, ".failsafe"), { recursive: true });
      fs.writeFileSync(path.join(root, ".failsafe", "agents.json"), "{ not json", "utf-8");
      const registry = new SystemRegistry(root, undefined, emptyEnv());
      assert.strictEqual((await registry.getSystems()).length, 7);
    } finally {
      cleanup(root);
    }
  });

  test("core system type file is not extended with detection-only fields", () => {
    const coreTypePath = findRepoFile(
      "FailSafe/extension/src/qorelogic/types/QorLogicSystem.ts",
    );
    const source = fs.readFileSync(coreTypePath, "utf-8");
    assert.ok(!source.includes("extensionIds"), "core type must not declare extensionIds");
    assert.ok(!source.includes("terminalPatterns"), "core type must not declare terminalPatterns");
  });

  test("hasGovernance() returns true when governance paths exist", async () => {
    const root = makeWorkspace();
    try {
      fs.mkdirSync(path.join(root, ".claude", "skills"), { recursive: true });
      const registry = new SystemRegistry(root, undefined, emptyEnv());
      const claude = await registry.findById("claude");
      assert.ok(claude);
      assert.strictEqual(registry.hasGovernance(claude), true);
    } finally {
      cleanup(root);
    }
  });

  test("findById() returns correct system", async () => {
    const registry = new SystemRegistry(tempDir, undefined, emptyEnv());
    const gemini = await registry.findById("gemini");
    assert.ok(gemini);
    assert.strictEqual(gemini.getManifest().name, "Gemini CLI");
  });

  test("findById() returns undefined for unknown IDs", async () => {
    const registry = new SystemRegistry(tempDir, undefined, emptyEnv());
    assert.strictEqual(await registry.findById("nonexistent"), undefined);
  });

  test("resolvePath() returns correct absolute path", () => {
    const registry = new SystemRegistry(tempDir, undefined, emptyEnv());
    assert.strictEqual(registry.resolvePath("test/path"), path.join(tempDir, "test/path"));
  });

  test("renderTemplate() replaces template variables", async () => {
    const registry = new SystemRegistry(tempDir, undefined, emptyEnv());
    const claude = await registry.findById("claude");
    assert.ok(claude);
    assert.strictEqual(
      registry.renderTemplate("{{SYSTEM_NAME}} ({{SYSTEM_ID}})", claude),
      "Claude Code (claude)",
    );
  });
});

/** Walk up from this compiled test file to the repo root, then resolve `rel`. */
function findRepoFile(rel: string): string {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, rel))) {
      return path.join(dir, rel);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate ${rel} from ${__dirname}`);
}
