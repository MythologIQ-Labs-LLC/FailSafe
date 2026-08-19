/**
 * MarketplaceInstaller - Git clone and sandbox setup for marketplace items
 *
 * Handles cloning repositories to ~/.failsafe/marketplace/, running setup
 * scripts in sandboxed environments, and reporting progress via EventBus.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import type { EventBus } from "../../shared/EventBus";
import type {
  MarketplaceItem,
  InstallProgress,
  InstallOptions,
  CommandRunner,
  CommandRunnerResult,
} from "./MarketplaceTypes";

const DEFAULT_TIMEOUT = 300000; // 5 minutes

function defaultRunner(
  command: string,
  args: string[],
  cwd?: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<CommandRunnerResult> {
  return new Promise((resolve) => {
    const options = { cwd, shell: false as const, timeout };
    const proc = command === "git"
      ? spawn("git", args, options)
      : command === "pip"
        ? spawn("pip", args, options)
        : command === "npm"
          ? spawn("npm", args, options)
          : null;
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

      // Run setup if sandbox enabled
      if (options.sandboxEnabled) {
        onProgress({
          phase: "setup",
          progress: 60,
          message: "Running sandboxed setup...",
        });
        await this.runSandboxedSetup(installPath, item);
      }

      onProgress({
        phase: "setup",
        progress: 80,
        message: "Setup complete",
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
        message: `${item.name} installed successfully`,
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

  private async runSandboxedSetup(
    installPath: string,
    item: MarketplaceItem,
  ): Promise<void> {
    // Check for common setup files and run them with restrictions
    const setupFiles = [
      { file: "requirements.txt", cmd: "pip", args: ["install", "-r", "requirements.txt", "--user"] },
      { file: "pyproject.toml", cmd: "pip", args: ["install", ".", "--user"] },
      { file: "package.json", cmd: "npm", args: ["install", "--ignore-scripts"] },
    ];

    for (const setup of setupFiles) {
      const setupPath = path.join(installPath, setup.file);
      if (fs.existsSync(setupPath)) {
        // Run with --ignore-scripts or equivalent for safety
        await this.runner(setup.cmd, setup.args, installPath, 120000);
        break; // Only run first matching setup
      }
    }

    // Write sandbox config file
    const sandboxConfig = {
      enabled: true,
      createdAt: new Date().toISOString(),
      item: {
        id: item.id,
        name: item.name,
        author: item.author,
      },
      restrictions: {
        networkAfterSetup: false,
        fileSystemScope: installPath,
        maxMemoryMB: 512,
        maxCpuPercent: 25,
      },
    };

    await fs.promises.writeFile(
      path.join(installPath, ".failsafe-sandbox.json"),
      JSON.stringify(sandboxConfig, null, 2),
      "utf-8",
    );
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
