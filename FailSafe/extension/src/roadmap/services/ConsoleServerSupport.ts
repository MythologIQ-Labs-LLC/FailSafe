/** ConsoleServerSupport — pure helpers extracted from ConsoleServer.ts
 *  (Phase 60 §0) to keep the composition root under the Section 4 razor.
 *  Holds module-level constants, ledger phase synthesis, plan-blocker
 *  backfill, and brainstorm LLM dispatch. No state, no class wiring. */
import * as path from "path";
import * as fs from "fs";
import { BrainstormService } from "./BrainstormService";
import { LLMClient } from "../../sentinel/utils/LLMClient";
import type { IConfigProvider } from "../../core/interfaces/IConfigProvider";
import type { LedgerSummary } from "./MetaLedgerReader";
import type { ParsedPlan } from "./PlanFileReader";
import type { PlanBlockerProjection } from "./BacklogReader";
import type { QoreRuntimeOptions } from "./QoreRuntimeService";

export function resolveQoreRuntimeOptions(options?: Partial<QoreRuntimeOptions>): QoreRuntimeOptions {
  const baseUrl = String(options?.baseUrl || "http://127.0.0.1:7777").trim().replace(/\/+$/, "");
  return {
    enabled: Boolean(options?.enabled), baseUrl,
    apiKey: options?.apiKey ? String(options.apiKey) : undefined,
    timeoutMs: Math.max(500, Math.min(30000, Number(options?.timeoutMs || 4000))),
  };
}

export function resolveUiDir(dirname: string): string {
  const candidates = [
    path.join(dirname, "ui"),
    path.resolve(dirname, "../../src/roadmap/ui"),
    path.resolve(dirname, "../../../src/roadmap/ui"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "index.html"))) return c;
  }
  return path.join(dirname, "ui");
}

export const MAX_PHASE_RENDER = 10;

export const CHECKPOINT_TYPE_REGISTRY = new Set<string>([
  "snapshot.created", "phase.entered", "phase.exited",
  "skill.recommended", "skill.invoked", "policy.checked",
  "override.requested", "override.approved",
  "attempt.committed", "attempt.rolled_back", "export.generated",
  "monitoring.resumed", "monitoring.stopped", "event.stream", "governance.revert",
]);

/** Convert META_LEDGER summary into the {id,name,status} phase shape the
 *  Operations UI expects. One synthetic phase per plan iteration. */
export function buildPhasesFromLedger(
  summary: LedgerSummary,
): Array<{ id: string; name: string; status: string; source: "meta-ledger" }> {
  const phases: Array<{ id: string; name: string; status: string; source: "meta-ledger" }> = [];
  const inFlightToShow = Math.min(summary.sessionsInFlight, MAX_PHASE_RENDER);
  const completedRemaining = MAX_PHASE_RENDER - inFlightToShow;
  const completedToShow = Math.min(summary.sessionsCompleted, Math.max(0, completedRemaining));
  for (let i = 0; i < inFlightToShow; i += 1) {
    phases.push({ id: `ledger-in-flight-${i + 1}`, name: `Session in flight ${i + 1}`, status: "in-progress", source: "meta-ledger" });
  }
  for (let i = 0; i < completedToShow; i += 1) {
    phases.push({ id: `ledger-completed-${i + 1}`, name: `Session ${i + 1} (sealed)`, status: "complete", source: "meta-ledger" });
  }
  const total = summary.sessionsInFlight + summary.sessionsCompleted;
  const truncated = total - phases.length;
  if (truncated > 0) {
    phases.push({
      id: "ledger-summary",
      name: `(${truncated} more — total ${summary.sessionsCompleted} sealed / ${summary.sessionsInFlight} in flight)`,
      status: "summary", source: "meta-ledger",
    });
  }
  return phases;
}

/** Backfill BACKLOG-derived blockers when PlanManager hasn't surfaced any. */
export function mergePlanBlockers(
  activePlan: unknown,
  artifacts: { activePlanFromFile: ParsedPlan | null; planBlockers: PlanBlockerProjection[] },
): unknown {
  if (activePlan && typeof activePlan === "object") {
    const existing = activePlan as Record<string, unknown>;
    const current = Array.isArray(existing.blockers) ? existing.blockers : [];
    if (current.length > 0) return activePlan;
    return { ...existing, blockers: artifacts.planBlockers };
  }
  if (!artifacts.activePlanFromFile) return null;
  const p = artifacts.activePlanFromFile;
  return {
    id: p.planId, intentId: "", title: p.title, phases: p.phases,
    blockers: artifacts.planBlockers, risks: [], milestones: [],
    currentPhaseId: p.phases[0]?.id ?? "", source: "plan-file",
    filePath: p.filePath, openQuestions: p.openQuestions,
  };
}

/** Build BrainstormService with LLM dispatch (Ollama → VS Code LM API). */
export function createBrainstormService(configProvider: IConfigProvider | undefined): BrainstormService {
  return new BrainstormService(async (prompt, payload) => {
    const fullPrompt = `${prompt}\n\nTranscript:\n${payload}`;
    const clean = (raw: string): string => {
      let c = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const first = c.indexOf("{"); const last = c.lastIndexOf("}");
      if (first >= 0 && last > first) c = c.slice(first, last + 1);
      return c;
    };
    if (configProvider) {
      const llm = new LLMClient(configProvider);
      if (await llm.checkAvailability()) {
        try {
          const r = await llm.callEndpoint(fullPrompt, 60000);
          return clean(r.response);
        } catch (err) { console.warn("[Brainstorm] Ollama callEndpoint failed:", err); }
      }
    }
    try {
      const vscode = await import("vscode");
      const models = await vscode.lm.selectChatModels();
      if (models.length > 0) {
        const messages = [vscode.LanguageModelChatMessage.User(fullPrompt)];
        const chatResponse = await models[0].sendRequest(messages);
        let text = "";
        for await (const chunk of chatResponse.text) text += chunk;
        return clean(text);
      }
    } catch { /* VS Code LM API not available */ }
    throw new Error("No LLM available — start Ollama or enable a VS Code language model");
  });
}
