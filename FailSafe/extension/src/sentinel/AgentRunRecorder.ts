/**
 * AgentRunRecorder - Captures agent execution traces
 *
 * Records full execution traces during AI agent runs for
 * step-by-step replay and governance audit.
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import type { EventBus } from "../shared/EventBus";
import type { FailSafeEvent, FailSafeEventType } from "../shared/types/events";
import type {
  AgentProvenance,
  AgentRun,
  AgentRunSource,
  RunStep,
  RunStepKind,
} from "../shared/types/agentRun";
import type { IAgentProvenanceDetector } from "./IAgentProvenanceDetector";

const MAX_COMPLETED_RUNS = 50;

type PayloadRecord = Record<string, unknown>;

const EVENT_TO_STEP: ReadonlyMap<FailSafeEventType, RunStepKind> = new Map([
  ["sentinel.verdict", "verdictPass"],
  ["qorelogic.trustUpdate", "trustUpdate"],
  ["genome.failureArchived", "genomeMatch"],
  ["diffguard.approved", "policyDecision"],
  ["diffguard.rejected", "policyDecision"],
]);

function str(p: PayloadRecord, key: string): string {
  const v = p[key];
  return typeof v === "string" ? v : String(v ?? "");
}

function num(p: PayloadRecord, key: string): number {
  const v = p[key];
  return typeof v === "number" ? v : 0;
}

function isVerdictBlock(event: FailSafeEvent): boolean {
  const p = (event.payload ?? {}) as PayloadRecord;
  return event.type === "sentinel.verdict" &&
    (str(p, "decision") === "BLOCK" || str(p, "decision") === "QUARANTINE");
}

export class AgentRunRecorder {
  private activeRuns = new Map<string, AgentRun>();
  private completedRuns: AgentRun[] = [];
  private unsubscribe: (() => void) | null = null;
  private lastFileEditTime = 0;
  private rapidEditThreshold = 5000; // 5 seconds
  private readonly provenanceDetectors: IAgentProvenanceDetector[];

  constructor(
    private readonly eventBus: EventBus,
    private readonly storagePath: string,
    options?: { provenanceDetectors?: IAgentProvenanceDetector[] },
  ) {
    this.provenanceDetectors = options?.provenanceDetectors ?? [];
    this.ensureStorageDir();
    this.unsubscribe = this.eventBus.onAll((event: FailSafeEvent) => {
      this.handleEvent(event);
    });
  }

  startRun(agentDid: string, agentType: string, source: AgentRunSource = "manual"): AgentRun {
    const run: AgentRun = {
      id: randomUUID(),
      agentDid,
      agentType,
      agentSource: source,
      startedAt: new Date().toISOString(),
      status: "running",
      steps: [],
    };
    this.activeRuns.set(run.id, run);
    this.eventBus.emit("agentRun.started", { runId: run.id, agentDid, agentType });
    return run;
  }

  endRun(runId: string, status: "completed" | "failed" = "completed"): AgentRun | undefined {
    const run = this.activeRuns.get(runId);
    if (!run) return undefined;

    run.status = status;
    run.endedAt = new Date().toISOString();
    this.activeRuns.delete(runId);
    this.addCompleted(run);
    this.persistRun(run);
    this.eventBus.emit("agentRun.completed", { runId: run.id, status });
    return run;
  }

  getActiveRuns(): AgentRun[] {
    return Array.from(this.activeRuns.values());
  }

  getCompletedRuns(): AgentRun[] {
    return [...this.completedRuns];
  }

  getRun(runId: string): AgentRun | undefined {
    return this.activeRuns.get(runId) ?? this.completedRuns.find((r) => r.id === runId);
  }

  getRunSteps(runId: string): RunStep[] {
    return this.getRun(runId)?.steps ?? [];
  }

  /**
   * Handle file edit from external agent (B182).
   * Detects rapid edits to start implicit runs and records file edits as steps.
   */
  handleFileEdit(filePath: string, agentDid: string): void {
    const now = Date.now();
    const timeSinceLastEdit = now - this.lastFileEditTime;
    this.lastFileEditTime = now;

    // If no active run and rapid edits detected, start implicit run
    if (this.activeRuns.size === 0 && timeSinceLastEdit < this.rapidEditThreshold) {
      this.startRun(agentDid || "external-agent", "file-edit", "implicit");
    }

    // Record file edit as step if run is active
    if (this.activeRuns.size > 0) {
      const step: RunStep = {
        seq: 0,
        kind: "fileEdit",
        timestamp: new Date().toISOString(),
        title: `File edit: ${path.basename(filePath)}`,
        artifactPath: filePath,
      };
      for (const run of this.activeRuns.values()) {
        run.steps.push({ ...step, seq: run.steps.length + 1 });
      }
      // Detector-driven provenance attribution (additive — see plan v3 line 173).
      // Run detectors ONCE per filePath, take first non-null, then attach
      // to every active run that does not already carry provenance.
      if (this.provenanceDetectors.length > 0) {
        const detected = this.runProvenanceDetectors(filePath);
        if (detected) {
          for (const run of this.activeRuns.values()) {
            if (!run.provenance) {
              this.attachProvenance(run.id, detected);
            }
          }
        }
      }
    }
  }

  /**
   * Attach (or clear) external-system provenance on an existing run.
   * Returns true if the run was found and updated, false otherwise.
   * Persists the run to disk on success.
   */
  attachProvenance(runId: string, provenance: AgentProvenance | null): boolean {
    const run = this.activeRuns.get(runId)
      ?? this.completedRuns.find((r) => r.id === runId);
    if (!run) return false;
    run.provenance = provenance ?? undefined;
    this.persistRun(run);
    return true;
  }

  private runProvenanceDetectors(filePath: string): AgentProvenance | null {
    for (const det of this.provenanceDetectors) {
      try {
        const result = det.detectFromFilePath(filePath);
        if (result) return result;
      } catch {
        // Detector failures are non-fatal — isolate + continue.
      }
    }
    return null;
  }

  loadRun(runId: string): AgentRun | null {
    // S3: Defense-in-depth UUID validation to prevent path traversal
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
      return null;
    }
    const filePath = path.join(this.storagePath, `${runId}.json`);
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as AgentRun;
    } catch {
      return null;
    }
  }

  dispose(): void {
    for (const run of this.activeRuns.values()) {
      run.status = "failed";
      run.endedAt = new Date().toISOString();
      this.persistRun(run);
    }
    this.activeRuns.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private handleEvent(event: FailSafeEvent): void {
    // Filter out our own emitted events to prevent re-entrancy
    if (event.type.startsWith("agentRun.")) return;

    if (this.handleLifecycleEvent(event)) return;

    if (this.activeRuns.size === 0) return;

    const step = this.mapEventToStep(event);
    if (!step) return;

    for (const run of this.activeRuns.values()) {
      const seq = run.steps.length + 1;
      run.steps.push({ ...step, seq });
      this.eventBus.emit("agentRun.stepRecorded", { runId: run.id, step: { ...step, seq } });
    }
  }

  private handleLifecycleEvent(event: FailSafeEvent): boolean {
    const p = (event.payload ?? {}) as PayloadRecord;

    if (event.type === "ide.taskStarted") {
      const did = str(p, "agentDid") || "unknown";
      const agentType = str(p, "agentType") || "ide";
      this.startRun(did, agentType, "ide-task");
      return true;
    }

    if (event.type === "ide.taskEnded") {
      const runId = str(p, "runId");
      if (runId && this.activeRuns.has(runId)) {
        this.endRun(runId, "completed");
      } else {
        const runs = Array.from(this.activeRuns.keys());
        if (runs.length > 0) {
          this.endRun(runs[runs.length - 1], "completed");
        }
      }
      return true;
    }

    return false;
  }

  private mapEventToStep(event: FailSafeEvent): RunStep | null {
    const kind = EVENT_TO_STEP.get(event.type as FailSafeEventType);
    if (!kind) return null;

    const p = (event.payload ?? {}) as PayloadRecord;
    const effectiveKind = (kind === "verdictPass" && isVerdictBlock(event))
      ? "verdictBlock" as RunStepKind
      : kind;

    return {
      seq: 0,
      kind: effectiveKind,
      timestamp: event.timestamp,
      title: this.buildStepTitle(effectiveKind, p),
      detail: str(p, "summary") || str(p, "reason") || undefined,
      artifactPath: str(p, "artifactPath") || undefined,
      agentDid: str(p, "agentDid") || str(p, "did") || undefined,
    };
  }

  private buildStepTitle(kind: RunStepKind, p: PayloadRecord): string {
    switch (kind) {
      case "verdictPass":
        return `Verdict: PASS (${str(p, "artifactPath") || "unknown"})`;
      case "verdictBlock":
        return `Verdict: BLOCK (${str(p, "artifactPath") || "unknown"})`;
      case "trustUpdate":
        return `Trust: ${str(p, "did")} \u2192 ${num(p, "newScore") || num(p, "score")}`;
      case "genomeMatch":
        return `Genome: ${str(p, "failureMode") || "pattern matched"}`;
      case "policyDecision":
        return `DiffGuard: ${str(p, "filePath") || "policy decision"}`;
      default:
        return kind;
    }
  }

  private addCompleted(run: AgentRun): void {
    this.completedRuns.push(run);
    if (this.completedRuns.length > MAX_COMPLETED_RUNS) {
      this.completedRuns.shift();
    }
  }

  private persistRun(run: AgentRun): void {
    try {
      const filePath = path.join(this.storagePath, `${run.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(run, null, 2), "utf-8");
      this.cleanOldRuns();
    } catch {
      // Storage failure is non-fatal
    }
  }

  private cleanOldRuns(): void {
    try {
      const files = fs.readdirSync(this.storagePath)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ name: f, mtime: fs.statSync(path.join(this.storagePath, f)).mtimeMs }))
        .sort((a, b) => a.mtime - b.mtime);
      while (files.length > MAX_COMPLETED_RUNS) {
        const oldest = files.shift()!;
        fs.unlinkSync(path.join(this.storagePath, oldest.name));
      }
    } catch {
      // Cleanup failure is non-fatal
    }
  }

  private ensureStorageDir(): void {
    try {
      fs.mkdirSync(this.storagePath, { recursive: true });
    } catch {
      // Directory creation failure is non-fatal
    }
  }
}
