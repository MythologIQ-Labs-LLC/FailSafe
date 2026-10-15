/**
 * DriftDetector - Detects and classifies drift between checkpoints
 *
 * Compares the current workspace state against a stored checkpoint
 * to identify changes made outside governed skill sessions.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { Checkpoint, DriftReport, FolderManifold } from "./types";
import { ManifoldCalculator } from "./ManifoldCalculator";
import { trustedGitPath } from "../../shared/git/trustedGit";

const execFileAsync = promisify(execFile);

/** A commit id as `git rev-parse` prints it; the checkpoint file is workspace content. */
const HEX_HEAD = /^[0-9a-f]{4,64}$/i;

export class DriftDetector {
  private readonly workspaceRoot: string;
  private readonly manifoldCalculator: ManifoldCalculator;

  constructor(workspaceRoot: string, manifoldCalculator: ManifoldCalculator) {
    this.workspaceRoot = workspaceRoot;
    this.manifoldCalculator = manifoldCalculator;
  }

  /**
   * Detect drift between a checkpoint and current state
   */
  async detectDrift(
    checkpoint: Checkpoint,
    captureSnapshot: () => Promise<Checkpoint["snapshot"]>,
  ): Promise<DriftReport> {
    const currentSnapshot = await captureSnapshot();
    const currentManifold =
      await this.manifoldCalculator.calculateManifold();

    const durationMs = this.calculateDuration(checkpoint);
    const gitChanges = await this.getGitChanges(
      checkpoint.snapshot.git_head,
      currentSnapshot.git_head,
    );
    const manifoldDelta = this.calculateManifoldDelta(
      checkpoint.manifold,
      currentManifold,
    );
    const classification = this.classifyFiles(gitChanges.filesChanged);

    return this.buildDriftReport(
      checkpoint,
      durationMs,
      gitChanges,
      manifoldDelta,
      classification,
    );
  }

  private calculateDuration(checkpoint: Checkpoint): number {
    const pauseTime = new Date(checkpoint.checkpoint.created).getTime();
    return Date.now() - pauseTime;
  }

  /**
   * Get changed files and commit count from git
   */
  async getGitChanges(
    oldHead: string | null,
    newHead: string | null,
  ): Promise<{ filesChanged: string[]; gitCommits: number }> {
    if (!oldHead || !newHead || !HEX_HEAD.test(oldHead)) {
      return { filesChanged: [], gitCommits: 0 };
    }

    try {
      const filesChanged = await this.getGitDiffFiles(oldHead);
      const gitCommits = await this.getGitCommitCount(oldHead);
      return { filesChanged, gitCommits };
    } catch {
      return { filesChanged: [], gitCommits: 0 };
    }
  }

  private async getGitDiffFiles(oldHead: string): Promise<string[]> {
    const { stdout } = await execFileAsync(
      trustedGitPath(this.workspaceRoot),
      ["diff", "--name-only", oldHead, "HEAD"],
      { cwd: this.workspaceRoot },
    );
    return stdout.trim().split("\n").filter((f) => f);
  }

  private async getGitCommitCount(oldHead: string): Promise<number> {
    const { stdout } = await execFileAsync(
      trustedGitPath(this.workspaceRoot),
      ["log", "--oneline", `${oldHead}..HEAD`],
      { cwd: this.workspaceRoot },
    );
    return stdout.trim().split("\n").filter((l) => l).length;
  }

  /**
   * Calculate delta between old and new manifolds
   */
  calculateManifoldDelta(
    oldManifold: Record<string, FolderManifold | null>,
    newManifold: Record<string, FolderManifold | null>,
  ): Record<string, { file_count_delta: number; bytes_delta: number }> {
    const delta: Record<
      string,
      { file_count_delta: number; bytes_delta: number }
    > = {};

    for (const folder of Object.keys(newManifold)) {
      const before = oldManifold[folder];
      const after = newManifold[folder];

      if (before && after) {
        delta[folder] = {
          file_count_delta: after.file_count - before.file_count,
          bytes_delta: after.total_bytes - before.total_bytes,
        };
      }
    }

    return delta;
  }

  /**
   * Build the final drift report from computed components
   */
  private buildDriftReport(
    checkpoint: Checkpoint,
    durationMs: number,
    gitChanges: { filesChanged: string[]; gitCommits: number },
    manifoldDelta: Record<
      string,
      { file_count_delta: number; bytes_delta: number }
    >,
    classification: { L1: number; L2: number; L3: number },
  ): DriftReport {
    const detected =
      gitChanges.filesChanged.length > 0 || gitChanges.gitCommits > 0;

    return {
      detected,
      duration_ms: durationMs,
      git_commits: gitChanges.gitCommits,
      files_changed: gitChanges.filesChanged,
      manifold_delta: manifoldDelta,
      classification,
      source: checkpoint.checkpoint.paused
        ? "third_party_skill"
        : "unknown",
    };
  }

  /**
   * Classify files by risk level (simplified heuristic)
   */
  classifyFiles(files: string[]): { L1: number; L2: number; L3: number } {
    const classification = { L1: 0, L2: 0, L3: 0 };

    for (const file of files) {
      const level = this.classifySingleFile(file);
      classification[level]++;
    }

    return classification;
  }

  private classifySingleFile(file: string): "L1" | "L2" | "L3" {
    const lower = file.toLowerCase();

    if (this.isSecurityCritical(lower)) {
      return "L3";
    }
    if (this.isServiceFile(lower)) {
      return "L2";
    }
    return "L1";
  }

  private isSecurityCritical(lower: string): boolean {
    return (
      lower.includes("auth") ||
      lower.includes("crypto") ||
      lower.includes("secret") ||
      lower.includes("password") ||
      lower.includes("key")
    );
  }

  private isServiceFile(lower: string): boolean {
    return (
      lower.includes("api") ||
      lower.includes("service") ||
      lower.includes("controller") ||
      lower.includes("handler")
    );
  }
}
