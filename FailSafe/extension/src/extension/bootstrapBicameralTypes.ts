// Wiring surfaces and dependencies of the Bicameral integration (bootstrapBicameral.ts),
// split out for the Section 4 razor. Re-exported from bootstrapBicameral.
import type { BicameralMcpClient } from "../integrations/bicameral";
import type { DriftToL3Mediator } from "../integrations/bicameral/DriftToL3Mediator";
import type { RiskRegisterDeps } from "../integrations/bicameral/DriftToRiskMediator";
import type { PreflightToL3Mediator } from "../integrations/bicameral/PreflightToL3Mediator";
import type { UpstreamMonitor } from "../integrations/bicameral/UpstreamMonitor";
import type { McpInterceptor } from "../governance/interceptor";
import type { EnforcementEngineLike } from "../governance/interceptor/EngineBackedInterceptor";
import type { EventBus } from "../shared/EventBus";
import type { Logger } from "../shared/Logger";
import type { L3ApprovalRequest } from "../shared/types/l3-approval";

export interface ConsoleServerSurface {
  setBicameralAutoConnect(value: boolean): void;
  setBicameralCommand(cmd: string): void;
  setBicameralClient(c: BicameralMcpClient | null): void;
  setBicameralAutoConnectWriter(fn: (value: boolean) => Promise<void>): void;
  broadcastEvent(data: Record<string, unknown>): void;
  /** B-BIC-2: typed accessor for the lazily-wired MCP client. */
  getBicameralClient(): BicameralMcpClient | null;
  /** LD16 (b): the rewire the install route runs after a successful install.
   *  Optional on the surface so older test fixtures are tolerated. */
  setBicameralRewire?(fn: (() => Promise<void>) | null): void;
  /** B151: register the universal governance interceptor that the bicameral
   *  tool routes govern through. Null when no enforcement engine is wired. */
  setMcpInterceptor?(i: McpInterceptor | null): void;
  /** B233: read-side binding check; absent only in old test surfaces. */
  getMcpInterceptor?(): McpInterceptor | null;
  /** B-BIC-12: register the editor-open dep so the bicameral-open-binding
   *  route can open a decision's bound source file. Optional on the surface so
   *  older test fixtures that don't expose it are tolerated. */
  setBicameralOpenFileInEditor?(
    fn: ((filePath: string, startLine?: number) => Promise<void>) | null,
  ): void;
  /** B-BIC-16: setter for the drift-to-L3 mediator so the BicameralRoute
   *  drift handler can forward results without threading the mediator
   *  through every call site. Null when no mediator wired (test fixtures). */
  setDriftToL3Mediator?(m: DriftToL3Mediator | null): void;
  /** Phase 4: setter for the upstream monitor. Null when test fixtures don't
   *  wire it (e.g. unit tests that don't exercise the upstream route). */
  setUpstreamMonitor?(m: UpstreamMonitor | null): void;
}

export interface L3QueueDeps {
  queueL3Approval(
    request: Omit<L3ApprovalRequest, "id" | "state" | "queuedAt" | "slaDeadline">,
  ): Promise<string>;
}

/** B-INT-2: L3 surface needed to wire the preflight mediator — attach
 *  evidence + register the mediator. Optional dep; absent → no preflight. */
export interface L3PreflightWiringDeps {
  attachPreflightEvidence(
    approvalId: string,
    preflightMeta: Record<string, unknown>,
    flag: string,
  ): Promise<void>;
  setPreflightMediator(mediator: PreflightToL3Mediator | null): void;
}

export interface ConfigProviderLike {
  getNumber?(key: string, defaultValue: number): number;
  getString?(key: string, defaultValue: string): string;
}

export interface BicameralIntegrationDeps {
  l3Service?: L3QueueDeps;
  /** B-INT-2: L3 service surface for the preflight mediator. When supplied,
   *  tier-3 actions are preflight-checked against bicameral decisions. */
  l3PreflightService?: L3PreflightWiringDeps;
  eventBus?: EventBus;
  logger?: Logger;
  /** B151: enforcement engine backing the universal governance interceptor.
   *  When provided, the bicameral tool routes govern through an McpInterceptor
   *  wrapping an EngineBackedInterceptor. Absent → routes behave un-governed. */
  enforcementEngine?: EnforcementEngineLike;
  /** Phase 4: optional config provider for UpstreamMonitor. When absent,
   *  the monitor uses defaults (24h poll, BicameralAI/bicameral-mcp). */
  configProvider?: ConfigProviderLike;
  /** B-BIC-18 (Batch 4): Risks Register surface for the DriftToRiskMediator.
   *  When supplied alongside eventBus, bicameral drift verdicts are mirrored
   *  into the Risks Register and ratify verdicts close them. Absent → no
   *  risk mirror (opt-in, same as the other mediators). */
  riskRegister?: RiskRegisterDeps;
}

/** B233: connect the *existing* governed client. Never publish a stale connection. */
export async function connectWiredBicameral(
  client: BicameralMcpClient,
  isCurrent: () => boolean,
  onConnected: () => void,
): Promise<boolean> {
  if (!isCurrent() || client.isConnected()) return false;
  await client.connect();
  if (!client.isConnected()) throw new Error('Bicameral client connect completed without an active session');
  if (!isCurrent()) {
    await client.disconnect().catch(() => undefined);
    return false;
  }
  onConnected();
  return true;
}
