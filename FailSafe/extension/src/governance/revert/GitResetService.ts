import { spawn } from "child_process";

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
    const child = spawn("git", args, {
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
