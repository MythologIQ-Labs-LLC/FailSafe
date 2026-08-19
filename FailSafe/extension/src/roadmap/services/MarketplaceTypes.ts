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

export type SecurityScanResult = {
  passed: boolean;
  scanner: "garak" | "promptfoo" | "both" | "none";
  timestamp: string;
  findings: SecurityFinding[];
  riskGrade: RiskGrade;
  recommendedAction: "approve" | "review" | "reject";
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
