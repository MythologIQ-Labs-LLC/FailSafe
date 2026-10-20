import { spawn } from "child_process";
import { trustedGitPath } from "../../shared/git/trustedGit";

const GIT_HASH_RE = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

export interface GitStatus {
  clean: boolean;
  currentBranch: string;
  currentHash: string;
  uncommittedFiles: string[];
}

export interface GitLogEntry {
  hash: string;
  subject: string;
  timestamp: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  cwd?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;

export class GitResetService {
  private readonly runner: CommandRunner;

  constructor(runner?: CommandRunner) {
    this.runner = runner || defaultRunner;
  }

  async getStatus(cwd: string): Promise<GitStatus> {
    const [porcelain, head, branch] = await Promise.all([
      this.run(["status", "--porcelain"], cwd),
      this.run(["rev-parse", "HEAD"], cwd),
      this.run(["branch", "--show-current"], cwd),
    ]);
    const lines = porcelain.stdout.split("\n").filter((l) => l.length > 0);
    const uncommittedFiles = lines.map((line) => line.slice(3));
    return {
      clean: lines.length === 0,
      currentBranch: branch.stdout.trim(),
      currentHash: head.stdout.trim(),
      uncommittedFiles,
    };
  }

  async getLog(
    cwd: string,
    sinceHash: string,
    limit = 50,
  ): Promise<GitLogEntry[]> {
    if (!GIT_HASH_RE.test(sinceHash)) {
      throw new Error("Invalid git hash format: expected 40 or 64 hex chars");
    }
    const result = await this.run(
      ["log", `--format=%H|%s|%aI`, `${sinceHash}..HEAD`, `-${limit}`],
      cwd,
    );
    if (result.code !== 0) {
      return [];
    }
    return result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, subject, timestamp] = line.split("|", 3);
        return { hash: hash!, subject: subject!, timestamp: timestamp! };
      });
  }

  async resetHard(
    cwd: string,
    targetHash: string,
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    if (!GIT_HASH_RE.test(targetHash)) {
      throw new Error("Invalid git hash format: expected 40 or 64 hex chars");
    }
    const result = await this.run(["reset", "--hard", targetHash], cwd);
    return {
      success: result.code === 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  /** #532 (plan-532c LD8a): `git reset --keep <target>`; never overwrites a changed file the reset would touch. */
  async resetKeep(cwd: string, targetHash: string): Promise<{ success: boolean; stdout: string; stderr: string }> {
    void cwd; void targetHash; // RED STUB
    return { success: false, stdout: "", stderr: "not implemented" };
  }

  /** `merge-base --is-ancestor <target> HEAD`: yes (0), no (1), or unavailable. */
  async isAncestor(cwd: string, targetHash: string): Promise<"yes" | "no" | "unavailable"> {
    void cwd; void targetHash; // RED STUB
    return "yes";
  }

  /** `rev-list --count <target>..HEAD`, or null when git cannot answer. */
  async countLeaving(cwd: string, targetHash: string): Promise<number | null> {
    void cwd; void targetHash; // RED STUB
    return 0;
  }

  /** Subject and committer date of a commit (`log -1 --format=%s%x00%cI`), or null. */
  async describeCommit(cwd: string, targetHash: string): Promise<{ subject: string; date: string } | null> {
    void cwd; void targetHash; // RED STUB
    return { subject: "", date: "" };
  }

  /** `rev-parse --show-toplevel`, or null. */
  async workTree(cwd: string): Promise<string | null> {
    void cwd; // RED STUB
    return cwd;
  }

  /** After a reset: HEAD@{1}, the current branch (null when detached) and HEAD. Unreadable values are null. */
  async afterReset(cwd: string): Promise<{ previousHead: string | null; branch: string | null; head: string | null }> {
    void cwd; // RED STUB
    return { previousHead: null, branch: null, head: null };
  }

  private run(
    args: string[],
    cwd: string,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return this.runner("git", args, cwd);
  }
}

function defaultRunner(
  command: string,
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  if (command !== "git") {
    return Promise.resolve({
      code: 126,
      stdout: "",
      stderr: `Unsupported GitResetService executable: ${command}`,
    });
  }
  return new Promise((resolve, reject) => {
    const child = spawn(trustedGitPath(cwd), args, { // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute git path, argv array, no shell
      cwd,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
