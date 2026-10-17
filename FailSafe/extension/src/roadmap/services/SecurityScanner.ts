/**
 * SecurityScanner - Garak and Promptfoo integration for marketplace security
 *
 * Checks availability of security tools, runs scans on installed repositories,
 * parses output into standardized SecurityScanResult format.
 *
 * v6.0.8 (#469): a verdict is PASS only with exit 0, parseable non-empty
 * results and an explicit verdict on every entry; anything else is an
 * inconclusive L3 review. (#468): garak and promptfoo are started only through
 * the trusted resolver (never npx, which installs a missing package from the
 * registry when stdin is not a terminal), each from a fresh empty folder, never
 * from the item's folder. From an empty folder neither tool reads the item, so
 * runFullScan never reports PASS until a repository scanner exists.
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { trustedGitPath } from "../../shared/git/trustedGit";
import { GARAK, PROMPTFOO, trustedExecutablePath } from "../../shared/exec/trustedExecutable";
import type { EventBus } from "../../shared/EventBus";
import type {
  SecurityScanResult,
  SecurityFinding,
  RiskGrade,
  CommandRunner,
  CommandRunnerResult,
  ScannerAvailability,
} from "./MarketplaceTypes";

const SCAN_TIMEOUT = 300000; // 5 minutes

/** Nothing an item ships may be chosen as a scanner. */
const marketplaceRoot = (): string => path.join(os.homedir(), ".failsafe", "marketplace");

/** Fresh empty folder for one scanner run. */
function freshScanDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-scan-"));
}

/** Remove a scan folder; a descendant still holding it (EBUSY/EPERM) leaves it in the OS temp area. */
export function removeScanDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Left for the OS temp cleanup; the scan result does not depend on it.
  }
}

