/**
 * MCP tool: failsafe.create_risk
 *
 * Lets the coding agent (Claude Code, Codex, Copilot, etc.) record a risk
 * directly into the project's Risk Register from inside its session.
 * The tool forces `source: 'mcp'` on the persisted risk regardless of any
 * value the agent supplies in the input payload.
 *
 * Per plan-qor-model-sourced-risks.md Phase 2.
 */

import { z } from "zod";
import { RiskManager } from "../../qorelogic/risk/RiskManager";
import type { RiskCategory, RiskSeverity } from "../../qorelogic/risk/types";

const SEVERITY_VALUES: readonly RiskSeverity[] = [
  "critical", "high", "medium", "low",
];
const CATEGORY_VALUES: readonly RiskCategory[] = [
  "security", "performance", "technical-debt", "dependency",
  "governance", "compliance", "operational",
];

export interface CreateRiskToolResult {
  ok: boolean;
  id?: string;
  source?: "mcp";
  sourceAgent?: string;
  error?: string;
  field?: string;
}

export type ToolRegistrar = (
  name: string,
  description: string,
  schema: Record<string, z.ZodTypeAny>,
  handler: (args: unknown) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
) => void;

export interface CreateRiskInput {
  title: string;
  description: string;
  severity: string;
  category: string;
  impact: string;
  mitigation: string;
  sourceAgent: string;
  relatedArtifacts?: string[];
}

/** Validate enum membership without trusting the agent's string. */
function validateInput(input: CreateRiskInput): CreateRiskToolResult | null {
  if (!input.sourceAgent || typeof input.sourceAgent !== "string") {
    return { ok: false, error: "missing-source-agent" };
  }
  if (!(SEVERITY_VALUES as readonly string[]).includes(input.severity)) {
    return { ok: false, error: "invalid-enum-value", field: "severity" };
  }
  if (!(CATEGORY_VALUES as readonly string[]).includes(input.category)) {
    return { ok: false, error: "invalid-enum-value", field: "category" };
  }
  return null;
}

/** Pure handler — exported for unit testing without the MCP transport. */
export function handleCreateRisk(
  input: CreateRiskInput,
  riskManager: RiskManager,
): CreateRiskToolResult {
  const validation = validateInput(input);
  if (validation) return validation;

  const risk = riskManager.createRisk({
    title: input.title,
    description: input.description,
    severity: input.severity as RiskSeverity,
    category: input.category as RiskCategory,
    impact: input.impact,
    mitigation: input.mitigation,
    relatedArtifacts: input.relatedArtifacts,
    // Source is forced to 'mcp' regardless of agent-supplied value.
    source: "mcp",
    sourceAgent: input.sourceAgent,
  });

  return { ok: true, id: risk.id, source: "mcp", sourceAgent: input.sourceAgent };
}

const SCHEMA: Record<string, z.ZodTypeAny> = {
  title: z.string().min(3).max(120).describe("Short risk title"),
  description: z.string().describe("Detailed risk description"),
  severity: z.enum(["critical", "high", "medium", "low"]).describe("Risk severity"),
  category: z.enum([
    "security", "performance", "technical-debt", "dependency",
    "governance", "compliance", "operational",
  ]).describe("Risk category"),
  impact: z.string().describe("What happens if the risk materializes"),
  mitigation: z.string().describe("Proposed mitigation"),
  sourceAgent: z.string().min(1).describe("Self-identifying agent (claude-code, copilot, codex-cli)"),
  relatedArtifacts: z.array(z.string()).optional().describe("Freeform references"),
};

export function registerCreateRiskTool(
  registrar: ToolRegistrar,
  riskManager: RiskManager,
): void {
  registrar(
    "failsafe.create_risk",
    "Record a risk into the project's Risk Register from the coding model.",
    SCHEMA,
    async (args: unknown) => {
      const result = handleCreateRisk(args as CreateRiskInput, riskManager);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
