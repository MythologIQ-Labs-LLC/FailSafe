/**
 * CheckpointManager - Sovereign Checkpoint Protocol Core
 *
 * Manages lightweight checkpoints for governance continuity when users
 * utilize third-party skills outside the QL ecosystem.
 *
 * Key Principles:
 * - User Sovereignty: Users can override anything, agents cannot
 * - Token Efficiency: YAML format with folder-level manifold (not per-file hashing)
 * - Asymmetric Accountability: Agents held firmly, users given consent options
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { trustedGitPath } from "../../shared/git/trustedGit";
import { LedgerManager } from "../ledger/LedgerManager";
import { ConfigManager } from "../../shared/ConfigManager";
import {
  Checkpoint,
  DriftReport,
  FolderManifold,
  CHECKPOINT_VERSION,
} from "./types";
import { DriftDetector } from "./DriftDetector";
import { ManifoldCalculator } from "./ManifoldCalculator";
import { CheckpointPersistence } from "./CheckpointPersistence";
import { CheckpointLifecycle } from "./CheckpointLifecycle";
import type { ICheckpointMetrics } from "../../core/interfaces";

const execFileAsync = promisify(execFile);

// Re-export types for backward compatibility
export type { Checkpoint, FolderManifold, DriftReport } from "./types";
export type { UserOverride } from "./types";

export class CheckpointManager {
  private readonly workspaceRoot: string;
  private readonly ledgerManager?: LedgerManager;
  private readonly configManager: ConfigManager;
  private readonly metrics?: ICheckpointMetrics;
  private readonly driftDetector: DriftDetector;
  private readonly manifoldCalculator: ManifoldCalculator;
  private readonly persistence: CheckpointPersistence;
  private readonly lifecycle: CheckpointLifecycle;

  constructor(
    configManager: ConfigManager,
    ledgerManager?: LedgerManager,
    metrics?: ICheckpointMetrics,
  ) {
    this.configManager = configManager;
    this.ledgerManager = ledgerManager;
    this.metrics = metrics;
    this.workspaceRoot = configManager.getWorkspaceRoot() || "";

    this.manifoldCalculator = new ManifoldCalculator(this.workspaceRoot);
    this.driftDetector = new DriftDetector(
      this.workspaceRoot,
      this.manifoldCalculator,
    );
    this.persistence = new CheckpointPersistence(this.workspaceRoot, {
      checkpointDir: ".agent/checkpoints",
      latestFile: "latest.yaml",
      archiveDir: ".agent/checkpoints/archive",
      maxArchiveDepth: 10,
    });
    this.lifecycle = new CheckpointLifecycle({
      ledgerManager,
      driftDetector: this.driftDetector,
      persistence: this.persistence,
      manifoldCalculator: this.manifoldCalculator,
      captureSnapshot: () => this.captureSnapshot(),
      createCheckpoint: (session) => this.create(session),
    });
  }

  /**
   * Load the current checkpoint, or return null if none exists
   */
  async load(): Promise<Checkpoint | null> {
    return this.persistence.load();
  }

  /**
   * Create a new checkpoint (unsealed)
   */
  async create(skillSession: string): Promise<Checkpoint> {
    const timestamp = new Date().toISOString();
    const snapshot = await this.captureSnapshot();
    const manifold = await this.manifoldCalculator.calculateManifold();

    const checkpoint: Checkpoint = {
      checkpoint: {
        version: CHECKPOINT_VERSION,
        created: timestamp,
        sealed: false,
        skill_session: skillSession,
      },
      snapshot,
      manifold,
      user_overrides: [],
    };

    await this.persistence.save(checkpoint);
    return checkpoint;
  }

  /**
   * Seal the current checkpoint (called when skill session ends)
   */
  async seal(): Promise<Checkpoint | null> {
    const current = await this.persistence.load();
    if (!current) {
      console.warn("No checkpoint to seal");
      return null;
    }

    current.snapshot = await this.captureSnapshot();
    current.manifold = await this.manifoldCalculator.calculateManifold();
    current.checkpoint.sealed = true;

    await this.persistence.save(current);

    if (this.ledgerManager) {
      await this.ledgerManager.appendEntry({
        eventType: "CHECKPOINT_CREATED",
        agentDid: current.checkpoint.skill_session || "unknown",
        payload: {
          git_head: current.snapshot.git_head,
          manifold_summary: this.summarizeManifold(current.manifold),
        },
      });
    }

    return current;
  }

  /**
   * Pause governance (user-initiated only)
   */
  async pause(reason: string): Promise<Checkpoint> {
    return this.lifecycle.pause(reason);
  }

  /**
   * Resume governance and reconcile drift
   */
  async resume(): Promise<DriftReport> {
    return this.lifecycle.resume();
  }

  /**
   * Validate current state against last checkpoint
   */
  async validate(): Promise<DriftReport> {
    const lastCheckpoint = await this.persistence.load();

    if (!lastCheckpoint || !lastCheckpoint.checkpoint.sealed) {
      return {
        detected: false,
        duration_ms: 0,
        git_commits: 0,
        files_changed: [],
        manifold_delta: {},
        classification: { L1: 0, L2: 0, L3: 0 },
        source: "unknown",
      };
    }

    return this.driftDetector.detectDrift(
      lastCheckpoint,
      () => this.captureSnapshot(),
    );
  }

  /**
   * Capture current git and system snapshot
   */
  private async captureSnapshot(): Promise<Checkpoint["snapshot"]> {
    let gitHead: string | null = null;
    let gitStatus: "clean" | "dirty" | "unknown" = "unknown";

    try {
      const git = trustedGitPath(this.workspaceRoot);
      const { stdout: headOutput } = await execFileAsync(git, ["rev-parse", "HEAD"], {
        cwd: this.workspaceRoot,
      });
      gitHead = headOutput.trim();

      const { stdout: statusOutput } = await execFileAsync(
        git,
        ["status", "--porcelain"],
        { cwd: this.workspaceRoot },
      );
      gitStatus = statusOutput.trim() === "" ? "clean" : "dirty";
    } catch {
      // Not a git repo or git not available
    }

    return {
      git_head: gitHead,
      git_status: gitStatus,
      ledger_chain_head: this.metrics
        ? String(this.metrics.getLedgerEntryCount())
        : null,
      sentinel_events_processed: this.metrics?.getSentinelEventsProcessed() ?? 0,
    };
  }

  /**
   * Summarize manifold for logging
   */
  private summarizeManifold(
    manifold: Record<string, FolderManifold | null>,
  ): Record<string, number> {
    const summary: Record<string, number> = {};

    for (const [folder, stats] of Object.entries(manifold)) {
      summary[folder] = stats?.file_count ?? 0;
    }

    return summary;
  }
}
