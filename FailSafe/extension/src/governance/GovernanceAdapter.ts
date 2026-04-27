/**
 * GovernanceAdapter - Unified preflight path for all governance decisions.
 * Single entry point: Nonce -> Transparency -> Policy -> Ledger -> Decision.
 *
 * Decomposed into helper modules for testability (Section 4 Simplicity).
 */

import { EventBus } from "../shared/EventBus";
import { Logger } from "../shared/Logger";
import { LedgerManager } from "../qorelogic/ledger/LedgerManager";
import { PolicyEngine } from "../qorelogic/policies/PolicyEngine";
import {
  SecurityReplayGuard,
  createSignedRequest,
} from "./SecurityReplayGuard";
import { PromptTransparency } from "./PromptTransparency";
import { PolicyEvaluator } from "./PolicyEvaluator";
import { TrustEngine } from "../qorelogic/trust/TrustEngine";
import { NonceResolver } from "./adapters/NonceResolver";
import { TransparencyEmitter } from "./adapters/TransparencyEmitter";
import { LedgerRecorder } from "./adapters/LedgerRecorder";
import { SentinelVerdict } from "../shared/types";

export type GovernanceAction =
  | "file.write"
  | "file.delete"
  | "intent.create"
  | "intent.seal"
  | "checkpoint.create"
  | "agent.register"
  | "l3.approve"
  | "l3.reject";

export interface DecisionRequest {
  action: GovernanceAction;
  agentDid: string;
  intentId?: string;
  artifactPath?: string;
  artifactHash?: string;
  payload?: Record<string, unknown>;
  nonce?: string;
  workflow?: 'qor-plan' | 'auto-create' | 'manual';
}

export interface DecisionResponse {
  allowed: boolean;
  nonce: string;
  riskGrade: "L1" | "L2" | "L3";
  verdict?: SentinelVerdict;
  conditions?: string[];
  reason?: string;
  timestamp: string;
  ledgerEntryId?: string;
}

export interface GovernanceAdapterConfig {
  enableReplayGuard: boolean;
  enableTransparency: boolean;
  enableLedger: boolean;
  defaultRiskGrade: "L1" | "L2" | "L3";
}

const DEFAULT_CONFIG: GovernanceAdapterConfig = {
  enableReplayGuard: true,
  enableTransparency: true,
  enableLedger: true,
  defaultRiskGrade: "L1",
};

/**
 * GovernanceAdapter provides unified governance decision flow
 */
export class GovernanceAdapter {
  private readonly logger: Logger;
  private readonly config: GovernanceAdapterConfig;
  private readonly policyEvaluator: PolicyEvaluator;
  private readonly nonceResolver: NonceResolver;
  private readonly transparencyEmitter: TransparencyEmitter;
  private readonly ledgerRecorder: LedgerRecorder;

  constructor(
    private readonly eventBus: EventBus,
    private readonly ledger: LedgerManager,
    private readonly policyEngine: PolicyEngine,
    private readonly replayGuard: SecurityReplayGuard,
    private readonly transparency: PromptTransparency,
    private readonly trustEngine: TrustEngine,
    config: Partial<GovernanceAdapterConfig> = {},
  ) {
    this.logger = new Logger("GovernanceAdapter");
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.policyEvaluator = new PolicyEvaluator(policyEngine, this.logger);

    // Initialize helper modules
    this.nonceResolver = new NonceResolver(replayGuard, {
      enableReplayGuard: this.config.enableReplayGuard,
    });
    this.transparencyEmitter = new TransparencyEmitter(transparency, {
      enableTransparency: this.config.enableTransparency,
    });
    this.ledgerRecorder = new LedgerRecorder(ledger, policyEngine, trustEngine, {
      enableLedger: this.config.enableLedger,
    });
  }

  /**
   * Evaluate a governance decision request
   *
   * This is the main entry point for all governance decisions.
   */
  async evaluate(request: DecisionRequest): Promise<DecisionResponse> {
    const timestamp = new Date().toISOString();
    this.logger.info("Evaluating governance request", {
      action: request.action,
      agentDid: request.agentDid,
    });

    // 1. Resolve nonce
    const nonceResult = this.nonceResolver.resolve(request, timestamp);
    if (NonceResolver.isFailedResponse(nonceResult)) {
      return nonceResult;
    }

    // 2. Enrich with agent identity
    this.enrichWithAgentIdentity(request);

    // 3. Emit transparency start
    const transparencyBuildId = this.transparencyEmitter.emitStart(request);

    // 4. Evaluate policy
    const policyResult = await this.policyEvaluator.evaluate(request);

    // 5. Record to ledger
    const ledgerEntryId = await this.ledgerRecorder.record(
      request, policyResult, nonceResult.nonce,
    );

    // 6. Emit transparency completion
    this.transparencyEmitter.emitCompletion(
      transparencyBuildId, nonceResult.nonce, policyResult,
    );

    return {
      allowed: policyResult.allowed,
      nonce: nonceResult.nonce,
      riskGrade: policyResult.riskGrade,
      conditions: policyResult.conditions,
      reason: policyResult.reason,
      timestamp,
      ledgerEntryId,
    };
  }

  /**
   * Create a signed request for later evaluation
   */
  createRequest(
    action: GovernanceAction,
    agentDid: string,
    payload?: Record<string, unknown>,
  ): DecisionRequest & { nonce: string } {
    const signed = createSignedRequest(this.replayGuard, action, payload || {});
    return {
      action,
      agentDid,
      nonce: signed.nonce,
      payload: signed.payload,
    };
  }

  /** B68: Inject agent identity into request payload */
  private enrichWithAgentIdentity(request: DecisionRequest): void {
    if (request.agentDid && request.workflow) {
      request.payload = {
        ...request.payload,
        agentIdentity: {
          agentDid: request.agentDid,
          workflow: request.workflow,
        },
      };
    }
  }

  /**
   * Get adapter statistics
   */
  getStats(): {
    replayGuard: ReturnType<SecurityReplayGuard["getStats"]>;
    config: GovernanceAdapterConfig;
  } {
    return {
      replayGuard: this.replayGuard.getStats(),
      config: this.config,
    };
  }
}
