import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, it } from "mocha";
import { FailSafeRevertService, RevertDeps } from "../../../governance/revert/FailSafeRevertService";
import { GitResetService, CommandRunner } from "../../../governance/revert/GitResetService";
import { CheckpointRef, RevertRequest, RollbackPlan } from "../../../governance/revert/types";

const tempDirs: string[] = [];

function makeTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-revert-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(function () {
  this.timeout(10000);
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may hold brief locks on temp dirs; swallow cleanup errors
      }
    }
  }
});

const TARGET = "a".repeat(40);
const HEAD = "b".repeat(40);

const checkpoint: CheckpointRef = {
  checkpointId: "ckpt-1",
  gitHash: TARGET,
  timestamp: "2026-02-27T09:00:00.000Z",
  phase: "implement",
  status: "validated",
};

const request: RevertRequest = {
  targetCheckpoint: checkpoint,
  reason: "Rolling back to stable state",
  actor: "user.local",
};

type Resp = { code: number; stdout: string; stderr: string };

/**
 * #532 (plan-532c LD8a): a scripted git for prepare + revert. Every argv is recorded; `over`
 * answers a call first (by its joined argv) when it returns a response.
 */
function scriptedRunner(over: (args: string[], n: number) => Resp | undefined = () => undefined, calls: string[][] = []): CommandRunner {
  return async (_cmd, args) => {
    calls.push(args);
    const hit = over(args, calls.length);
    if (hit) return hit;
    const j = args.join(" ");
    if (j === "status --porcelain") return { code: 0, stdout: "", stderr: "" };
    if (j === "rev-parse HEAD") return { code: 0, stdout: `${HEAD}\n`, stderr: "" };
    if (j === "branch --show-current") return { code: 0, stdout: "main\n", stderr: "" };
    if (j === `merge-base --is-ancestor ${TARGET} HEAD`) return { code: 0, stdout: "", stderr: "" };
    if (j === `rev-list --count ${TARGET}..HEAD`) return { code: 0, stdout: "2\n", stderr: "" };
    if (args[0] === "log") return { code: 0, stdout: "stable state\u00002026-02-27T09:00:00+00:00\n", stderr: "" };
    if (j === "rev-parse --show-toplevel") return { code: 0, stdout: "/ws\n", stderr: "" };
    if (j === `reset --keep ${TARGET}`) return { code: 0, stdout: "", stderr: "" };
    if (j === "rev-parse --verify --quiet HEAD@{1}") return { code: 0, stdout: `${HEAD}\n`, stderr: "" };
    if (j === "rev-parse --verify --quiet HEAD") return { code: 0, stdout: `${TARGET}\n`, stderr: "" };
    if (j === "symbolic-ref --quiet --short HEAD") return { code: 0, stdout: "main\n", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
}

function makeDeps(
  workspaceRoot: string,
  overrides: Partial<RevertDeps> = {},
): RevertDeps {
  return {
    getCheckpoint: () => checkpoint,
    gitService: new GitResetService(scriptedRunner()),
    purgeRagAfter: () => 5,
    recordRevertCheckpoint: () => "ckpt-revert-1",
    workspaceRoot,
    verifyCheckpoint: () => true,
    ...overrides,
  };
}

async function planFor(svc: FailSafeRevertService): Promise<RollbackPlan> {
  const prepared = await svc.prepare("ckpt-1");
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  return (prepared as { plan: RollbackPlan }).plan;
}

describe("FailSafeRevertService", () => {
  it("completes 3-step revert successfully", async () => {
    const ws = makeTempWorkspace();
    const calls: string[][] = [];
    const svc = new FailSafeRevertService(makeDeps(ws, { gitService: new GitResetService(scriptedRunner(undefined, calls)) }));
    const result = await svc.revert(request, await planFor(svc));
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.steps.length, 3);
    assert.equal(result.steps[0]!.name, "git_reset");
    assert.equal(result.steps[0]!.status, "success");
    assert.equal(result.steps[1]!.name, "rag_purge");
    assert.equal(result.steps[1]!.status, "success");
    assert.equal(result.steps[2]!.name, "ledger_seal");
    assert.equal(result.steps[2]!.status, "success");
    assert.equal(result.revertCheckpointId, "ckpt-revert-1");
    // #532 B284: the reset is exactly `reset --keep <sha>`; --hard is never run.
    const resets = calls.filter((c) => c[0] === "reset");
    assert.deepEqual(resets, [["reset", "--keep", TARGET]]);
  });

  it("aborts on dirty workspace", async () => {
    const ws = makeTempWorkspace();
    const dirty = scriptedRunner((args) => (args.includes("--porcelain") ? { code: 0, stdout: " M dirty.ts\n", stderr: "" } : undefined));
    const svc = new FailSafeRevertService(makeDeps(ws));
    const plan = await planFor(svc);
    const dirtySvc = new FailSafeRevertService(makeDeps(ws, { gitService: new GitResetService(dirty) }));
    const result = await dirtySvc.revert(request, plan);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes("uncommitted"));
    assert.equal(result.steps.length, 0);
  });

  it("aborts on TOCTOU race (V3)", async () => {
    let porcelain = 0;
    const toctou = scriptedRunner((args) => {
      if (!args.includes("--porcelain")) return undefined;
      porcelain += 1;
      return porcelain === 1 ? { code: 0, stdout: "", stderr: "" } : { code: 0, stdout: " M race.ts\n", stderr: "" };
    });
    const ws = makeTempWorkspace();
    const plan = await planFor(new FailSafeRevertService(makeDeps(ws)));
    const svc = new FailSafeRevertService(makeDeps(ws, { gitService: new GitResetService(toctou) }));
    const result = await svc.revert(request, plan);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes("workspace_changed_during_revert"), result.error ?? "");
  });

  it("skips RAG purge when git reset fails", async () => {
    const fail = scriptedRunner((args) => (args[0] === "reset" ? { code: 128, stdout: "", stderr: "fatal: bad revision\n" } : undefined));
    const ws = makeTempWorkspace();
    let purgeCalled = false;
    const svc = new FailSafeRevertService(makeDeps(ws, {
      gitService: new GitResetService(fail),
      purgeRagAfter: () => { purgeCalled = true; return 0; },
    }));
    const result = await svc.revert(request, await planFor(svc));
    assert.equal(result.success, false);
    assert.equal(result.steps[1]!.status, "skipped");
    assert.equal(purgeCalled, false);
  });

  it("writes emergency log when ledger seal fails (V2)", async () => {
    const ws = makeTempWorkspace();
    const svc = new FailSafeRevertService(makeDeps(ws, {
      recordRevertCheckpoint: () => {
        throw new Error("DB locked");
      },
    }));
    const result = await svc.revert(request, await planFor(svc));
    assert.equal(result.steps[2]!.status, "failed");
    assert.equal(result.steps[2]!.detail, "ledger_seal_failed_emergency_logged");

    const logPath = path.join(ws, ".failsafe", "revert-emergency.log");
    assert.equal(fs.existsSync(logPath), true);
    const content = fs.readFileSync(logPath, "utf8");
    const record = JSON.parse(content.trim());
    assert.equal(record.error, "DB locked");
    assert.equal(record.request.actor, "user.local");
  });

  it("records step status for partial failures", async () => {
    const ws = makeTempWorkspace();
    const svc = new FailSafeRevertService(makeDeps(ws, {
      purgeRagAfter: () => {
        throw new Error("RAG store error");
      },
    }));
    const result = await svc.revert(request, await planFor(svc));
    assert.equal(result.success, false);
    assert.equal(result.steps[0]!.status, "success");
    assert.equal(result.steps[1]!.status, "failed");
    assert.equal(result.steps[2]!.status, "success");
  });

  // #532 (plan-532c LD8a, B284): prepare refusals, the plan, and the guards around the reset.
  describe("prepare and the plan (#532 B284)", () => {
    it("prepare returns the work tree, branch, HEAD, target with subject and date, and the count leaving", async () => {
      const plan = await planFor(new FailSafeRevertService(makeDeps(makeTempWorkspace())));
      assert.deepEqual(plan, {
        checkpointId: "ckpt-1", target: TARGET, targetSubject: "stable state", targetDate: "2026-02-27T09:00:00+00:00",
        workTree: "/ws", branch: "main", head: HEAD, leaving: 2,
      });
    });

    it("prepare refusals: no commit, hashes, status unavailable, dirty, not an ancestor, ancestor check unavailable", async () => {
      const ws = makeTempWorkspace();
      const cases: Array<[string, Partial<RevertDeps>, number, RegExp]> = [
        ["unknown gitHash", { getCheckpoint: () => ({ ...checkpoint, gitHash: "unknown" }) }, 409, /did not record a commit/],
        ["hash mismatch", { verifyCheckpoint: () => false }, 409, /does not match its recorded hashes/],
        ["no verifier", { verifyCheckpoint: undefined }, 503, /cannot be verified/],
        ["status fails", { gitService: new GitResetService(scriptedRunner((a) => (a[0] === "status" ? { code: 128, stdout: "", stderr: "fatal" } : undefined))) }, 503, /git status/],
        ["dirty", { gitService: new GitResetService(scriptedRunner((a) => (a[0] === "status" ? { code: 0, stdout: " M x\n", stderr: "" } : undefined))) }, 409, /uncommitted/],
        ["not an ancestor", { gitService: new GitResetService(scriptedRunner((a) => (a[0] === "merge-base" ? { code: 1, stdout: "", stderr: "" } : undefined))) }, 409, /not an ancestor/],
        ["ancestor unavailable", { gitService: new GitResetService(scriptedRunner((a) => (a[0] === "merge-base" ? { code: 128, stdout: "", stderr: "fatal" } : undefined))) }, 503, /ancestor/],
      ];
      for (const [name, over, status, error] of cases) {
        const out = await new FailSafeRevertService(makeDeps(ws, over)).prepare("ckpt-1");
        assert.equal(out.ok, false, name);
        assert.equal((out as { status: number }).status, status, name);
        assert.match((out as { error: string }).error, error, name);
      }
    });

    it("revert without a plan refuses with zero git calls", async () => {
      const calls: string[][] = [];
      const svc = new FailSafeRevertService(makeDeps(makeTempWorkspace(), { gitService: new GitResetService(scriptedRunner(undefined, calls)) }));
      const result = await svc.revert(request);
      assert.equal(result.success, false);
      assert.equal(result.status, 409);
      assert.match(result.error ?? "", /confirmed plan/);
      assert.deepEqual(calls, []);
    });

    it("a workspace that changed after the confirmation (HEAD, branch, count or work tree) is refused with no reset", async () => {
      const ws = makeTempWorkspace();
      const plan = await planFor(new FailSafeRevertService(makeDeps(ws)));
      const changes: Array<[string, (a: string[]) => Resp | undefined]> = [
        ["HEAD", (a) => (a.join(" ") === "rev-parse HEAD" ? { code: 0, stdout: `${"c".repeat(40)}\n`, stderr: "" } : undefined)],
        ["branch", (a) => (a.join(" ") === "branch --show-current" ? { code: 0, stdout: "other\n", stderr: "" } : undefined)],
        ["detached", (a) => (a.join(" ") === "branch --show-current" ? { code: 0, stdout: "\n", stderr: "" } : undefined)],
        ["count", (a) => (a[0] === "rev-list" ? { code: 0, stdout: "3\n", stderr: "" } : undefined)],
        ["work tree", (a) => (a.join(" ") === "rev-parse --show-toplevel" ? { code: 0, stdout: "/elsewhere\n", stderr: "" } : undefined)],
      ];
      for (const [name, over] of changes) {
        const calls: string[][] = [];
        const svc = new FailSafeRevertService(makeDeps(ws, { gitService: new GitResetService(scriptedRunner(over, calls)) }));
        const result = await svc.revert(request, plan);
        assert.equal(result.success, false, name);
        assert.equal(result.status, 409, name);
        assert.match(result.error ?? "", /changed after you confirmed/, name);
        assert.deepEqual(calls.filter((c) => c[0] === "reset"), [], `${name}: no reset`);
      }
    });

    it("a reset that landed on another branch or from another HEAD reports failure with the previous HEAD", async () => {
      const ws = makeTempWorkspace();
      const plan = await planFor(new FailSafeRevertService(makeDeps(ws)));
      const moved = "d".repeat(40);
      const cases: Array<[string, (a: string[]) => Resp | undefined, string]> = [
        ["HEAD moved", (a) => (a.join(" ") === "rev-parse --verify --quiet HEAD@{1}" ? { code: 0, stdout: `${moved}\n`, stderr: "" } : undefined), moved],
        ["branch switched", (a) => (a.join(" ") === "symbolic-ref --quiet --short HEAD" ? { code: 0, stdout: "other\n", stderr: "" } : undefined), HEAD],
      ];
      for (const [name, over, previous] of cases) {
        const svc = new FailSafeRevertService(makeDeps(ws, { gitService: new GitResetService(scriptedRunner(over)) }));
        const result = await svc.revert(request, plan);
        assert.equal(result.success, false, name);
        assert.equal(result.previousHead, previous, name);
        assert.match(result.error ?? "", /reflog/, name);
      }
    });
  });
});
