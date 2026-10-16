/**
 * MarketplaceInstaller - Git clone staging for marketplace items
 *
 * Clones repositories to ~/.failsafe/marketplace/ for review and reports
 * progress via EventBus. It never runs an item's package setup (#468): there
 * is no enforced sandbox, and pip or npm on the host is not isolation.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { trustedGitPath } from "../../shared/git/trustedGit";
import type { EventBus } from "../../shared/EventBus";
import type {
  MarketplaceItem,
  InstallProgress,
  InstallOptions,
  CommandRunner,
  CommandRunnerResult,
} from "./MarketplaceTypes";

// Release gate (#468/#469). It stays false until every condition below holds;
// the cycle that sets it to true must show each one:
//  1. an isolation provider that enforces filesystem, network, process and
//     credential limits for setup, with OS-level negative tests on every
//     supported platform;
//  2. staged installation: clone into a staging folder, scan, then promote,
//     keeping the previous installation until promotion and restoring it on
//     failure;
//  3. a repository scanner whose PASS is evidence about the item's files
//     (garak and promptfoo run from an empty folder and never read them);
//  4. the v6.0.7 G12 obligation: a planted-git row for the clone and pull, and
//     planted-executable rows for every scanner;
//  5. an end-to-end test of install, quarantine and re-scan through the Console.
export const MARKETPLACE_INSTALLS_ENABLED = false;
const DEFAULT_TIMEOUT = 300000; // 5 minutes

function defaultRunner(
  command: string,
  args: string[],
  cwd?: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<CommandRunnerResult> {
  return new Promise((resolve) => {
    const options = { cwd, shell: false as const, timeout };
    let proc: ReturnType<typeof spawn> | null;
    try {
      // Only git: an item's setup (pip, npm) is never run on the host (#468).
      proc = command === "git"
        ? spawn(trustedGitPath(cwd), args, options) // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute git path, argv array, no shell
        : null;
    } catch (err) {
      resolve({ code: 1, stdout: "", stderr: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!proc) {
      resolve({
        code: 126,
        stdout: "",
        stderr: `Unsupported marketplace executable: ${command}`,
      });
      return;
    }

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });

    proc.on("error", (err) => {
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
}

export class MarketplaceInstaller {
  private readonly runner: CommandRunner;
  private readonly cachePath: string;
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus, runner?: CommandRunner) {
    this.runner = runner || defaultRunner;
    this.cachePath = path.join(os.homedir(), ".failsafe", "marketplace");
    this.eventBus = eventBus;
  }

  async install(
    item: MarketplaceItem,
    options: InstallOptions,
    onProgress: (progress: InstallProgress) => void,
  ): Promise<{ success: boolean; installPath?: string; error?: string }> {
    if (!MARKETPLACE_INSTALLS_ENABLED) {
      const error = "Marketplace installation disabled pending isolation and scanner remediation (#468/#469)";
      onProgress({ phase: "failed", progress: 0, message: error, error });
      return { success: false, error };
    }
    return this.stage(item, options, onProgress);
  }

  /**
   * Clone an item for review. Nothing else runs: a request for setup is
   * refused before any folder is created or removed. Only install() calls this,
   * after the release gate.
   */
  async stage(
    item: MarketplaceItem,
    options: InstallOptions,
    onProgress: (progress: InstallProgress) => void,
  ): Promise<{ success: boolean; installPath?: string; error?: string }> {
    if (options.sandboxEnabled) {
      const error = "Isolated setup is not available. FailSafe has no enforced sandbox, so it will not run this item's setup. "
        + "Install without setup to clone the item for review, or set it up yourself in an isolated environment.";
      onProgress({ phase: "failed", progress: 0, message: "Isolated setup is not available", error });
      return { success: false, error };
    }
    const installPath = path.join(this.cachePath, item.id);

    try {
      // Ensure cache directory exists
      await fs.promises.mkdir(this.cachePath, { recursive: true });

      // Check if already installed
      if (fs.existsSync(installPath)) {
        onProgress({
          phase: "cloning",
          progress: 5,
          message: "Removing existing installation...",
        });
        await fs.promises.rm(installPath, { recursive: true, force: true });
      }

      // Clone repository
      onProgress({
        phase: "cloning",
        progress: 10,
        message: `Cloning ${item.name} from ${item.repoUrl}...`,
      });

      const cloneResult = await this.cloneRepo(item, installPath);
      if (!cloneResult.success) {
        onProgress({
          phase: "failed",
          progress: 0,
          message: "Clone failed",
          error: cloneResult.error,
        });
        return { success: false, error: cloneResult.error };
      }

      onProgress({
        phase: "cloning",
        progress: 50,
        message: "Repository cloned successfully",
      });

      // Clone-only staging: the item's setup is never run (#468).
      onProgress({
        phase: "setup",
        progress: 80,
        message: "Cloned for review. No setup was run.",
      });

      // Security scan happens separately via SecurityScanner
      // Just mark as ready for scanning
      if (options.runSecurityScan) {
        onProgress({
          phase: "scanning",
          progress: 90,
          message: "Ready for security scan...",
        });
      }

      onProgress({
        phase: "complete",
        progress: 100,
        message: `${item.name} cloned for review. Its setup was not run.`,
      });

      return { success: true, installPath };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onProgress({
        phase: "failed",
        progress: 0,
        message: "Installation failed",
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  }

  private async cloneRepo(
    item: MarketplaceItem,
    targetPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    const args = [
      "clone",
      "--depth",
      "1",
      "--single-branch",
      "--branch",
      item.repoRef || "main",
      item.repoUrl,
      targetPath,
    ];

    const result = await this.runner("git", args, undefined, DEFAULT_TIMEOUT);

    if (result.code !== 0) {
      return {
        success: false,
        error: result.stderr || `Git clone failed with code ${result.code}`,
      };
    }

    return { success: true };
  }

  async uninstall(item: MarketplaceItem): Promise<boolean> {
    const installPath = path.join(this.cachePath, item.id);

    try {
      if (fs.existsSync(installPath)) {
        await fs.promises.rm(installPath, { recursive: true, force: true });
      }
      return true;
    } catch (error) {
      console.error(`Failed to uninstall ${item.id}:`, error);
      return false;
    }
  }

  async update(
    item: MarketplaceItem,
    onProgress: (progress: InstallProgress) => void,
  ): Promise<{ success: boolean; error?: string }> {
    if (!MARKETPLACE_INSTALLS_ENABLED) return { success: false, error: "Marketplace updates disabled pending security remediation (#468/#469)" };
    const installPath = path.join(this.cachePath, item.id);

    if (!fs.existsSync(installPath)) {
      return { success: false, error: "Item not installed" };
    }

    onProgress({
      phase: "cloning",
      progress: 20,
      message: "Pulling latest changes...",
    });

    const result = await this.runner(
      "git",
      ["pull", "--rebase", "origin", item.repoRef || "main"],
      installPath,
      DEFAULT_TIMEOUT,
    );

    if (result.code !== 0) {
      onProgress({
        phase: "failed",
        progress: 0,
        message: "Update failed",
        error: result.stderr,
      });
      return { success: false, error: result.stderr };
    }

    onProgress({
      phase: "complete",
      progress: 100,
      message: `${item.name} updated successfully`,
    });

    return { success: true };
  }

  isInstalled(itemId: string): boolean {
    return fs.existsSync(path.join(this.cachePath, itemId));
  }

  getInstallPath(itemId: string): string {
    return path.join(this.cachePath, itemId);
  }
}
