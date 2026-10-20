import { strict as assert } from "assert";
import { describe, it } from "mocha";
import {
  GitResetService,
  CommandRunner,
} from "../../../governance/revert/GitResetService";

function mockRunner(
  responses: Record<string, { code: number; stdout: string; stderr: string }>,
): CommandRunner {
  return async (_cmd, args) => {
    const key = args.join(" ");
    for (const [pattern, response] of Object.entries(responses)) {
      if (key.includes(pattern)) {
        return response;
      }
    }
    return { code: 0, stdout: "", stderr: "" };
  };
}

describe("GitResetService", () => {
  describe("getStatus", () => {
    it("detects clean workspace", async () => {
      const runner = mockRunner({
        "status --porcelain": { code: 0, stdout: "", stderr: "" },
        "rev-parse HEAD": { code: 0, stdout: "abc123def456\n", stderr: "" },
        "branch --show-current": { code: 0, stdout: "main\n", stderr: "" },
      });
      const service = new GitResetService(runner);
      const status = await service.getStatus("/tmp");
      assert.equal(status.clean, true);
      assert.equal(status.currentHash, "abc123def456");
      assert.equal(status.currentBranch, "main");
      assert.equal(status.uncommittedFiles.length, 0);
    });

    it("detects dirty workspace with uncommitted files", async () => {
      const runner = mockRunner({
        "status --porcelain": {
          code: 0,
          stdout: " M src/file1.ts\n?? src/file2.ts\n",
          stderr: "",
        },
        "rev-parse HEAD": { code: 0, stdout: "abc123\n", stderr: "" },
        "branch --show-current": { code: 0, stdout: "main\n", stderr: "" },
      });
      const service = new GitResetService(runner);
      const status = await service.getStatus("/tmp");
      assert.equal(status.clean, false);
      assert.equal(status.uncommittedFiles.length, 2);
      assert.equal(status.uncommittedFiles[0], "src/file1.ts");
    });
  });

  describe("getLog", () => {
    it("parses log entries from pipe-delimited format", async () => {
      const hash40 = "a".repeat(40);
      const runner = mockRunner({
        "log": {
          code: 0,
          stdout: `${"b".repeat(40)}|feat: add feature|2026-02-27T10:00:00+00:00\n`,
          stderr: "",
        },
      });
      const service = new GitResetService(runner);
      const entries = await service.getLog("/tmp", hash40);
      assert.equal(entries.length, 1);
      assert.equal(entries[0]!.subject, "feat: add feature");
      assert.equal(entries[0]!.hash, "b".repeat(40));
    });

    it("rejects invalid sinceHash", async () => {
      const service = new GitResetService(mockRunner({}));
      await assert.rejects(
        () => service.getLog("/tmp", "--malicious-flag"),
        /Invalid git hash format/,
      );
    });
  });

  describe("resetHard", () => {
    it("rejects malicious flag as hash (V1)", async () => {
      const service = new GitResetService(mockRunner({}));
      await assert.rejects(
        () => service.resetHard("/tmp", "--upload-pack=/usr/bin/evil"),
        /Invalid git hash format/,
      );
    });

    it("rejects non-hex string", async () => {
      const service = new GitResetService(mockRunner({}));
      await assert.rejects(
        () => service.resetHard("/tmp", "not-a-valid-hash"),
        /Invalid git hash format/,
      );
    });

    it("accepts valid 40-char SHA-1 hash", async () => {
      const hash40 = "a".repeat(40);
      const runner = mockRunner({
        "reset --hard": { code: 0, stdout: `HEAD is now at ${hash40.slice(0, 7)}\n`, stderr: "" },
      });
      const service = new GitResetService(runner);
      const result = await service.resetHard("/tmp", hash40);
      assert.equal(result.success, true);
    });

    it("accepts valid 64-char SHA-256 hash", async () => {
      const hash64 = "b".repeat(64);
      const runner = mockRunner({
        "reset --hard": { code: 0, stdout: "HEAD is now at bbbbbbb\n", stderr: "" },
      });
      const service = new GitResetService(runner);
      const result = await service.resetHard("/tmp", hash64);
      assert.equal(result.success, true);
    });

    it("reports failure when git returns non-zero", async () => {
      const hash40 = "c".repeat(40);
      const runner = mockRunner({
        "reset --hard": { code: 128, stdout: "", stderr: "fatal: not a git repo\n" },
      });
      const service = new GitResetService(runner);
      const result = await service.resetHard("/tmp", hash40);
      assert.equal(result.success, false);
      assert.ok(result.stderr.includes("fatal"));
    });
  });

  // #532 (plan-532c LD8a, B284): getStatus fails closed, and the rollback helpers.
  describe("rollback guards (#532 B284)", () => {
    const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
    function recording(answer: (args: string[]) => { code: number; stdout: string; stderr: string } | undefined): { runner: CommandRunner; calls: string[][] } {
      const calls: string[][] = [];
      return { calls, runner: async (_cmd, args) => { calls.push(args); return answer(args) ?? ok(); } };
    }

    it("getStatus throws when status, rev-parse or branch exits non-zero (never reads empty output as clean)", async () => {
      for (const failing of ["status --porcelain", "rev-parse HEAD", "branch --show-current"]) {
        const service = new GitResetService(mockRunner({ [failing]: { code: 128, stdout: "", stderr: "fatal: boom\n" } }));
        await assert.rejects(() => service.getStatus("/tmp"), /git .* failed/, failing);
      }
    });

    it("resetKeep runs exactly reset --keep <sha> and validates the target", async () => {
      const { runner, calls } = recording(() => undefined);
      const service = new GitResetService(runner);
      const sha = "a".repeat(40);
      assert.equal((await service.resetKeep("/tmp", sha)).success, true);
      assert.deepEqual(calls, [["reset", "--keep", sha]]);
      await assert.rejects(() => service.resetKeep("/tmp", "--hard"), /Invalid git hash format/);
      assert.equal(calls.length, 1, "an invalid target never reaches git");
    });

    it("isAncestor maps 0 / 1 / other to yes / no / unavailable", async () => {
      const sha = "a".repeat(40);
      for (const [code, want] of [[0, "yes"], [1, "no"], [128, "unavailable"]] as const) {
        const { runner, calls } = recording(() => ({ code, stdout: "", stderr: "" }));
        assert.equal(await new GitResetService(runner).isAncestor("/tmp", sha), want);
        assert.deepEqual(calls, [["merge-base", "--is-ancestor", sha, "HEAD"]]);
      }
    });

    it("countLeaving, describeCommit, workTree and afterReset parse git output; failures are null", async () => {
      const sha = "a".repeat(40);
      const { runner } = recording((a) => {
        const j = a.join(" ");
        if (j === `rev-list --count ${sha}..HEAD`) return ok("3\n");
        if (a[0] === "log") return ok("fix: thing\u00002026-01-01T00:00:00+00:00\n");
        if (j === "rev-parse --show-toplevel") return ok("C:/ws\n");
        if (j === "rev-parse --verify --quiet HEAD@{1}") return ok(`${"b".repeat(40)}\n`);
        if (j === "branch --show-current") return ok("main\n");
        if (j === "rev-parse --verify --quiet HEAD") return ok(`${sha}\n`);
        return undefined;
      });
      const s = new GitResetService(runner);
      assert.equal(await s.countLeaving("/tmp", sha), 3);
      assert.deepEqual(await s.describeCommit("/tmp", sha), { subject: "fix: thing", date: "2026-01-01T00:00:00+00:00" });
      assert.equal(await s.workTree("/tmp"), "C:/ws");
      assert.deepEqual(await s.afterReset("/tmp"), { previousHead: "b".repeat(40), branch: "main", head: sha });
      const failing = new GitResetService(async () => ({ code: 128, stdout: "", stderr: "fatal" }));
      assert.equal(await failing.countLeaving("/tmp", sha), null);
      assert.equal(await failing.describeCommit("/tmp", sha), null);
      assert.equal(await failing.workTree("/tmp"), null);
      await assert.rejects(() => failing.afterReset("/tmp"), /git branch failed/);
    });

    it("afterReset reads the branch with branch --show-current, reports a missing reflog entry as null, and throws when git cannot answer (review N1)", async () => {
      const sha = "a".repeat(40);
      const calls: string[][] = [];
      const noReflog = new GitResetService(async (_c, a) => {
        calls.push(a);
        const j = a.join(" ");
        if (j === "rev-parse --verify --quiet HEAD@{1}") return { code: 1, stdout: "", stderr: "" };
        if (j === "branch --show-current") return ok("\n");
        if (j === "rev-parse --verify --quiet HEAD") return ok(`${sha}\n`);
        return ok();
      });
      assert.deepEqual(await noReflog.afterReset("/tmp"), { previousHead: null, branch: null, head: sha });
      assert.ok(calls.some((c) => c.join(" ") === "branch --show-current"));
      assert.ok(!calls.some((c) => c[0] === "symbolic-ref"), "the branch is read as the plan reads it");
      const broken = new GitResetService(async (_c, a) => (a.join(" ").includes("HEAD@{1}") ? { code: 128, stdout: "", stderr: "fatal: bad" } : ok(a[0] === "branch" ? "main\n" : `${sha}\n`)));
      await assert.rejects(() => broken.afterReset("/tmp"), /HEAD@\{1\}/);
    });
  });
});
