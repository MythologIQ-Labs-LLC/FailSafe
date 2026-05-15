/**
 * CheckpointReconciler - Automatic Checkpoint Governance
 *
 * Silently handles gaps between /qor-* commands where the user may have:
 * - Used third-party skills or agents
 * - Made manual short prompts
 * - Modified files outside governance
 *
 * Creates checkpoints after governance commands and reconciles drift before next command.
 */

import * as fs from "fs";
import * as path from "path";
import { EventBus } from "../shared/EventBus";
import { SentinelDaemon } from "../sentinel/SentinelDaemon";

interface WorkspaceSnapshot {
  files: Map<string, { mtime: number; size: number }>;
  timestamp: number;
}

interface DriftReport {
  addedFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  ungoverned: boolean;
}

export class CheckpointReconciler {
  private workspaceRoot: string;
  private eventBus: EventBus;
  private sentinel: SentinelDaemon;
  private lastKnownState: WorkspaceSnapshot | null = null;
  private isReconciling = false;

  constructor(
    workspaceRoot: string,
    eventBus: EventBus,
    sentinel: SentinelDaemon,
  ) {
    this.workspaceRoot = workspaceRoot;
    this.eventBus = eventBus;
    this.sentinel = sentinel;
  }

  /**
   * Create a checkpoint of the current workspace state.
   * Called automatically after governance commands complete.
   */
  createCheckpoint(): void {
    this.lastKnownState = {
      files: this.snapshotWorkspaceFiles(),
      timestamp: Date.now(),
    };
    this.eventBus.emit("governance.checkpointCreated", {
      timestamp: this.lastKnownState.timestamp,
      fileCount: this.lastKnownState.files.size,
    });
  }

  /**
   * Detect drift from the last checkpoint.
   * Returns a report of changes made outside governance.
   */
  detectDrift(): DriftReport {
    if (!this.lastKnownState) {
      return { addedFiles: [], modifiedFiles: [], deletedFiles: [], ungoverned: false };
    }

    const current = this.snapshotWorkspaceFiles();
    const prev = this.lastKnownState.files;

    const addedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const deletedFiles: string[] = [];

    // Check for added and modified files
    for (const [filePath, stats] of current) {
      const prevStats = prev.get(filePath);
      if (!prevStats) {
        addedFiles.push(filePath);
      } else if (stats.mtime > prevStats.mtime || stats.size !== prevStats.size) {
        modifiedFiles.push(filePath);
      }
    }

    // Check for deleted files
    for (const filePath of prev.keys()) {
      if (!current.has(filePath)) {
        deletedFiles.push(filePath);
      }
    }

    const ungoverned = addedFiles.length > 0 || modifiedFiles.length > 0 || deletedFiles.length > 0;
    return { addedFiles, modifiedFiles, deletedFiles, ungoverned };
  }

  /**
   * Silently reconcile any drift from the last checkpoint.
   * Queues modified files for audit and creates a new checkpoint.
   */
  async reconcile(): Promise<DriftReport> {
    if (this.isReconciling) {
      return { addedFiles: [], modifiedFiles: [], deletedFiles: [], ungoverned: false };
    }

    this.isReconciling = true;
    try {
      const drift = this.detectDrift();

      if (drift.ungoverned) {
        this.eventBus.emit("governance.driftDetected", drift);

        // Queue modified and added files for audit
        const filesToAudit = [...drift.addedFiles, ...drift.modifiedFiles];
        for (const file of filesToAudit.slice(0, 10)) {
          try {
            await this.sentinel.auditFile(file);
          } catch {
            // Silent audit - don't interrupt workflow
          }
        }

        // Create new checkpoint after reconciliation
        this.createCheckpoint();
      }

      return drift;
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Check if there's any drift without reconciling.
   */
  hasDrift(): boolean {
    return this.detectDrift().ungoverned;
  }

  /**
   * Get the timestamp of the last checkpoint.
   */
  getLastCheckpointTime(): number | null {
    return this.lastKnownState?.timestamp ?? null;
  }

  private snapshotWorkspaceFiles(): Map<string, { mtime: number; size: number }> {
    const files = new Map<string, { mtime: number; size: number }>();
    const srcDir = path.join(this.workspaceRoot, "src");

    if (!fs.existsSync(srcDir)) {
      return files;
    }

    this.walkDir(srcDir, files);
    return files;
  }

  private walkDir(dir: string, files: Map<string, { mtime: number; size: number }>): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules and hidden directories
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }

        if (entry.isDirectory()) {
          this.walkDir(fullPath, files);
        } else if (entry.isFile() && this.isSourceFile(entry.name)) {
          try {
            const stats = fs.statSync(fullPath);
            files.set(fullPath, { mtime: stats.mtimeMs, size: stats.size });
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  private isSourceFile(name: string): boolean {
    const ext = path.extname(name).toLowerCase();
    return [".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml", ".md"].includes(ext);
  }
}
