/**
 * MarketplaceCatalog - Static registry and state management for marketplace items
 *
 * Maintains the curated catalog of external agent repositories and persists
 * installation state to ~/.failsafe/marketplace/state.json
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { preserveCorruptFile } from "./corrupt-file-guard";
import type {
  MarketplaceItem,
  MarketplaceState,
  MarketplaceCategory,
  ScannerAvailability,
} from "./MarketplaceTypes";

const MARKETPLACE_CATALOG: MarketplaceItem[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Agent Skills
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "mattpocock-skills",
    name: "Matt Pocock Engineering Skills (Wayfinder)",
    description:
      "MIT-licensed agent skill packs (engineering + productivity): wayfinder charts big, foggy efforts as decision-ticket maps on your issue tracker; plus grilling, domain-modeling, research, prototype, spec/ticket handoffs, and writing-for-agents.",
    category: "agent-skills",
    author: "mattpocock",
    repoUrl: "https://github.com/mattpocock/skills",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read", "file:write"],
    featured: true,
    tags: ["wayfinder", "planning", "skills", "issue-tracker", "decision-tickets", "productivity", "grilling"],
    techStack: ["Markdown", "Agent Skills"],
    version: "latest",
    difficulty: "beginner",
    auditStatus: "community",
    licenseType: "MIT",
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Autonomous & Multi-Agent Frameworks
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "autoresearch-karpathy",
    name: "AutoResearch",
    description:
      "Andrej Karpathy's autonomous ML research loop. Automates literature review, hypothesis generation, and experiment design.",
    category: "autonomous-multi-agent",
    author: "karpathy",
    repoUrl: "https://github.com/karpathy/autoresearch",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read", "file:write", "network:fetch"],
    featured: true,
    tags: ["research", "ml", "autonomous", "papers"],
    techStack: ["Python", "UV"],
    version: "latest",
    difficulty: "advanced",
    auditStatus: "community",
    licenseType: "MIT",
  },
  {
    id: "autogen-microsoft",
    name: "AutoGen",
    description:
      "Multi-agent conversational framework for building LLM applications. Powers Magentic-One for complex task orchestration.",
    category: "autonomous-multi-agent",
    author: "microsoft",
    repoUrl: "https://github.com/microsoft/autogen",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read", "file:write", "network:fetch"],
    featured: true,
    tags: ["multi-agent", "conversation", "orchestration", "microsoft"],
    techStack: ["Python", ".NET"],
    version: "latest",
    difficulty: "intermediate",
    auditStatus: "verified",
    licenseType: "MIT",
  },
  {
    id: "taskweaver-microsoft",
    name: "TaskWeaver",
    description:
      "Code-first agent framework for data analytics. Converts natural language to executable Python code with planning.",
    category: "autonomous-multi-agent",
    author: "microsoft",
    repoUrl: "https://github.com/microsoft/TaskWeaver",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read", "file:write", "code:execute"],
    featured: false,
    tags: ["data-analytics", "code-generation", "planning", "microsoft"],
    techStack: ["Python", "Pandas"],
    version: "latest",
    difficulty: "intermediate",
    auditStatus: "verified",
    licenseType: "MIT",
  },
  {
    id: "browser-use",
    name: "Browser-Use",
    description:
      "Natural language browser automation. Control web browsers with plain English commands using Playwright.",
    category: "autonomous-multi-agent",
    author: "browser-use",
    repoUrl: "https://github.com/browser-use/browser-use",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["browser:control", "network:fetch"],
    featured: true,
    tags: ["browser", "automation", "playwright", "web"],
    techStack: ["Python", "Playwright"],
    version: "latest",
    difficulty: "beginner",
    auditStatus: "community",
    licenseType: "MIT",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Safety, Red Teaming & Guardrails
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "pyrit-microsoft",
    name: "PyRIT",
    description:
      "Python Risk Identification Tool for GenAI. Systematic red teaming framework for LLM security testing.",
    category: "safety-red-teaming",
    author: "microsoft",
    repoUrl: "https://github.com/Azure/PyRIT",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read", "file:write", "network:fetch"],
    featured: true,
    tags: ["security", "red-team", "testing", "microsoft", "azure"],
    techStack: ["Python"],
    version: "latest",
    difficulty: "advanced",
    auditStatus: "verified",
    licenseType: "MIT",
  },
  {
    id: "garak-nvidia",
    name: "Garak",
    description:
      "LLM vulnerability scanner. Detects prompt injection, jailbreaks, and other security vulnerabilities in AI systems.",
    category: "safety-red-teaming",
    author: "nvidia",
    repoUrl: "https://github.com/NVIDIA/garak",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read", "file:write", "network:fetch"],
    featured: true,
    tags: ["security", "vulnerability", "jailbreak", "nvidia", "scanner"],
    techStack: ["Python"],
    version: "latest",
    difficulty: "intermediate",
    auditStatus: "verified",
    licenseType: "Apache-2.0",
  },
  {
    id: "promptfoo",
    name: "Promptfoo",
    description:
      "Test suite for LLM applications, agents, and RAG pipelines. Red team evaluations and regression testing.",
    category: "safety-red-teaming",
    author: "promptfoo",
    repoUrl: "https://github.com/promptfoo/promptfoo",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read", "file:write", "network:fetch"],
    featured: true,
    tags: ["testing", "evaluation", "red-team", "rag", "agents"],
    techStack: ["TypeScript", "React"],
    version: "latest",
    difficulty: "beginner",
    auditStatus: "verified",
    licenseType: "MIT",
  },
  {
    id: "agent-audit-teleport",
    name: "Agent Audit",
    description:
      "5-phase framework for auditing agent permissions. Comprehensive security review methodology for AI agents.",
    category: "safety-red-teaming",
    author: "teleport",
    repoUrl: "https://github.com/gravitational/agent-audit",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read"],
    featured: false,
    tags: ["audit", "permissions", "security", "methodology"],
    techStack: ["Markdown"],
    version: "latest",
    difficulty: "intermediate",
    auditStatus: "community",
    licenseType: "Apache-2.0",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UI & Orchestration Hubs
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "dify-langgenius",
    name: "Dify",
    description:
      "Visual orchestrator for agent workflows. No-code platform for building AI applications with drag-and-drop.",
    category: "ui-orchestration",
    author: "langgenius",
    repoUrl: "https://github.com/langgenius/dify",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read", "file:write", "network:fetch"],
    featured: true,
    tags: ["visual", "orchestration", "no-code", "workflows"],
    techStack: ["Docker", "JavaScript", "Python"],
    version: "latest",
    difficulty: "beginner",
    auditStatus: "verified",
    licenseType: "Apache-2.0",
  },
  {
    id: "vercel-ai-sdk",
    name: "Vercel AI SDK",
    description:
      "Toolkit for building AI-powered applications with streaming UI. React components for generative interfaces.",
    category: "ui-orchestration",
    author: "vercel",
    repoUrl: "https://github.com/vercel/ai",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read", "network:fetch"],
    featured: true,
    tags: ["streaming", "ui", "react", "generative", "vercel"],
    techStack: ["TypeScript", "React"],
    version: "latest",
    difficulty: "intermediate",
    auditStatus: "verified",
    licenseType: "Apache-2.0",
  },
  {
    id: "langflow",
    name: "Langflow",
    description:
      "Visual drag-and-drop agent builder. Low-code platform for creating and deploying AI workflows.",
    category: "ui-orchestration",
    author: "langflow-ai",
    repoUrl: "https://github.com/langflow-ai/langflow",
    repoRef: "main",
    status: "not-installed",
    trustTier: "unverified",
    sandboxEnabled: true,
    requiredPermissions: ["file:read", "file:write", "network:fetch"],
    featured: false,
    tags: ["visual", "low-code", "builder", "workflows"],
    techStack: ["Python", "React"],
    version: "latest",
    difficulty: "beginner",
    auditStatus: "community",
    licenseType: "MIT",
  },
];

export class MarketplaceCatalog {
  private catalog: Map<string, MarketplaceItem>;
  private state: MarketplaceState;
  private readonly cachePath: string;
  private readonly statePath: string;

  constructor() {
    this.cachePath = path.join(os.homedir(), ".failsafe", "marketplace");
    this.statePath = path.join(this.cachePath, "state.json");
    this.catalog = new Map();
    this.state = this.createDefaultState();
    this.loadCatalog();
    this.loadState();
  }

  private createDefaultState(): MarketplaceState {
    return {
      items: {},
      scannerAvailability: {
        garak: false,
        promptfoo: false,
        lastChecked: "",
      },
      pendingHITLApprovals: [],
      lastSyncedAt: new Date().toISOString(),
    };
  }

  private loadCatalog(): void {
    for (const item of MARKETPLACE_CATALOG) {
      this.catalog.set(item.id, { ...item });
    }
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
        this.state = { ...this.createDefaultState(), ...data };

        // Merge persisted state into catalog items
        for (const [id, partial] of Object.entries(this.state.items)) {
          const item = this.catalog.get(id);
          if (item) {
            Object.assign(item, partial);
          }
        }
      }
    } catch {
      // State file doesn't exist or is invalid - use defaults
    }

    if (this.reconcileStaleTransientState()) {
      this.persistState();
    }
  }

  /**
   * "installing"/"scanning" are only ever set by this session's own live
   * install lifecycle (see updateItemStatus() call sites in
   * marketplaceInstallRoutes.ts). A status of either at load time was
   * therefore always written by a *previous* extension-host session, whose
   * in-memory install promise/timer died with it — nothing in this new
   * session will ever resolve it. Left alone it durably deadlocks the
   * install route's `status === "installing" || status === "scanning"`
   * 409 guard forever. Reclassify it as "failed" (truthful: the prior
   * attempt is over and did not complete) so retries are unblocked; never
   * promote it to "installed" or "quarantined", which would fabricate
   * completion/verification evidence this session never produced.
   * Returns true if any item was reconciled.
   */
  private reconcileStaleTransientState(): boolean {
    let changed = false;
    for (const item of this.catalog.values()) {
      if (item.status === "installing" || item.status === "scanning") {
        item.status = "failed";
        item.lastUpdated = new Date().toISOString();
        changed = true;
      }
    }
    return changed;
  }

  persistState(): void {
    try {
      fs.mkdirSync(this.cachePath, { recursive: true });

      // Extract only mutable state from items
      const itemState: Record<string, Partial<MarketplaceItem>> = {};
      for (const [id, item] of this.catalog) {
        if (item.status !== "not-installed" || item.securityScan) {
          itemState[id] = {
            status: item.status,
            installPath: item.installPath,
            installedAt: item.installedAt,
            lastUpdated: item.lastUpdated,
            securityScan: item.securityScan,
            trustTier: item.trustTier,
            sandboxEnabled: item.sandboxEnabled,
          };
        }
      }

      this.state.items = itemState;
      this.state.lastSyncedAt = new Date().toISOString();

      // Atomic temp+rename (matches repository convention, e.g.
      // runtimeMode.ts / breakGlassState.ts) so a crash mid-write cannot
      // leave state.json truncated/malformed.
      // #378: loadState() swallows parse errors into defaults, so this write
      // would overwrite a corrupt-but-existing state.json — preserve it aside
      // first (guard never throws; safe inside this try).
      preserveCorruptFile(this.statePath, (p) => !!p && typeof p === "object" && !Array.isArray(p), "state.json");
      const tmpPath = `${this.statePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.statePath);
    } catch (error) {
      console.error("Failed to persist marketplace state:", error);
    }
  }

  getCatalog(): MarketplaceItem[] {
    return Array.from(this.catalog.values());
  }

  getItem(id: string): MarketplaceItem | undefined {
    return this.catalog.get(id);
  }

  getByCategory(category: MarketplaceCategory): MarketplaceItem[] {
    return this.getCatalog().filter((item) => item.category === category);
  }

  getFeatured(): MarketplaceItem[] {
    return this.getCatalog().filter((item) => item.featured);
  }

  getInstalled(): MarketplaceItem[] {
    return this.getCatalog().filter((item) => item.status === "installed");
  }

  getQuarantined(): MarketplaceItem[] {
    return this.getCatalog().filter((item) => item.status === "quarantined");
  }

  updateItemStatus(id: string, updates: Partial<MarketplaceItem>): void {
    const item = this.catalog.get(id);
    if (item) {
      Object.assign(item, updates);
      this.persistState();
    }
  }

  setScannerAvailability(availability: ScannerAvailability): void {
    this.state.scannerAvailability = availability;
    this.persistState();
  }

  getScannerAvailability(): ScannerAvailability {
    return this.state.scannerAvailability;
  }

  getCachePath(): string {
    return this.cachePath;
  }

  getItemInstallPath(id: string): string {
    return path.join(this.cachePath, id);
  }
}
