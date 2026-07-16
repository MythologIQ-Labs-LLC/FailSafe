/**
 * SecurityScanner - Garak and Promptfoo integration for marketplace security
 *
 * Checks availability of security tools, runs scans on installed repositories,
 * parses output into standardized SecurityScanResult format.
 */
import { spawn } from "child_process";
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

function defaultRunner(
  command: string,
  args: string[],
  cwd?: string,
  timeout = SCAN_TIMEOUT,
): Promise<CommandRunnerResult> {
  return new Promise((resolve) => {
    const options = { cwd, shell: false as const, timeout };
    const proc = command === "garak"
      ? spawn("garak", args, options)
      : command === "npx"
        ? spawn("npx", args, options)
        : command === "git"
          ? spawn("git", args, options)
          : null;
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

  async checkAvailability(): Promise<ScannerAvailability> {
    // Check Garak
    try {
      const garakResult = await this.runner("garak", ["--version"], undefined, 10000);
      this.garakAvailable = garakResult.code === 0;
    } catch {
      this.garakAvailable = false;
    }

    // Check Promptfoo
    try {
      const promptfooResult = await this.runner("npx", ["promptfoo", "--version"], undefined, 15000);
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

    // Garak probes for common LLM vulnerabilities
    const result = await this.runner(
      "garak",
      [
        "--model_type", "local",
        "--probes", "promptinject,encoding,knownbadsignatures",
        "--report", "json",
      ],
      installPath,
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

    // Initialize redteam config if not exists
    const result = await this.runner(
      "npx",
      ["promptfoo", "redteam", "run", "--output", "json"],
      installPath,
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

    return this.combineResults(results);
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

  private parseGarakOutput(result: CommandRunnerResult): SecurityScanResult {
    const findings: SecurityFinding[] = [];
    let passed = true;

    // Parse Garak JSON output
    try {
      if (result.stdout.includes("{")) {
        const jsonStart = result.stdout.indexOf("{");
        const jsonEnd = result.stdout.lastIndexOf("}") + 1;
        const json = JSON.parse(result.stdout.slice(jsonStart, jsonEnd));

        if (json.results) {
          for (const probe of Object.values(json.results) as any[]) {
            if (probe.fail_rate > 0) {
              passed = false;
              findings.push({
                severity: probe.fail_rate > 0.5 ? "high" : "medium",
                category: "vulnerability",
                description: `Probe ${probe.name}: ${Math.round(probe.fail_rate * 100)}% fail rate`,
              });
            }
          }
        }
      }
    } catch {
      // JSON parsing failed - extract from text
      if (result.stderr.includes("FAIL") || result.stdout.includes("vulnerability")) {
        passed = false;
        findings.push({
          severity: "medium",
          category: "vulnerability",
          description: "Garak detected potential vulnerabilities (see raw output)",
        });
      }
    }

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

  private parsePromptfooOutput(result: CommandRunnerResult): SecurityScanResult {
    const findings: SecurityFinding[] = [];
    let passed = true;

    // Parse Promptfoo JSON output
    try {
      if (result.stdout.includes("{")) {
        const jsonStart = result.stdout.indexOf("{");
        const jsonEnd = result.stdout.lastIndexOf("}") + 1;
        const json = JSON.parse(result.stdout.slice(jsonStart, jsonEnd));

        if (json.results) {
          for (const test of json.results) {
            if (!test.pass) {
              passed = false;
              findings.push({
                severity: test.severity || "medium",
                category: test.category || "redteam",
                description: test.description || test.error || "Test failed",
              });
            }
          }
        }
      }
    } catch {
      // JSON parsing failed
      if (result.code !== 0) {
        findings.push({
          severity: "info",
          category: "scanner",
          description: "Promptfoo evaluation completed with non-zero exit code",
        });
      }
    }

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
      riskGrade: this.calculateRiskGrade(allFindings),
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
