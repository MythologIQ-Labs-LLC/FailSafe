import type { EventBus } from "../../shared/EventBus";
import type { SentinelVerdict } from "../../shared/types";
import type { CheckpointStatus } from "./CheckpointStore";

interface CheckpointInput {
  checkpointType: string;
  actor: string;
  phase: string;
  status: CheckpointStatus;
  policyVerdict: string;
  evidenceRefs: string[];
  payload: unknown;
}

export interface EventSubscriptionDeps {
  eventBus: EventBus;
  recordCheckpoint: (record: CheckpointInput) => void;
  broadcast: (data: Record<string, unknown>) => void;
  logTransparencyEvent: (event: Record<string, unknown>) => void;
  inferPhaseKey: () => string;
  recordObservedFileMutation: (payload: unknown) => void;
  getPlan: (planId: string) => { phases: Array<{ id: string; title: string }> } | undefined;
  sealedSubstantiateCompletions: Set<string>;
}

/**
 * Wires all EventBus subscriptions for governance events, sentinel verdicts,
 * transparency logging, and agent run lifecycle broadcasts.
 * Framework-agnostic — portable to any runtime with an EventBus.
 */
export class EventSubscriptionManager {
  constructor(private deps: EventSubscriptionDeps) {}

  subscribe(): void {
    this.subscribeToSentinelEvents();
    this.subscribeToQorLogicEvents();
    this.subscribeToRunLifecycleEvents();
  }

  private subscribeToSentinelEvents(): void {
    const { eventBus, recordCheckpoint, broadcast, logTransparencyEvent, inferPhaseKey } = this.deps;

    eventBus.on("genesis.streamEvent" as never, (event: unknown) => {
      const streamPayload = this.extractEventPayload(event);
      this.maybeRecordSubstantiateCompletion(streamPayload);
      broadcast({ type: "event", payload: event });
      recordCheckpoint({
        checkpointType: "event.stream", actor: "engine",
        phase: inferPhaseKey(), status: "validated", policyVerdict: "PASS",
        evidenceRefs: [], payload: streamPayload,
      });
    });

    eventBus.on("sentinel.verdict" as never, (event: { payload: unknown }) => {
      const verdict = event.payload as SentinelVerdict;
      this.recordVerdictCheckpoint(verdict);
      this.maybeRecordAuditPassCheckpoint(verdict);
      broadcast({ type: "verdict", payload: event.payload });
      broadcast({ type: "hub.refresh" });
      const p = (event.payload ?? {}) as Record<string, unknown>;
      logTransparencyEvent({
        type: "sentinel.verdict", decision: p.decision,
        riskGrade: p.riskGrade, filePath: p.filePath,
        timestamp: new Date().toISOString(),
      });
      broadcast({ type: "transparency", payload: {
        type: "sentinel.verdict", decision: p.decision, riskGrade: p.riskGrade,
      } });
    });

    eventBus.on("sentinel.activityObserved" as never, (event: { payload: unknown }) => {
      this.deps.recordObservedFileMutation(event.payload);
    });

    eventBus.on("transparency.prompt" as never, (event: unknown) => {
      logTransparencyEvent(event as Record<string, unknown>);
      broadcast({ type: "transparency", payload: event });
    });
  }

  private subscribeToQorLogicEvents(): void {
    const { eventBus, recordCheckpoint, broadcast, logTransparencyEvent, inferPhaseKey } = this.deps;

    eventBus.on("qorelogic.l3Queued" as never, (event: unknown) => {
      recordCheckpoint({
        checkpointType: "override.requested", actor: "qorelogic",
        phase: inferPhaseKey(), status: "proposed", policyVerdict: "ESCALATE",
        evidenceRefs: [], payload: event,
      });
      broadcast({ type: "hub.refresh" });
      const p = ((event as Record<string, unknown>)?.payload ?? event ?? {}) as Record<string, unknown>;
      logTransparencyEvent({
        type: "governance.l3Queued", filePath: p.filePath,
        riskGrade: p.riskGrade, id: p.id, timestamp: new Date().toISOString(),
      });
      broadcast({ type: "transparency", payload: {
        type: "governance.l3Queued", riskGrade: p.riskGrade, id: p.id,
      } });
    });

    eventBus.on("qorelogic.l3Decided" as never, (event: unknown) => {
      recordCheckpoint({
        checkpointType: "override.approved", actor: "qorelogic",
        phase: inferPhaseKey(), status: "sealed", policyVerdict: "PASS",
        evidenceRefs: [], payload: event,
      });
      broadcast({ type: "hub.refresh" });
      const p = ((event as Record<string, unknown>)?.payload ?? event ?? {}) as Record<string, unknown>;
      logTransparencyEvent({
        type: "governance.l3Decided", decision: p.decision,
        riskGrade: p.riskGrade, id: p.id, timestamp: new Date().toISOString(),
      });
      broadcast({ type: "transparency", payload: {
        type: "governance.l3Decided", decision: p.decision, id: p.id,
      } });
    });

    eventBus.on("qorelogic.trustUpdate" as never, () =>
      this.deps.broadcast({ type: "hub.refresh" }),
    );
  }