function defaultRunner(
  command: string,
  args: string[],
  cwd?: string,
  timeout = SCAN_TIMEOUT,
): Promise<CommandRunnerResult> {
  return new Promise((resolve) => {
    const options = { cwd, shell: false as const, timeout };
    let proc: ReturnType<typeof spawn> | null;
    let exe: string | undefined;
    try {
      exe = command === "garak"
        ? trustedExecutablePath(GARAK, cwd, [marketplaceRoot()])
        : command === "promptfoo"
          ? trustedExecutablePath(PROMPTFOO, cwd, [marketplaceRoot()])
          : undefined;
    } catch (err) {
      resolve({ code: 127, stdout: "", stderr: err instanceof Error ? err.message : String(err) });
      return;
    }
    try {
      proc = exe
        ? spawn(exe, args, options) // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute scanner path, argv array, no shell
        : command === "git"
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
        stderr: `Unsupported scanner executable: ${command}`,
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

export class SecurityScanner {
  private readonly runner: CommandRunner;
  private readonly eventBus: EventBus;
  private garakAvailable = false;
  private promptfooAvailable = false;
  private lastChecked = "";

  constructor(eventBus: EventBus, runner?: CommandRunner) {
    this.runner = runner || defaultRunner;
    this.eventBus = eventBus;
  }

  /** Run one scanner command from a fresh empty folder, never the item's folder. */
  private async runIsolated(command: "garak" | "promptfoo", args: string[], timeout: number): Promise<CommandRunnerResult> {
    const dir = freshScanDir();
    try {
      return await this.runner(command, args, dir, timeout);
    } finally {
      removeScanDir(dir);
    }
  }

  async checkAvailability(): Promise<ScannerAvailability> {
    // Check Garak
    try {
      const garakResult = await this.runIsolated("garak", ["--version"], 10000);
      this.garakAvailable = garakResult.code === 0;
    } catch {
      this.garakAvailable = false;
    }

    // Check Promptfoo (started directly: npx would install a missing package and run it)
    try {
      const promptfooResult = await this.runIsolated("promptfoo", ["--version"], 15000);
      this.promptfooAvailable = promptfooResult.code === 0;
    } catch {
      this.promptfooAvailable = false;
    }

    this.lastChecked = new Date().toISOString();

    return {
      garak: this.garakAvailable,
      promptfoo: this.promptfooAvailable,
      lastChecked: this.lastChecked,
    };
  }

  async scanWithGarak(
    installPath: string,
    onProgress: (msg: string) => void,
  ): Promise<SecurityScanResult> {
    if (!this.garakAvailable) {
      return this.createUnavailableResult("garak");
    }

    onProgress("Running Garak security analysis...");

    // Garak probes for common LLM vulnerabilities. It runs from an empty folder:
    // the item's folder is untrusted content (#468).
    const result = await this.runIsolated(
      "garak",
      [
        "--model_type", "local",
        "--probes", "promptinject,encoding,knownbadsignatures",
        "--report", "json",
      ],
      SCAN_TIMEOUT,
    );

    return this.parseGarakOutput(result);
  }

  async scanWithPromptfoo(
    installPath: string,
    onProgress: (msg: string) => void,
  ): Promise<SecurityScanResult> {
    if (!this.promptfooAvailable) {
      return this.createUnavailableResult("promptfoo");
    }

    onProgress("Running Promptfoo red team evaluation...");

    // From an empty folder: the item's promptfoo config could name providers that run code (#468).
    const result = await this.runIsolated(
      "promptfoo",
      ["redteam", "run", "--output", "json"],
      SCAN_TIMEOUT,
    );

    return this.parsePromptfooOutput(result);
  }

  async runFullScan(
    installPath: string,
    onProgress: (msg: string) => void,
  ): Promise<SecurityScanResult> {
    const results: SecurityScanResult[] = [];

    // Run available scanners
    if (this.garakAvailable) {
      onProgress("Running Garak scan...");
      results.push(await this.scanWithGarak(installPath, onProgress));
    }

    if (this.promptfooAvailable) {
      onProgress("Running Promptfoo scan...");
      results.push(await this.scanWithPromptfoo(installPath, onProgress));
    }

    // If no scanners available, return manual review recommendation
    if (results.length === 0) {
      onProgress("No automated scanners available - manual review required");
      return {
        passed: false,
        scanner: "none",
        timestamp: new Date().toISOString(),
        findings: [{
          severity: "info",
          category: "scanner",
          description: "No automated security scanners available. Install Garak or Promptfoo for automated scanning.",
        }],
        riskGrade: "L3",
        recommendedAction: "review",
      };
    }

    const combined = this.combineResults(results);
    if (!combined.passed) return combined;
    // Both tools ran from an empty folder, so a pass says nothing about the item (#468, lift condition 3).
    return {
      ...combined,
      passed: false,
      riskGrade: "L3",
      recommendedAction: "review",
      findings: [...combined.findings, {
        severity: "info",
        category: "scanner",
        description: "The scanners did not read the item's files, so their pass is not evidence about it. Manual review required.",
      }],
    };
  }

  async runStaticAnalysis(
    installPath: string,
    onProgress: (msg: string) => void,
  ): Promise<SecurityFinding[]> {
    onProgress("Running static analysis for secrets and vulnerabilities...");
    const findings: SecurityFinding[] = [];

    // Basic static checks (can be expanded)
    const suspiciousPatterns = [
      { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/, category: "secrets", description: "Potential hardcoded API key" },
      { pattern: /password\s*=\s*['"][^'"]+['"]/, category: "secrets", description: "Potential hardcoded password" },
      { pattern: /eval\s*\(/, category: "code-execution", description: "Potentially dangerous eval() usage" },
      { pattern: /exec\s*\(/, category: "code-execution", description: "Potentially dangerous exec() usage" },
      { pattern: /subprocess\s*\.\s*(call|run|Popen)/, category: "code-execution", description: "Subprocess execution detected" },
    ];

    try {
      // Use grep to scan for patterns (cross-platform via git grep)
      const result = await this.runner(
        "git",
        ["grep", "-n", "-E", "(api[_-]?key|password|eval\\(|exec\\()"],
        installPath,
        30000,
      );

      if (result.stdout) {
        const lines = result.stdout.split("\n").filter(Boolean);
        for (const line of lines.slice(0, 50)) { // Limit findings
          const [fileLine, ...contentParts] = line.split(":");
          const content = contentParts.join(":");
          const [file, lineNum] = fileLine.split(":");

          for (const { pattern, category, description } of suspiciousPatterns) {
            if (pattern.test(content)) {
              findings.push({
                severity: category === "secrets" ? "high" : "medium",
                category,
                description,
                file,
                line: parseInt(lineNum, 10) || undefined,
              });
              break;
            }
          }
        }
      }
    } catch {
      // Static analysis failed - non-fatal
    }

    return findings;
  }

  private createUnavailableResult(scanner: "garak" | "promptfoo"): SecurityScanResult {
    return {
      passed: false,
      scanner,
      timestamp: new Date().toISOString(),
      findings: [{
        severity: "info",
        category: "scanner",
        description: `${scanner === "garak" ? "Garak" : "Promptfoo"} is not installed or not available`,
      }],
      riskGrade: "L3",
      recommendedAction: "review",
    };
  }

  /** A failed or ambiguous scanner run is never a clean scan: L3 review naming the cause. */
  private inconclusiveScan(scanner: "garak" | "promptfoo", cause: string, output: string): SecurityScanResult {
    const name = scanner === "garak" ? "Garak" : "Promptfoo";
    return {
      passed: false,
      scanner,
      timestamp: new Date().toISOString(),
      findings: [{ severity: "info", category: "scanner", description: `${name} result is inconclusive: ${cause}` }],
      riskGrade: "L3",
      recommendedAction: "review",
      ...(scanner === "garak" ? { garakOutput: output.slice(0, 5000) } : { promptfooOutput: output.slice(0, 5000) }),
    };
  }

  /** The single JSON object in stdout, or undefined. */
  private parseJsonObject(stdout: string): Record<string, unknown> | undefined {
    const start = stdout.indexOf("{");
    const end = stdout.lastIndexOf("}") + 1;
    if (start < 0 || end <= start) return undefined;
    try {
      const json: unknown = JSON.parse(stdout.slice(start, end));
      return json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : undefined;
    } catch {
      return undefined;
    }
  }

  /** PASS only with exit 0, at least one probe, and a numeric fail_rate from 0 to 1 on every probe, all 0. */
  private parseGarakOutput(result: CommandRunnerResult): SecurityScanResult {
    if (result.code !== 0) return this.inconclusiveScan("garak", `exited with code ${result.code}`, result.stdout);
    const json = this.parseJsonObject(result.stdout);
    if (!json) return this.inconclusiveScan("garak", "no parseable JSON result", result.stdout);
    const results = json.results;
    if (!results || typeof results !== "object" || Array.isArray(results)) {
      return this.inconclusiveScan("garak", "no parseable results object", result.stdout);
    }
    const probes = Object.values(results as Record<string, unknown>);
    if (probes.length === 0) return this.inconclusiveScan("garak", "no completed probes", result.stdout);
    const findings: SecurityFinding[] = [];
    for (const probe of probes) {
      const p = probe as { name?: unknown; fail_rate?: unknown } | null;
      const rate = p?.fail_rate;
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1) {
        return this.inconclusiveScan("garak", "a probe has no valid fail_rate", result.stdout);
      }
      if (rate > 0) {
        findings.push({
          severity: rate > 0.5 ? "high" : "medium",
          category: "vulnerability",
          description: `Probe ${String(p?.name ?? "unnamed")}: ${Math.round(rate * 100)}% fail rate`,
        });
      }
    }
    const passed = findings.length === 0;
    return {
      passed,
      scanner: "garak",
      timestamp: new Date().toISOString(),
      findings,
      riskGrade: this.calculateRiskGrade(findings),
      recommendedAction: passed ? "approve" : (findings.some(f => f.severity === "critical" || f.severity === "high") ? "reject" : "review"),
      garakOutput: result.stdout.slice(0, 5000),
    };
  }

  /** PASS only with exit 0, at least one test, and a boolean pass on every test, all true. */
  private parsePromptfooOutput(result: CommandRunnerResult): SecurityScanResult {
    if (result.code !== 0) return this.inconclusiveScan("promptfoo", `exited with code ${result.code}`, result.stdout);
    const json = this.parseJsonObject(result.stdout);
    if (!json) return this.inconclusiveScan("promptfoo", "no parseable JSON result", result.stdout);
    const tests = json.results;
    if (!Array.isArray(tests) || tests.length === 0) return this.inconclusiveScan("promptfoo", "no completed tests", result.stdout);
    const findings: SecurityFinding[] = [];
    for (const test of tests) {
      const t = test as { pass?: unknown; severity?: SecurityFinding["severity"]; category?: string; description?: string; error?: string } | null;
      if (!t || typeof t.pass !== "boolean") {
        return this.inconclusiveScan("promptfoo", "a test has no explicit verdict", result.stdout);
      }
      if (!t.pass) {
        findings.push({
          severity: t.severity || "medium",
          category: t.category || "redteam",
          description: t.description || t.error || "Test failed",
        });
      }
    }
    const passed = findings.length === 0;
    return {
      passed,
      scanner: "promptfoo",
      timestamp: new Date().toISOString(),
      findings,
      riskGrade: this.calculateRiskGrade(findings),
      recommendedAction: passed ? "approve" : (findings.some(f => f.severity === "critical" || f.severity === "high") ? "reject" : "review"),
      promptfooOutput: result.stdout.slice(0, 5000),
    };
  }

  private combineResults(results: SecurityScanResult[]): SecurityScanResult {
    const allFindings: SecurityFinding[] = [];
    let allPassed = true;

    for (const result of results) {
      allFindings.push(...result.findings);
      if (!result.passed) allPassed = false;
    }

    const scanners = results.map(r => r.scanner);
    const scannerLabel = scanners.length === 2 ? "both" : scanners[0];

    return {
      passed: allPassed,
      scanner: scannerLabel as "garak" | "promptfoo" | "both",
      timestamp: new Date().toISOString(),
      findings: allFindings,
      // An inconclusive child is L3 even though its finding is only informational.
      riskGrade: results.some(r => r.riskGrade === "L3") ? "L3" : this.calculateRiskGrade(allFindings),
      recommendedAction: allPassed
        ? "approve"
        : allFindings.some(f => f.severity === "critical" || f.severity === "high")
          ? "reject"
          : "review",
      garakOutput: results.find(r => r.scanner === "garak")?.garakOutput,
      promptfooOutput: results.find(r => r.scanner === "promptfoo")?.promptfooOutput,
    };
  }

  private calculateRiskGrade(findings: SecurityFinding[]): RiskGrade {
    const hasCritical = findings.some(f => f.severity === "critical");
    const hasHigh = findings.some(f => f.severity === "high");
    const mediumCount = findings.filter(f => f.severity === "medium").length;

    if (hasCritical) return "L3";
    if (hasHigh || mediumCount >= 3) return "L2";
    return "L1";
  }

  isGarakAvailable(): boolean {
    return this.garakAvailable;
  }

  isPromptfooAvailable(): boolean {
    return this.promptfooAvailable;
  }
}
