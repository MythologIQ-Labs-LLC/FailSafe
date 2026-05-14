// Phase 4 (plan-qor-install-skills-ux-expansion.md): tests pin the contract
// for `previewInstall(ingestor, host, scope, skillFilter?)` over a stubbed CLI
// invocation seam. Required cases:
//   (a) valid JSON with would_write entries -> normalized to wouldWrite,
//       degraded=false, sha256 preserved.
//   (b) exit code != 0 with stderr "unrecognized arguments: --dry-run" ->
//       degraded=true, reason='dry-run-flag-not-supported', wouldWrite=[].
//   (c) valid JSON with malformed entries -> filtered, warn channel invoked.
//   (d) --include flags emitted when skillFilter provided.

import { strict as assert } from "assert";
import {
  previewInstall,
  type InstallDryRunDeps,
} from "../../qorlogic/installDryRun";

interface StubRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function stubIngestor(): any {
  return { __stub: "ingestor", workspaceRoot: "/tmp/ws" };
}

function makeDeps(
  runResult: StubRunResult,
  warnings: string[],
  capture?: { args?: ReadonlyArray<string> },
): InstallDryRunDeps {
  return {
    runQorlogicCommand: async (_ingestor, args) => {
      assert.ok(Array.isArray(args), "args must be passed as array");
      if (capture) capture.args = args;
      return runResult;
    },
    warn: (msg) => { warnings.push(msg); },
  };
}

suite("installDryRun: previewInstall", function () {
  this.timeout(5000);

  test("valid JSON returns normalized wouldWrite, degraded=false", async () => {
    const payload = {
      would_write: [
        { path: "/ws/.claude/skills/foo/SKILL.md", sha256: "abc" },
        { path: "/ws/.claude/agents/bar.md", sha256: "def" },
      ],
    };
    const warnings: string[] = [];
    const capture: { args?: ReadonlyArray<string> } = {};
    const deps = makeDeps(
      { stdout: JSON.stringify(payload), stderr: "", code: 0 },
      warnings,
      capture,
    );
    const result = await previewInstall(stubIngestor(), "claude", "repo", undefined, deps);
    assert.equal(result.degraded, false);
    assert.equal(result.wouldWrite.length, 2);
    assert.equal(result.wouldWrite[0].path, "/ws/.claude/skills/foo/SKILL.md");
    assert.equal(result.wouldWrite[0].sha256, "abc");
    assert.equal(warnings.length, 0);
    assert.ok(capture.args?.includes("install"));
    assert.ok(capture.args?.includes("--dry-run"));
    assert.ok(capture.args?.includes("--json"));
    assert.ok(capture.args?.includes("--host"));
    assert.ok(capture.args?.includes("claude"));
  });

  test("CLI exit !=0 with 'unrecognized arguments: --dry-run' degrades cleanly", async () => {
    const warnings: string[] = [];
    const deps = makeDeps({
      stdout: "",
      stderr: "qor.cli: error: unrecognized arguments: --dry-run",
      code: 2,
    }, warnings);
    const result = await previewInstall(stubIngestor(), "claude", "repo", undefined, deps);
    assert.equal(result.degraded, true);
    assert.equal(result.reason, "dry-run-flag-not-supported");
    assert.deepEqual(result.wouldWrite, []);
  });

  test("parses would_delete array when present", async () => {
    const payload = {
      would_write: [{ path: "/ws/.claude/skills/new.md" }],
      would_delete: [{ path: "/ws/.claude/skills/old.md", sha256: "oldsha" }],
    };
    const warnings: string[] = [];
    const deps = makeDeps(
      { stdout: JSON.stringify(payload), stderr: "", code: 0 },
      warnings,
    );
    const result = await previewInstall(stubIngestor(), "claude", "repo", undefined, deps);
    assert.equal(result.degraded, false);
    assert.equal(result.wouldDelete?.length, 1);
    assert.equal(result.wouldDelete?.[0].path, "/ws/.claude/skills/old.md");
    assert.equal(result.wouldDelete?.[0].sha256, "oldsha");
  });

  test("malformed entries filtered, warn invoked with drop count", async () => {
    const payload = {
      would_write: [
        { path: "/ws/.claude/skills/ok.md", sha256: "1" },
        { sha256: "missing-path" },
        { path: "" },
        { path: "/ws/.claude/agents/ok2.md" },
      ],
    };
    const warnings: string[] = [];
    const deps = makeDeps(
      { stdout: JSON.stringify(payload), stderr: "", code: 0 },
      warnings,
    );
    const result = await previewInstall(stubIngestor(), "claude", "repo", undefined, deps);
    assert.equal(result.degraded, false);
    assert.equal(result.wouldWrite.length, 2);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /2/);
  });

  test("skillFilter emits --include flags per entry", async () => {
    const capture: { args?: ReadonlyArray<string> } = {};
    const deps = makeDeps(
      { stdout: JSON.stringify({ would_write: [] }), stderr: "", code: 0 },
      [],
      capture,
    );
    await previewInstall(stubIngestor(), "claude", "repo", ["qor-audit", "qor-plan"], deps);
    const includes = (capture.args ?? []).reduce<string[]>((acc, a, i, arr) => {
      if (a === "--include" && i + 1 < arr.length) acc.push(arr[i + 1]);
      return acc;
    }, []);
    assert.deepEqual(includes, ["qor-audit", "qor-plan"]);
  });

  test("default scope is 'repo' when omitted", async () => {
    const capture: { args?: ReadonlyArray<string> } = {};
    const deps = makeDeps(
      { stdout: JSON.stringify({ would_write: [] }), stderr: "", code: 0 },
      [],
      capture,
    );
    await previewInstall(stubIngestor(), "claude", undefined, undefined, deps);
    const idx = (capture.args ?? []).indexOf("--scope");
    assert.ok(idx >= 0);
    assert.equal((capture.args ?? [])[idx + 1], "repo");
  });

  test("non-JSON stdout returns degraded with reason=invalid-json", async () => {
    const deps = makeDeps(
      { stdout: "not json at all", stderr: "", code: 0 },
      [],
    );
    const result = await previewInstall(stubIngestor(), "claude", "repo", undefined, deps);
    assert.equal(result.degraded, true);
    assert.equal(result.reason, "invalid-json");
    assert.deepEqual(result.wouldWrite, []);
  });
});
