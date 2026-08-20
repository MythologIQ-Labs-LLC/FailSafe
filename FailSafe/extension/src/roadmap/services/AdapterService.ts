/**
 * AdapterService - Manages the agent-failsafe adapter installation and configuration
 *
 * Handles checking Python/pip availability, installing the adapter from PyPI,
 * verifying Microsoft Agent Governance Toolkit packages, and running health checks.
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { EventBus } from "../../shared/EventBus";
import type {
  AdapterState,
  AdapterInstallOptions,
  AdapterInstallProgress,
  AdapterConfig,
  AdapterHealthCheck,
  AdapterCommandRunner,
  AdapterCommandResult,
  ToolkitPackageStatus,
  ToolkitPackage,
} from "./AdapterTypes";

const DEFAULT_TIMEOUT = 60000; // 1 minute
const ADAPTER_PACKAGE = "agent-failsafe";
const TOOLKIT_PACKAGES: ToolkitPackage[] = [
  "agent-os",
  "agent-mesh",
  "agent-hypervisor",
  "agent-sre",
];

function defaultRunner(
  command: string,
  args: string[],
  cwd?: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<AdapterCommandResult> {
  return new Promise((resolve) => {
    const options = { cwd, shell: false as const, timeout };
    const proc = command === "python3"
      ? spawn("python3", args, options)
      : command === "python"
        ? spawn("python", args, options)
        : command === "pip3"
          ? spawn("pip3", args, options)
          : command === "pip"
            ? spawn("pip", args, options)
            : null;
    if (!proc) {
      resolve({
        code: 126,
        stdout: "",
        stderr: `Unsupported adapter executable: ${command}`,
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

export class AdapterService {
  private readonly runner: AdapterCommandRunner;
  private readonly eventBus: EventBus;
  private readonly configPath: string;
  private cachedState: AdapterState | null = null;

  constructor(eventBus: EventBus, runner?: AdapterCommandRunner) {
    this.runner = runner || defaultRunner;
    this.eventBus = eventBus;
    this.configPath = path.join(os.homedir(), ".failsafe", "adapter", "config.json");
  }

  async checkState(): Promise<AdapterState> {
    const state: AdapterState = {
      adapterInstalled: false,
      pythonAvailable: false,
      pipAvailable: false,
      toolkitPackages: [],
      mcpServerAvailable: false,
      lastCheckedAt: new Date().toISOString(),
    };

    // Check Python availability
    try {
      const pythonResult = await this.runner("python3", ["--version"], undefined, 10000);
      if (pythonResult.code === 0) {
        state.pythonAvailable = true;
        state.pythonVersion = pythonResult.stdout.trim().replace("Python ", "");
      } else {
        // Try 'python' instead
        const pyResult = await this.runner("python", ["--version"], undefined, 10000);
        if (pyResult.code === 0) {
          state.pythonAvailable = true;
          state.pythonVersion = pyResult.stdout.trim().replace("Python ", "");
        }
      }
    } catch {
      state.pythonAvailable = false;
    }

    if (!state.pythonAvailable) {
      state.error = "Python 3.10+ is required but not found";
      this.cachedState = state;
      return state;
    }

    // Check pip availability
    try {
      const pipResult = await this.runner("pip3", ["--version"], undefined, 10000);
      state.pipAvailable = pipResult.code === 0;
      if (!state.pipAvailable) {
        const pip2Result = await this.runner("pip", ["--version"], undefined, 10000);
        state.pipAvailable = pip2Result.code === 0;
      }
    } catch {
      state.pipAvailable = false;
    }

    if (!state.pipAvailable) {
      state.error = "pip is required but not found";
      this.cachedState = state;
      return state;
    }

    // Check if adapter is installed
    try {
      const showResult = await this.runner(
        "pip3",
        ["show", ADAPTER_PACKAGE],
        undefined,
        15000,
      );
      if (showResult.code === 0) {
        state.adapterInstalled = true;
        const versionMatch = showResult.stdout.match(/Version:\s*(\S+)/);
        if (versionMatch) {
          state.adapterVersion = versionMatch[1];
        }
      }
    } catch {
      state.adapterInstalled = false;
    }

    // Check latest version from PyPI (non-blocking)
    this.checkLatestVersion().then((version) => {
      if (version && this.cachedState) {
        this.cachedState.latestVersion = version;
      }
    });

    // Check toolkit packages
    state.toolkitPackages = await this.checkToolkitPackages();

    // Check MCP server availability (FailSafe extension MCP endpoint)
    state.mcpServerAvailable = await this.checkMcpServer();

    this.cachedState = state;
    return state;
  }

  private async checkLatestVersion(): Promise<string | undefined> {
    try {
      const result = await this.runner(
        "pip3",
        ["index", "versions", ADAPTER_PACKAGE],
        undefined,
        15000,
      );
      if (result.code === 0) {
        // Parse output like "agent-failsafe (0.3.0)"
        const match = result.stdout.match(/\((\d+\.\d+\.\d+)\)/);
        return match ? match[1] : undefined;
      }
    } catch {
      // PyPI check failed, non-critical
    }
    return undefined;
  }

  private async checkToolkitPackages(): Promise<ToolkitPackageStatus[]> {
    const results: ToolkitPackageStatus[] = [];

    for (const pkg of TOOLKIT_PACKAGES) {
      try {
        const result = await this.runner(
          "pip3",
          ["show", pkg],
          undefined,
          10000,
        );
        const installed = result.code === 0;
        let version: string | undefined;
        if (installed) {
          const versionMatch = result.stdout.match(/Version:\s*(\S+)/);
          version = versionMatch ? versionMatch[1] : undefined;
        }
        results.push({
          name: pkg,
          installed,
          version,
          required: pkg === "agent-os", // agent-os is the core requirement
        });
      } catch {
        results.push({
          name: pkg,
          installed: false,
          required: pkg === "agent-os",
        });
      }
    }

    return results;
  }

  private async checkMcpServer(): Promise<boolean> {
    // Check if FailSafe MCP server is running by looking for the socket/pipe
    // This is a simplified check - the actual MCP communication happens via stdio
    try {
      // Look for the MCP server process or config
      const configExists = fs.existsSync(
        path.join(os.homedir(), ".failsafe", "mcp", "server.json"),
      );
      return configExists;
    } catch {
      return false;
    }
  }

  async install(
    options: AdapterInstallOptions,
    onProgress: (progress: AdapterInstallProgress) => void,
  ): Promise<{ success: boolean; error?: string }> {
    onProgress({
      phase: "checking",
      progress: 5,
      message: "Checking Python environment...",
    });

    const state = await this.checkState();
    if (!state.pythonAvailable || !state.pipAvailable) {
      onProgress({
        phase: "failed",
        progress: 0,
        message: "Prerequisites not met",
        error: state.error || "Python/pip not available",
      });
      return { success: false, error: state.error };
    }

    // Install the adapter
    onProgress({
      phase: "installing-adapter",
      progress: 20,
      message: `Installing ${ADAPTER_PACKAGE}...`,
    });

    const installArgs = options.upgradeIfExists
      ? ["install", "--upgrade", ADAPTER_PACKAGE]
      : ["install", ADAPTER_PACKAGE];

    try {
      const installResult = await this.runner("pip3", installArgs, undefined, 120000);
      if (installResult.code !== 0) {
        onProgress({
          phase: "failed",
          progress: 0,
          message: "Adapter installation failed",
          error: installResult.stderr || "pip install failed",
        });
        return { success: false, error: installResult.stderr };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      onProgress({
        phase: "failed",
        progress: 0,
        message: "Adapter installation failed",
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }

    onProgress({
      phase: "installing-adapter",
      progress: 50,
      message: "Adapter installed successfully",
    });

    // Optionally install Microsoft Agent Governance Toolkit
    if (options.installToolkit) {
      onProgress({
        phase: "installing-toolkit",
        progress: 55,
        message: "Installing Microsoft Agent Governance Toolkit...",
      });

      for (let i = 0; i < TOOLKIT_PACKAGES.length; i++) {
        const pkg = TOOLKIT_PACKAGES[i];
        onProgress({
          phase: "installing-toolkit",
          progress: 55 + Math.round((i / TOOLKIT_PACKAGES.length) * 30),
          message: `Installing ${pkg}...`,
        });

        try {
          const result = await this.runner(
            "pip3",
            ["install", pkg],
            undefined,
            120000,
          );
          if (result.code !== 0) {
            // Non-fatal for optional packages
            console.warn(`Failed to install ${pkg}:`, result.stderr);
          }
        } catch {
          console.warn(`Failed to install ${pkg}`);
        }
      }
    }

    // Verify installation
    onProgress({
      phase: "verifying",
      progress: 90,
      message: "Verifying installation...",
    });

    const verifyState = await this.checkState();
    if (!verifyState.adapterInstalled) {
      onProgress({
        phase: "failed",
        progress: 0,
        message: "Verification failed",
        error: "Adapter not found after installation",
      });
      return { success: false, error: "Verification failed" };
    }

    // Create default config
    await this.ensureDefaultConfig();

    onProgress({
      phase: "complete",
      progress: 100,
      message: `${ADAPTER_PACKAGE} v${verifyState.adapterVersion} installed successfully`,
    });

    return { success: true };
  }

  async uninstall(
    onProgress: (progress: AdapterInstallProgress) => void,
  ): Promise<{ success: boolean; error?: string }> {
    onProgress({
      phase: "checking",
      progress: 10,
      message: "Uninstalling adapter...",
    });

    try {
      const result = await this.runner(
        "pip3",
        ["uninstall", "-y", ADAPTER_PACKAGE],
        undefined,
        60000,
      );
      if (result.code !== 0) {
        onProgress({
          phase: "failed",
          progress: 0,
          message: "Uninstall failed",
          error: result.stderr,
        });
        return { success: false, error: result.stderr };
      }

      onProgress({
        phase: "complete",
        progress: 100,
        message: "Adapter uninstalled successfully",
      });

      this.cachedState = null;
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      onProgress({
        phase: "failed",
        progress: 0,
        message: "Uninstall failed",
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  }

  async healthCheck(): Promise<AdapterHealthCheck> {
    const details: string[] = [];
    let mcpConnected = false;
    let ledgerAccessible = false;
    let policyFilesFound = false;

    // Check if adapter module can be imported
    try {
      const result = await this.runner(
        "python3",
        ["-c", "import agent_failsafe; print('OK')"],
        undefined,
        10000,
      );
      if (result.code === 0 && result.stdout.includes("OK")) {
        details.push("✓ Adapter module importable");
      } else {
        details.push("✗ Adapter module not importable");
      }
    } catch {
      details.push("✗ Failed to check adapter module");
    }

    // Check ledger database
    const ledgerPath = path.join(process.cwd(), ".failsafe", "ledger", "ledger.db");
    if (fs.existsSync(ledgerPath)) {
      ledgerAccessible = true;
      details.push("✓ Ledger database found");
    } else {
      details.push("✗ Ledger database not found at .failsafe/ledger/ledger.db");
    }

    // Check policy files
    const policyDir = path.join(process.cwd(), ".failsafe", "config", "policies");
    if (fs.existsSync(policyDir)) {
      const files = fs.readdirSync(policyDir).filter((f) => f.endsWith(".yaml"));
      if (files.length > 0) {
        policyFilesFound = true;
        details.push(`✓ Found ${files.length} policy file(s)`);
      } else {
        details.push("✗ No policy YAML files found");
      }
    } else {
      details.push("✗ Policy directory not found");
    }

    // Check MCP server
    const mcpConfig = path.join(os.homedir(), ".failsafe", "mcp", "server.json");
    if (fs.existsSync(mcpConfig)) {
      mcpConnected = true;
      details.push("✓ MCP server configuration found");
    } else {
      details.push("○ MCP server not configured (adapter will use local client)");
    }

    const healthy = ledgerAccessible || policyFilesFound;

    return {
      healthy,
      mcpConnected,
      ledgerAccessible,
      policyFilesFound,
      details,
    };
  }

  getConfig(): AdapterConfig | null {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
      }
    } catch {
      // Config doesn't exist or is invalid
    }
    return null;
  }

  async saveConfig(config: AdapterConfig): Promise<void> {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  private async ensureDefaultConfig(): Promise<void> {
    if (this.getConfig()) return;

    const defaultConfig: AdapterConfig = {
      mcpServerCommand: ["failsafe", "mcp", "serve"],
      failOpen: true,
      trustThresholds: {
        cbt: 0.5,
        kbt: 0.8,
      },
    };

    await this.saveConfig(defaultConfig);
  }

  getCachedState(): AdapterState | null {
    return this.cachedState;
  }
}
