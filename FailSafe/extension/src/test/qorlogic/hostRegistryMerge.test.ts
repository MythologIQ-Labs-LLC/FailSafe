import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadHostRegistry } from "../../qorlogic/hostRegistry";

const BUILT_IN_HOSTS = ["claude", "codex", "kilo-code", "gemini"];
const OVERLAY_REL = path.join(".failsafe", "governance", "host-registry.json");

let tmpRoot: string;

function setupTmpRoot(): void {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qor-hostreg-"));
}

function teardownTmpRoot(): void {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ }
}

function writeOverlay(content: string): void {
  const target = path.join(tmpRoot, OVERLAY_REL);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

function windsurfLayout(): Record<string, unknown> {
  return {
    base: ".windsurf",
    recordPath: ".windsurf/.qorlogic-installed.json",
    installMap: { "skills/": ".windsurf/skills", "agents/": ".windsurf/agents" },
    discoveryRoots: [".windsurf/skills", ".windsurf/agents"],
  };
}

suite("hostRegistry: loadHostRegistry", function () {
  this.timeout(5000);
  setup(setupTmpRoot);
  teardown(teardownTmpRoot);

  test("no overlay file returns built-in registry", () => {
    const reg = loadHostRegistry(tmpRoot);
    assert.equal(reg.source, "built-in");
    assert.deepEqual(reg.hosts.slice().sort(), BUILT_IN_HOSTS.slice().sort());
    assert.equal(Object.keys(reg.layouts).length, 4);
  });

  test("empty hosts overlay merges to same 4 built-in hosts", () => {
    writeOverlay(JSON.stringify({ hosts: {} }));
    const reg = loadHostRegistry(tmpRoot);
    assert.equal(reg.source, "overlay-merged");
    assert.deepEqual(reg.hosts.slice().sort(), BUILT_IN_HOSTS.slice().sort());
  });

  test("additive overlay adds windsurf as 5th host", () => {
    writeOverlay(JSON.stringify({ hosts: { windsurf: windsurfLayout() } }));
    const reg = loadHostRegistry(tmpRoot);
    assert.equal(reg.source, "overlay-merged");
    assert.equal(reg.hosts.length, 5);
    assert.ok(reg.hosts.includes("windsurf"));
    assert.equal(reg.layouts.windsurf.base, ".windsurf");
  });

  test("override overlay replaces built-in claude base", () => {
    const overrideClaude = {
      base: ".claude-custom",
      recordPath: ".claude-custom/.qorlogic-installed.json",
      installMap: { "skills/": ".claude-custom/skills" },
      discoveryRoots: [".claude-custom/skills"],
    };
    writeOverlay(JSON.stringify({ hosts: { claude: overrideClaude } }));
    const reg = loadHostRegistry(tmpRoot);
    assert.equal(reg.source, "overlay-merged");
    assert.equal(reg.layouts.claude.base, ".claude-custom");
    // Other built-ins preserved.
    assert.equal(reg.layouts.codex.base, ".codex");
    assert.equal(reg.hosts.length, 4);
  });

  test("malformed JSON returns built-in with overlay-invalid source", () => {
    writeOverlay("not valid json {{{");
    const reg = loadHostRegistry(tmpRoot);
    assert.equal(reg.source, "overlay-invalid");
    assert.deepEqual(reg.hosts.slice().sort(), BUILT_IN_HOSTS.slice().sort());
    assert.equal(Object.keys(reg.layouts).length, 4);
  });
});