  private subscribeToRunLifecycleEvents(): void {
    const { eventBus, broadcast } = this.deps;
    eventBus.on("agentRun.started" as never, (event: unknown) => {
      broadcast({ type: "agentRun", payload: { action: "started", ...(event as Record<string, unknown>) } });
    });
    eventBus.on("agentRun.completed" as never, (event: unknown) => {
      broadcast({ type: "agentRun", payload: { action: "completed", ...(event as Record<string, unknown>) } });
    });
    eventBus.on("agentRun.stepRecorded" as never, (event: unknown) => {
      broadcast({ type: "agentRun", payload: { action: "step", ...(event as Record<string, unknown>) } });
    });
  }

  private recordVerdictCheckpoint(verdict: SentinelVerdict): void {
    this.deps.recordCheckpoint({
      checkpointType: "policy.checked",
      actor: verdict.agentDid || "sentinel",
      phase: this.deps.inferPhaseKey(),
      status: "validated",
      policyVerdict: String(verdict.decision || "UNKNOWN"),
      evidenceRefs: [],
      payload: { decision: verdict.decision, riskGrade: verdict.riskGrade, summary: verdict.summary },
    });
  }

  private extractEventPayload(event: unknown): unknown {
    if (!event || typeof event !== "object") return event;
    return (event as { payload?: unknown }).payload ?? event;
  }

  private maybeRecordAuditPassCheckpoint(verdict: SentinelVerdict): void {
    if (String(verdict.decision || "").toUpperCase() !== "PASS") return;
    this.deps.recordCheckpoint({
      checkpointType: "attempt.committed", actor: verdict.agentDid || "sentinel",
      phase: "audit", status: "sealed", policyVerdict: "PASS", evidenceRefs: [],
      payload: { trigger: "audit.pass", riskGrade: verdict.riskGrade, summary: verdict.summary },
    });
  }

  private maybeRecordSubstantiateCompletion(streamPayload: unknown): void {
    if (!streamPayload || typeof streamPayload !== "object") return;
    const payload = streamPayload as {
      planEvent?: { type?: string; planId?: string; payload?: { phaseId?: string } };
    };
    const planEvent = payload.planEvent;
    if (!planEvent || String(planEvent.type || "") !== "phase.completed") return;
    const planId = String(planEvent.planId || "");
    const phaseId = String(planEvent.payload?.phaseId || "");
    if (!planId || !phaseId) return;
    const dedupeKey = `${planId}:${phaseId}`;
    if (this.deps.sealedSubstantiateCompletions.has(dedupeKey)) return;
    const plan = this.deps.getPlan(planId);
    const phase = plan?.phases.find((item) => item.id === phaseId);
    const phaseTitle = String(phase?.title || "").toLowerCase();
    if (!phaseTitle.includes("substantiat") && !phaseTitle.includes("release") && !phaseTitle.includes("ship")) return;
    this.deps.sealedSubstantiateCompletions.add(dedupeKey);
    this.deps.recordCheckpoint({
      checkpointType: "phase.exited", actor: "plan-manager", phase: "substantiate",
      status: "sealed", policyVerdict: "PASS", evidenceRefs: [],
      payload: { trigger: "phase.completed", planId, phaseId, phaseTitle: phase?.title || "Substantiate" },
    });
  }
}
