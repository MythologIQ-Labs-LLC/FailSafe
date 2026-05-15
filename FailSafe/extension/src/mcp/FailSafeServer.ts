import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as vscode from "vscode";
import { SentinelDaemon } from "../sentinel/SentinelDaemon";
import { LedgerManager } from "../qorelogic/ledger/LedgerManager";
import { IntentService } from "../governance/IntentService";
import { SessionManager } from "../governance/SessionManager";
import { RiskManager } from "../qorelogic/risk/RiskManager";
import { registerCreateRiskTool } from "./tools/createRiskTool";
import { Logger } from "../shared/Logger";
import { z } from "zod";
import * as path from "path";

export class FailSafeMCPServer {
  private server: McpServer;
  private logger: Logger;
  private transport: StdioServerTransport | null = null;
  private toolRegistrar: (
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    handler: (args: unknown) => Promise<{ content: Array<{ type: "text"; text: string }> }>
  ) => void;

  constructor(
    private context: vscode.ExtensionContext,
    private sentinel: SentinelDaemon,
    private ledger: LedgerManager,
    private intentService: IntentService,
    private sessionManager?: SessionManager,
    private riskManager?: RiskManager,
  ) {
    this.logger = new Logger("MCP-Server");

    this.server = new McpServer({
      name: "FailSafe Governance",
      version: "1.0.0",
    });
    this.toolRegistrar = this.server.tool.bind(this.server) as unknown as (
      name: string,
      description: string,
      schema: Record<string, z.ZodTypeAny>,
      handler: (args: unknown) => Promise<{ content: Array<{ type: "text"; text: string }> }>
    ) => void;

    this.registerTools();
  }

  private registerTools() {
    // TOOL: sentinel_audit_file
    this.toolRegistrar(
      "sentinel_audit_file",
      "Trigger a heuristic audit on a specific file path.",
      {
        path: z.string().describe("Absolute path to the file to audit"),
        intent_id: z.string().describe("Active Intent ID for authorization"),
      },
      async (args: unknown) => {
        const { path: filePath, intent_id } = args as {
          path: string;
          intent_id: string;
        };
        await this.validateIntent(intent_id);

        if (!this.isPathSafe(filePath)) {
          throw new Error(
            `Security Violation: Path '${filePath}' is outside valid workspace scope.`,
          );
        }

        this.logger.info(`MCP Request: Audit file ${filePath}`);

        const result = await this.sentinel.auditFile(filePath);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    // TOOL: ledger_log_decision
    this.toolRegistrar(
      "ledger_log_decision",
      "Log a governance decision to the SOA Ledger (L2/L3).",
      {
        decision: z.string().max(1000).describe("The decision made"),
        rationale: z.string().max(2000).describe("Justification for the decision"),
        risk_grade: z.enum(["L1", "L2", "L3"]),
        intent_id: z.string(),
      },
      async (args: unknown) => {
        const { decision, rationale, risk_grade, intent_id } = args as {
          decision: string;
          rationale: string;
          risk_grade: "L1" | "L2" | "L3";
          intent_id: string;
        };
        await this.validateIntent(intent_id);

        const entry = await this.ledger.appendEntry({
          eventType: "PROPOSAL",
          agentDid: "did:mcp:external",
          payload: { decision, rationale, risk_grade },
          riskGrade: risk_grade,
        });

        return {
          content: [
            {
              type: "text",
              text: `Logged Entry #${entry.id} (Hash: ${entry.entryHash})`,
            },
          ],
        };
      },
    );

    // TOOL: failsafe.create_risk (plan-qor-model-sourced-risks Phase 2)
    if (this.riskManager) {
      registerCreateRiskTool(this.toolRegistrar, this.riskManager);
    }

    // TOOL: qorelogic_status
    this.server.tool(
      "qorelogic_status",
      "Check current governance capability and lock status.",
      {},
      async () => {
        const activeIntent = await this.intentService.getActiveIntent();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "ACTIVE",
                locked: this.sessionManager?.getState().isLocked ?? false,
                active_intent: activeIntent ? activeIntent.id : null,
              }),
            },
          ],
        };
      },
    );
  }

  private async validateIntent(intentId: string): Promise<void> {
    const active = await this.intentService.getActiveIntent();
    if (!active || active.id !== intentId) {
      throw new Error(
        `MCP Access Denied: Invalid or inactive intent '${intentId}'.`,
      );
    }
  }

  private isPathSafe(fsPath: string): boolean {
    // Enforce absolute paths
    if (!path.isAbsolute(fsPath)) {
      return false;
    }

    // Enforce workspace containment
    const uri = vscode.Uri.file(fsPath);
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return !!folder; // Only allow access if it belongs to an open workspace
  }

  async start() {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
    this.logger.info("FailSafe MCP Server started on stdio");

    // Notify VS Code host
    vscode.window.showInformationMessage(
      "FailSafe MCP Server: LISTENING (stdio)",
    );
  }

  async stop() {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.logger.info("FailSafe MCP Server stopped");
  }
}
