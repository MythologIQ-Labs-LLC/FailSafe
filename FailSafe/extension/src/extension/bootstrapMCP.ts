import * as vscode from "vscode";
import { FailSafeMCPServer } from "../mcp/FailSafeServer";
import { SentinelSubstrate } from "./bootstrapSentinel";
import { QorLogicSubstrate } from "./bootstrapQorLogic";
import { GovernanceSubstrate } from "./bootstrapGovernance";
import { RiskManager } from "../qorelogic/risk/RiskManager";
import { Logger } from "../shared/Logger";

export async function bootstrapMCP(
  context: vscode.ExtensionContext,
  sentinel: SentinelSubstrate,
  qor: QorLogicSubstrate,
  gov: GovernanceSubstrate,
  logger: Logger,
  riskManager?: RiskManager,
): Promise<FailSafeMCPServer | undefined> {
  logger.info("Starting MCP Governance Server...");
  try {
    const mcpServer = new FailSafeMCPServer(
      context,
      sentinel.sentinelDaemon,
      qor.ledgerManager,
      gov.intentService,
      gov.sessionManager,
      riskManager,
    );
    await mcpServer.start();
    return mcpServer;
  } catch (error) {
    logger.error("Failed to start MCP Server", error);
    return undefined;
  }
}
