/**
 * CheckpointLifecycle - Pause and resume governance operations
 *
 * Manages the lifecycle transitions for governance pausing (user-initiated)
 * and resuming with drift reconciliation.
 */

import { LedgerManager } from "../ledger/LedgerManager";
import {
  Checkpoint,
  DriftReport,
  CHECKPOINT_VERSION,
} from "./types";
import { DriftDetector } from "./DriftDetector";
import { CheckpointPersistence } from "./CheckpointPersistence";
import { ManifoldCalculator } from "./ManifoldCalculator";

/** Function signature for capturing a workspace snapshot */
type SnapshotCapture = () => Promise<Checkpoint["snapshot"]>;

/** Function signature for creating a new checkpoint */
type CheckpointCreator = (skillSession: string) => Promise<Checkpoint>;

export class CheckpointLifecycle {
  private readonly ledgerManager?: LedgerManager;
  private readonly driftDetector: DriftDetector;
  private readonly persistence: CheckpointPersistence;
  private readonly manifoldCalculator: ManifoldCalculator;
  private readonly captureSnapshot: SnapshotCapture;
  private readonly createCheckpoint: CheckpointCreator;

  constructor(deps: {
    ledgerManager?: LedgerManager;
    driftDetector: DriftDetector;
    persistence: CheckpointPersistence;
    manifoldCalculator: ManifoldCalculator;
    captureSnapshot: SnapshotCapture;
    createCheckpoint: CheckpointCreator;
  }) {
    this.ledgerManager = deps.ledgerManager;
    this.driftDetector = deps.driftDetector;
    this.persistence = deps.persistence;
    this.manifoldCalculator = deps.manifoldCalculator;
    this.captureSnapshot = deps.captureSnapshot;
    this.createCheckpoint = deps.createCheckpoint;
  }

  /**
   * Pause governance (user-initiated only)
   */
  async pause(reason: string): Promise<Checkpoint> {
    const checkpoint = await this.buildPauseCheckpoint(reason);
    await this.persistence.save(checkpoint);
    await this.recordPauseToLedger(reason);
    return checkpoint;
  }

  private async buildPauseCheckpoint(reason: string): Promise<Checkpoint> {
    const timestamp = new Date().toISOString();
    const snapshot = await this.captureSnapshot();
    const manifold = await this.manifoldCalculator.calculateManifold();

    return {
      checkpoint: {
        version: CHECKPOINT_VERSION,
        created: timestamp,
        sealed: true,
        skill_session: "qor-pause",
        paused: true,
        pause_reason: reason,
      },
      snapshot,
      manifold,
      user_overrides: [
        {
          timestamp,
          reason,
          acknowledged: true,
        },
      ],
    };
  }

  private async recordPauseToLedger(reason: string): Promise<void> {
    if (!this.ledgerManager) {
      return;
    }

    await this.ledgerManager.appendEntry({
      eventType: "GOVERNANCE_PAUSED",
      agentDid: "user:sovereign",
      payload: { reason },
    });
  }

  /**
   * Resume governance and reconcile drift
   */
  async resume(): Promise<DriftReport> {
    const pauseCheckpoint = await this.persistence.load();
    const validation = this.validateResumeState(pauseCheckpoint);

    if (!validation.valid) {
      return validation.emptyReport;
    }

    return this.executeResume(pauseCheckpoint!);
  }

  private validateResumeState(
    checkpoint: Checkpoint | null,
  ): { valid: true } | { valid: false; emptyReport: DriftReport } {
    if (checkpoint?.checkpoint.paused) {
      return { valid: true };
    }

    return {
      valid: false,
      emptyReport: {
        detected: false,
        duration_ms: 0,
        git_commits: 0,
        files_changed: [],
        manifold_delta: {},
        classification: { L1: 0, L2: 0, L3: 0 },
        source: "unknown",
      },
    };
  }

  private async executeResume(
    pauseCheckpoint: Checkpoint,
  ): Promise<DriftReport> {
    const drift = await this.driftDetector.detectDrift(
      pauseCheckpoint,
      this.captureSnapshot,
    );

    await this.persistence.archiveCheckpoint(pauseCheckpoint);
    await this.createAndSealResumeCheckpoint();
    await this.recordResumeToLedger(drift);

    return drift;
  }

  private async createAndSealResumeCheckpoint(): Promise<void> {
    const newCheckpoint = await this.createCheckpoint("qor-resume");
    newCheckpoint.checkpoint.sealed = true;
    newCheckpoint.checkpoint.paused = false;
    await this.persistence.save(newCheckpoint);
  }

  private async recordResumeToLedger(drift: DriftReport): Promise<void> {
    if (!this.ledgerManager) {
      return;
    }

    await this.ledgerManager.appendEntry({
      eventType: "GOVERNANCE_RESUMED",
      agentDid: "user:sovereign",
      payload: {
        pause_duration_ms: drift.duration_ms,
        files_changed: drift.files_changed.length,
      },
    });

    if (drift.detected) {
      await this.recordDriftToLedger(drift);
    }
  }

  private async recordDriftToLedger(drift: DriftReport): Promise<void> {
    if (!this.ledgerManager) {
      return;
    }

    await this.ledgerManager.appendEntry({
      eventType: "EXTERNAL_DRIFT",
      agentDid: "user:sovereign",
      payload: {
        source: drift.source,
        files_changed: drift.files_changed,
        manifold_delta: drift.manifold_delta,
      },
    });
  }
}
