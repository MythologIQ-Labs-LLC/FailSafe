// Phase 3 (plan-qor-install-skills-ux-expansion.md): tests pin the contract
// for `enumerateSkillsForHost(ingestor, host, scope)` over a stubbed CLI
// invocation seam. Three required cases:
//   (a) valid JSON → parsed skills returned with degraded=false.
//   (b) exit code != 0 + stderr "unrecognized arguments: list-skills" →
//       degraded=true, reason='cli-subcommand-not-supported'.
//   (c) valid JSON with malformed entries → filtered, injectable warning
//       channel receives the count of dropped entries.

import { strict as assert } from "assert";
import {
  enumerateSkillsForHost,
  type SkillEnumerationDeps,
} from "../../qorlogic/skillEnumeration";

interface StubRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function makeIngestorStub(runResult: StubRunResult): any {
  return { __stub: "ingestor", workspaceRoot: "/tmp/ws", runResult };
}

function makeDeps(runResult: StubRunResult, warnings: string[]): SkillEnumerationDeps {
  return {
    runQorlogicCommand: async (_ingestor, args) => {
      assert.ok(Array.isArray(args), "args must be passed as array");
      return runResult;
    },
    warn: (msg) => { warnings.push(msg); },
  };
}

suite("skillEnumeration: enumerateSkillsForHost", function () {
  this.timeout(5000);

  test("valid JSON payload returns parsed skills, degraded=false", async () => {
    const payload = {
      skills: [
        { name: "qor-audit", kind: "skill", path: ".claude/skills/qor-audit/SKILL.md" },
        { name: "qor-plan", kind: "skill", path: ".claude/skills/qor-plan/SKILL.md" },
        { name: "qor-architect", kind: "agent", path: ".claude/agents/qor-architect.md" },
      ],
    };
    const warnings: string[] = [];
    const deps = makeDeps({ stdout: JSON.stringify(payload), stderr: "", code: 0 }, warnings);
    const result = await enumerateSkillsForHost(
      makeIngestorStub({ stdout: "", stderr: "", code: 0 }),
      "claude",
      "repo",
      deps,
    );
    assert.equal(result.degraded, false);
    assert.equal(result.skills.length, 3);
    assert.equal(result.skills[0].name, "qor-audit");
    assert.equal(result.skills[0].kind, "skill");
    assert.equal(result.skills[2].kind, "agent");
    assert.equal(warnings.length, 0);
  });

  test("CLI exit !=0 with 'unrecognized arguments: list-skills' degrades cleanly", async () => {
    const warnings: string[] = [];
    const deps = makeDeps({
      stdout: "",
      stderr: "qor.cli: error: unrecognized arguments: list-skills --host claude",
      code: 2,
    }, warnings);
    const result = await enumerateSkillsForHost(
      makeIngestorStub({ stdout: "", stderr: "", code: 0 }),
      "claude",
      "repo",
      deps,
    );
    assert.equal(result.degraded, true);
    assert.equal(result.reason, "cli-subcommand-not-supported");
    assert.deepEqual(result.skills, []);
  });

  test("malformed entries filtered, warn channel notified with drop count", async () => {
    const payload = {
      skills: [
        { name: "qor-audit", kind: "skill", path: ".claude/skills/qor-audit/SKILL.md" },
        { name: "", kind: "skill", path: ".claude/skills/empty/SKILL.md" }, // bad: empty name
        { kind: "skill", path: ".claude/skills/missing-name/SKILL.md" }, // bad: no name
        { name: "no-path", kind: "skill" }, // bad: no path
        { name: "qor-plan", kind: "skill", path: ".claude/skills/qor-plan/SKILL.md" },
      ],
    };
    const warnings: string[] = [];
    const deps = makeDeps({ stdout: JSON.stringify(payload), stderr: "", code: 0 }, warnings);
    const result = await enumerateSkillsForHost(
      makeIngestorStub({ stdout: "", stderr: "", code: 0 }),
      "claude",
      "repo",
      deps,
    );
    assert.equal(result.degraded, false);
    assert.equal(result.skills.length, 2);
    assert.equal(result.skills[0].name, "qor-audit");
    assert.equal(result.skills[1].name, "qor-plan");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /3/, "warning must include count of dropped entries");
  });

  test("default scope is 'repo' when omitted", async () => {
    let observedArgs: ReadonlyArray<string> = [];
    const deps: SkillEnumerationDeps = {
      runQorlogicCommand: async (_ingestor, args) => {
        observedArgs = args;
        return { stdout: JSON.stringify({ skills: [] }), stderr: "", code: 0 };
      },
      warn: () => undefined,
    };
    await enumerateSkillsForHost(makeIngestorStub({ stdout: "", stderr: "", code: 0 }), "codex", undefined, deps);
    assert.ok(observedArgs.includes("--scope"));
    const idx = observedArgs.indexOf("--scope");
    assert.equal(observedArgs[idx + 1], "repo");
  });
});
