/**
 * MarketplaceTypes - Type definitions for the FailSafe Agent Marketplace
 *
 * Defines marketplace items, security scan results, installation state,
 * and HITL (Human-in-the-Loop) gate types.
 */

export type MarketplaceCategory =
  | "autonomous-multi-agent"
  | "safety-red-teaming"
  | "ui-orchestration"
  | "agent-skills";

export type InstallationStatus =
  | "not-installed"
  | "installing"
  | "scanning"
  | "installed"
  | "failed"
  | "quarantined";

export type TrustTier =
  | "unverified"
  | "scanned"
  | "approved"
  | "quarantined";

export type RiskGrade = "L1" | "L2" | "L3";

export type SecurityFinding = {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  description: string;
  file?: string;
  line?: number;
  cwe?: string;
};

/**
 * How a scan ended (#538). Only `completed` can pass: `timeout` (the scanner was
 * killed at its bound), `scanner-error` (it could not run, threw or exited
 * nonzero), `inconclusive` (it ran but gave no usable verdict) and
 * `unavailable` (no scanner installed) are never a pass.
 */
export type ScanStatus = "completed" | "inconclusive" | "timeout" | "scanner-error" | "unavailable";

export type SecurityScanResult = {
  passed: boolean;
  scanner: "garak" | "promptfoo" | "both" | "none";
  scanStatus: ScanStatus;
  timestamp: string;
  findings: SecurityFinding[];
  riskGrade: RiskGrade;
  recommendedAction: "approve" | "review" | "reject";
  /** First line of each tool's `--version`, for the tools that ran. */
  scannerVersions?: { garak?: string; promptfoo?: string };
  garakOutput?: string;
  promptfooOutput?: string;
};

export type MarketplaceItem = {
  id: string;
  name: string;
  description: string;
  category: MarketplaceCategory;
  author: string;
  repoUrl: string;
  repoRef: string;
  installPath?: string;

  // Status tracking
  status: InstallationStatus;
  installedAt?: string;
  lastUpdated?: string;

  // Security metadata
  securityScan?: SecurityScanResult;
  trustTier: TrustTier;
  sandboxEnabled: boolean;
  requiredPermissions: string[];

  // Catalog metadata
  featured: boolean;
  tags: string[];
  version: string;
  techStack: string[];
  documentationUrl?: string;
  licenseType?: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  auditStatus: "verified" | "community" | "unverified";
};

export type ScannerAvailability = {
  garak: boolean;
  promptfoo: boolean;
  lastChecked: string;
};

export type MarketplaceState = {
  items: Record<string, Partial<MarketplaceItem>>;
  scannerAvailability: ScannerAvailability;
  pendingHITLApprovals: string[];
  lastSyncedAt: string;
};

export type InstallProgress = {
  phase: "cloning" | "setup" | "scanning" | "complete" | "failed";
  progress: number;
  message: string;
  error?: string;
};

export type InstallOptions = {
  sandboxEnabled: boolean;
  runSecurityScan: boolean;
  skipHITL?: boolean;
};

export type HITLRequest = {
  nonce: string;
  action: "marketplace.install";
  itemId: string;
  itemName: string;
  expiresAt: string;
};

export type CommandRunnerResult = {
  code: number;
  stdout: string;
  stderr: string;
  /** The run hit its bound; the process tree was killed (#538). */
  timedOut?: boolean;
  /** The started child's pid, when a process was started. */
  pid?: number;
};

export type CommandRunner = (
  command: string,
  args: string[],
  cwd?: string,
  timeout?: number,
) => Promise<CommandRunnerResult>;

export const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  "autonomous-multi-agent": "Autonomous & Multi-Agent",
  "safety-red-teaming": "Safety & Red Teaming",
  "ui-orchestration": "UI & Orchestration",
  "agent-skills": "Agent Skills",
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
