// FX906 (#83 Phase A) — resolveGitDirs: worktree-correct git-dir resolution.
// Written FIRST per TDD. Proven against REAL `git init` / `git worktree add`
// checkouts so the "hooks live in the common dir" semantics are empirical,
// not grep-shaped (SG-GrepShapedRunclaim-A).
import { describe, it, before, after } from "mocha";
import { strict as assert } from "assert";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveGitDirs } from "../../governance/gitDirs";

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
}

describe("resolveGitDirs (FX906)", function () {
  this.timeout(20000);
  let base: string;
  let repo: string;
  let worktree: string;

  before(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "gitdirs-"));
    repo = path.join(base, "repo");
    worktree = path.join(base, "wt");
    fs.mkdirSync(repo);
    git(repo, "init");
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-m", "seed");
    git(repo, "worktree", "add", worktree);
  });

  after(() => {
    try {
      fs.rmSync(base, { recursive: true, force: true });
    } catch {
      // Windows temp-dir lock tolerance
    }
  });

  it("T1: main checkout — gitDir and commonDir are both <root>/.git (absolute)", () => {
    const dirs = resolveGitDirs(repo);
    assert.equal(path.resolve(dirs.gitDir), path.resolve(path.join(repo, ".git")));
    assert.equal(path.resolve(dirs.commonDir), path.resolve(path.join(repo, ".git")));
    assert.ok(path.isAbsolute(dirs.gitDir), "gitDir must be absolute");
  });

  it("T2: worktree checkout — gitDir is per-worktree, commonDir is the MAIN .git", () => {
    const dirs = resolveGitDirs(worktree);
    assert.ok(
      /[\\/]\.git[\\/]worktrees[\\/]/.test(dirs.gitDir),
      `gitDir must be the per-worktree dir, got ${dirs.gitDir}`,
    );
    assert.equal(
      path.resolve(dirs.commonDir),
      path.resolve(path.join(repo, ".git")),
      "commonDir must resolve to the main checkout's .git",
    );
  });

  it("T3: git failure (nonexistent cwd) — falls back to <root>/.git for both, no throw", () => {
    // Hermetic on any machine: a nonexistent cwd makes the git spawn itself
    // fail, exercising the fallback branch. (A merely-plain temp dir is NOT
    // hermetic — ambient ancestor repos, e.g. a stray .git at the drive
    // root, legitimately resolve through upward discovery.)
    const ghost = path.join(os.tmpdir(), "gitdirs-ghost-", "definitely-missing");
    const dirs = resolveGitDirs(ghost);
    assert.equal(dirs.gitDir, path.join(ghost, ".git"));
    assert.equal(dirs.commonDir, path.join(ghost, ".git"));
  });
});
