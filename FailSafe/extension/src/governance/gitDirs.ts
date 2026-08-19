// #83 Phase A (FX906): worktree-correct git-dir resolution.
//
// In a linked worktree, `<checkout>/.git` is a FILE (a `gitdir:` pointer),
// the per-worktree git dir lives at `<main>/.git/worktrees/<name>`, and
// shared machinery (hooks/, config) lives in the COMMON dir. Anything that
// treats `.git` as a directory breaks there (the CommitGuard ENOTDIR class).
import { spawnSync } from "child_process";
import * as path from "path";

export interface GitDirs {
  /** Per-checkout git dir — where `git rev-parse --git-dir` points. */
  gitDir: string;
  /** Shared dir (hooks/, config) — `--git-common-dir`; equals gitDir on a main checkout. */
  commonDir: string;
}

/**
 * Resolve the checkout's git dirs via `git rev-parse`. Falls back to the
 * classic `<root>/.git` for both when git is absent or the directory is not
 * a repository — exactly the legacy behavior on a main checkout.
 */
export function resolveGitDirs(workspaceRoot: string): GitDirs {
  const fallback = path.join(workspaceRoot, ".git");
  try {
    const r = spawnSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
      { cwd: workspaceRoot, encoding: "utf8", timeout: 5000 },
    );
    if (r.status !== 0 || !r.stdout) {
      return { gitDir: fallback, commonDir: fallback };
    }
    const [gitDir, commonDir] = r.stdout.trim().split(/\r?\n/);
    if (!gitDir) {
      return { gitDir: fallback, commonDir: fallback };
    }
    return { gitDir, commonDir: commonDir || gitDir };
  } catch {
    return { gitDir: fallback, commonDir: fallback };
  }
}
