/**
 * RiskChatHandler — handles the `/risk` subcommand in the @failsafe chat
 * participant. Drafts a Risk payload from natural-language input, presents
 * it to the operator for confirm/reject, and calls RiskManager.createRisk
 * with source='mcp' on confirm.
 *
 * Per plan-qor-model-sourced-risks Phase 4.
 *
 * Architecture:
 *   - draftRisk(prompt) — pure function; heuristic extraction.
 *   - confirmRisk(draft, sourceAgent, manager) — pure side-effect; calls createRisk.
 *   - RiskChatHandler.handle(request, stream, manager) — orchestrates the
 *     two-step flow via in-chat draft + button confirmation.
 */

import * as vscode from "vscode";
import { RiskManager } from "../../../qorelogic/risk/RiskManager";
import type { Risk, RiskCategory, RiskSeverity } from "../../../qorelogic/risk/types";

export interface DraftedRisk {
  title: string;
  description: string;
  severity: RiskSeverity;
  category: RiskCategory;
  impact: string;
  mitigation: string;
}

const SECURITY_KEYWORDS = ["xss", "sql injection", "auth", "credential", "secret", "csrf", "rce", "sanitiz", "escape"];
const PERFORMANCE_KEYWORDS = ["slow", "latency", "memory leak", "n+1", "blocking"];
const DEPENDENCY_KEYWORDS = ["dependency", "package", "library", "version"];
const COMPLIANCE_KEYWORDS = ["gdpr", "hipaa", "audit", "compliance", "regulatory"];

/** Heuristic category inference from prompt text. */
function inferCategory(prompt: string): RiskCategory {
  const lower = prompt.toLowerCase();
  if (SECURITY_KEYWORDS.some((k) => lower.includes(k))) return "security";
  if (PERFORMANCE_KEYWORDS.some((k) => lower.includes(k))) return "performance";
  if (DEPENDENCY_KEYWORDS.some((k) => lower.includes(k))) return "dependency";
  if (COMPLIANCE_KEYWORDS.some((k) => lower.includes(k))) return "compliance";
  return "technical-debt";
}

/** Heuristic severity inference. */
function inferSeverity(prompt: string): RiskSeverity {
  const lower = prompt.toLowerCase();
  if (/\b(critical|severe|urgent|production down|p0)\b/.test(lower)) return "critical";
  if (/\b(high|important|major|p1)\b/.test(lower)) return "high";
  if (/\b(low|minor|cosmetic)\b/.test(lower)) return "low";
  return "medium";
}

/** Compose a draft Risk from natural-language prompt text. Pure. */
export function draftRisk(prompt: string): DraftedRisk {
  const cleaned = prompt.trim();
  const truncatedTitle = cleaned.length > 80 ? cleaned.slice(0, 77) + "..." : cleaned;
  return {
    title: truncatedTitle || "Untitled risk",
    description: cleaned,
    severity: inferSeverity(cleaned),
    category: inferCategory(cleaned),
    impact: "(operator: clarify impact)",
    mitigation: "(operator: clarify mitigation)",
  };
}

/** Persist a confirmed draft. Forces source='mcp'. Pure side-effect. */
export function confirmRisk(
  draft: DraftedRisk,
  sourceAgent: string,
  riskManager: RiskManager,
): Risk {
  return riskManager.createRisk({
    title: draft.title,
    description: draft.description,
    severity: draft.severity,
    category: draft.category,
    impact: draft.impact,
    mitigation: draft.mitigation,
    source: "mcp",
    sourceAgent,
  });
}

export class RiskChatHandler {
  constructor(private readonly sourceAgent: string = "claude-code-chat") {}

  async handle(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    riskManager: RiskManager,
  ): Promise<vscode.ChatResult> {
    const prompt = (request.prompt || "").trim();
    if (!prompt) {
      stream.markdown("**Usage**: `@failsafe /risk <describe the risk>`\n\n");
      stream.markdown("I'll draft a structured risk and offer a one-click create button.");
      return { metadata: { command: "risk" } };
    }

    const draft = draftRisk(prompt);
    stream.markdown(`## Risk Draft\n\n`);
    stream.markdown(`- **Title**: ${draft.title}\n`);
    stream.markdown(`- **Severity**: ${draft.severity}\n`);
    stream.markdown(`- **Category**: ${draft.category}\n`);
    stream.markdown(`- **Description**: ${draft.description}\n\n`);
    stream.markdown(`_Click below to add this risk to the register. Source will be recorded as \`mcp · ${this.sourceAgent}\`._\n\n`);

    stream.button({
      command: "failsafe.confirmDraftedRisk",
      title: "Create Risk",
      arguments: [{ draft, sourceAgent: this.sourceAgent }],
    });

    return { metadata: { command: "risk", draft } as unknown as vscode.ChatResult["metadata"] };
  }
}
