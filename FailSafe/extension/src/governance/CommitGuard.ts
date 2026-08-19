import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { resolveGitDirs, GitDirs } from "./gitDirs";

export interface HookDetection {
  exists: boolean;
  path: string;
  type: "raw" | "husky" | "pre-commit-framework" | "none";
}

export class CommitGuard {
  private token: string | null = null;
  private readonly commonDir: string;
  private readonly hookDir: string;
  private readonly hookPath: string;
  private readonly tokenPath: string;
  private readonly backupSuffix = ".failsafe-original";

  constructor(
    private readonly workspaceRoot: string,
    private readonly apiPort: number | (() => number),
    dirs?: GitDirs,
  ) {
    // #83 Phase A: worktree-correct paths. In a linked worktree `.git` is a
    // FILE — hooks live in the COMMON dir (shared across worktrees; one
    // install governs all), while the token must sit in the per-checkout
    // gitDir because the hook script reads $(git rev-parse --git-dir).
    const resolved = dirs ?? resolveGitDirs(workspaceRoot);
    this.commonDir = resolved.commonDir;
    this.hookDir = path.join(resolved.commonDir, "hooks");
    this.hookPath = path.join(this.hookDir, "pre-commit");
    this.tokenPath = path.join(resolved.gitDir, "failsafe-hook-token");
  }

  generateToken(): string {
    this.token = crypto.randomUUID();
    return this.token;
  }

  validateToken(t: string): boolean {
    if (!this.token || !t) {
      return false;
    }
    const expected = Buffer.from(this.token, "utf8");
    const received = Buffer.from(t, "utf8");
    if (expected.length !== received.length) {
      return false;
    }
    return crypto.timingSafeEqual(expected, received);
  }

  async install(): Promise<void> {
    const detection = await this.detectExistingHooks();
    await this.chainExistingHook(detection);
    await this.writeHookScript();
    await this.persistToken();
  }

  async uninstall(): Promise<void> {
    const backupPath = this.hookPath + this.backupSuffix;
    if (fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, this.hookPath);
    } else if (await this.isInstalled()) {
      // Only remove hookPath if it is still FailSafe's own script. A prior
      // uninstall() may already have consumed the backup and restored the
      // user's real hook (or another actor may have written an unrelated
      // file there); unconditionally deleting it would destroy that file.
      fs.unlinkSync(this.hookPath);
    }
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath);
    }
    this.token = null;
  }

  async isInstalled(): Promise<boolean> {
    if (!fs.existsSync(this.hookPath)) {
      return false;
    }
    const content = fs.readFileSync(this.hookPath, "utf8");
    return content.includes("FailSafe Pre-Commit Guard");
  }

  private async detectExistingHooks(): Promise<HookDetection> {
    if (
      fs.existsSync(path.join(this.workspaceRoot, ".pre-commit-config.yaml"))
    ) {
      return {
        exists: true,
        path: this.hookPath,
        type: "pre-commit-framework",
      };
    }
    if (this.readGitConfigHooksPath() !== null) {
      return { exists: true, path: this.hookPath, type: "husky" };
    }
    if (fs.existsSync(this.hookPath)) {
      return { exists: true, path: this.hookPath, type: "raw" };
    }
    return { exists: false, path: this.hookPath, type: "none" };
  }

  /** Reads core.hooksPath from the shared git config without spawning a shell process. */
  private readGitConfigHooksPath(): string | null {
    const gitConfigPath = path.join(this.commonDir, "config");
    if (!fs.existsSync(gitConfigPath)) {
      return null;
    }
    const content = fs.readFileSync(gitConfigPath, "utf8");
    const match = content.match(/^\s*hooksPath\s*=\s*(.+)$/m);
    return match ? match[1].trim() : null;
  }

  private async chainExistingHook(detection: HookDetection): Promise<void> {
    if (!detection.exists || detection.type === "none") {
      return;
    }
    if (!fs.existsSync(this.hookPath)) {
      return;
    }
    const backupPath = this.hookPath + this.backupSuffix;
    if (!fs.existsSync(backupPath)) {
      fs.renameSync(this.hookPath, backupPath);
    }
  }

  private async writeHookScript(): Promise<void> {
    if (!fs.existsSync(this.hookDir)) {
      fs.mkdirSync(this.hookDir, { recursive: true });
    }
    const backupPath = this.hookPath + this.backupSuffix;
    const chainLine = fs.existsSync(backupPath)
      ? `\n# Chain to original hook\n"${backupPath}" "$@" || exit $?\n`
      : "";
    // Lazy port: resolved at write time so the hook carries the ConsoleServer's
    // actual bound port, not a compile-time constant.
    const port = typeof this.apiPort === "function" ? this.apiPort() : this.apiPort;
    const script = [
      "#!/bin/sh",
      "# FailSafe Pre-Commit Guard — thin client querying commit-check endpoint",
      `FAILSAFE_PORT="${port}"`,
      `TOKEN_FILE="$(git rev-parse --git-dir)/failsafe-hook-token"`,
      "",
      'if [ ! -f "$TOKEN_FILE" ]; then',
      "  exit 0",
      "fi",
      "",
      'TOKEN=$(cat "$TOKEN_FILE")',
      "response=$(curl -sf --max-time 2 \\",
      '  -H "X-FailSafe-Token: $TOKEN" \\',
      `  "http://127.0.0.1:\${FAILSAFE_PORT}/api/v1/governance/commit-check" 2>/dev/null)`,
      "",
      "if [ $? -ne 0 ]; then",
      "  exit 0",
      "fi",
      "",
      'allow=$(echo "$response" | grep -o \'"allow":true\')',
      'if [ -z "$allow" ]; then',
      '  reason=$(echo "$response" | grep -o \'"reason":"[^"]*"\' | cut -d\'"\' -f4)',
      '  echo "[FailSafe] Commit blocked: $reason"',
      "  exit 1",
      "fi",
      chainLine + "exit 0",
      "",
    ].join("\n");

    fs.writeFileSync(this.hookPath, script, { mode: 0o755 });
  }

  private async persistToken(): Promise<void> {
    const token = this.generateToken();
    // Note: mode 0600 is POSIX-only; on Windows this has no effect (NTFS ignores POSIX permission bits)
    fs.writeFileSync(this.tokenPath, token, { mode: 0o600 });
  }
}
