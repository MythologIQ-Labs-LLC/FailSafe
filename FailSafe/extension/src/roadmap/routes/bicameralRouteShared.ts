// Bicameral route shared core (B-INT-6 decomposition of BicameralRoute.ts).
// Holds the dependency contract + cross-route primitives so the route-group
// modules (lifecycle / decision / tool) and the BicameralRoute orchestrator
// all import downward from here — no import cycle.

import { Request, Response } from "express";
import type {
  InstallMode,
  BicameralRatifyVerdict,
  BicameralMcpClient,
} from "../../integrations/bicameral";
import type { McpInterceptor, McpEnvelope } from "../../governance/interceptor";
import type { ReceiptContract } from "../../contracts";
import type { BicameralDriftStatus } from "../../integrations/bicameral/types";
import type { BicameralVerdictEventPayload } from "../../shared/types/events";

export interface BicameralRouteDeps {
  rejectIfRemote: (req: Request, res: Response) => boolean;
  broadcast: (data: Record<string, unknown>) => void;
  workspaceRoot: string;
  /** Returns the bicameral CLI command (operator-overridable via VS Code settings). */
  getBicameralCommand: () => string;
  /**
   * Returns the lazily-constructed MCP client. May return null when bootstrap
   * hasn't wired one (e.g., unit test contexts). Routes must 503 when null.
   */
  getBicameralClient: () => BicameralMcpClient | null;
  /** Read the operator-facing autoConnect setting. */
  getAutoConnect: () => boolean;
  /**
   * Persist the autoConnect toggle. Implemented in bootstrap as a VS Code
   * configuration.update(); tests can stub. May reject; route surfaces error.
   */
  setAutoConnect: (value: boolean) => Promise<void>;
  /**
   * B-BIC-1: optional ledger handle. When provided, the ratify handler appends
   * a USER_OVERRIDE entry so the operator's intentional acceptance is Merkle-
   * anchored. Non-blocking — ledger write failures don't break the ratify
   * response.
   */
  ledgerManager?: {
    isAvailable(): boolean;
    appendEntry(entry: {
      eventType: string;
      agentDid: string;
      payload: Record<string, unknown>;
    }): Promise<unknown>;
  };
  /**
   * B-BIC-16: optional drift-to-L3 mediator. When provided, the drift handler
   * forwards results so newly-drifted decisions auto-enqueue L3 entries.
   */
  driftToL3Mediator?: {
    onDriftResult(drifted: import("../../integrations/bicameral/types").BicameralDriftStatus[]): Promise<void>;
  };
  /**
   * Phase 4: optional upstream monitor. When provided, the
   * /api/integrations/bicameral/upstream route returns the latest snapshot
   * (release version + open-issue count) or 503 if no poll has completed.
   */
  upstreamMonitor?: {
    getSnapshot(): import("../../integrations/bicameral/types").UpstreamSnapshot | null;
  };
  /**
   * B151: optional universal governance interceptor. When provided, the 3 tool
   * routes (history/drift/ratify) govern their tool call through it before
   * touching the bicameral client. A non-ALLOW receipt short-circuits via the
   * receipt→HTTP table. Null/absent → routes behave exactly as pre-migration.
   */
  getMcpInterceptor?: () => McpInterceptor | null;
  /**
   * B-BIC-12: optional editor-open dep. When provided, the
   * /api/actions/bicameral-open-binding route opens a decision's bound source
   * file in the editor. Wired in bootstrapBicameral.ts to vscode.open so
   * BicameralRoute.ts never imports vscode. Absent → that route 503s.
   */
  openFileInEditor?: (filePath: string, startLine?: number) => Promise<void>;
  /**
   * B-BIC-17/18 (Batch 4): optional event-bus handle. When provided, the
   * drift handler emits one `bicameral.verdict` event per drifted/in-sync
   * decision (skipping `unknown`) and the ratify handler emits a
   * `verdict:'ratified'` event. Emits are non-blocking and absent-eventBus-
   * safe — when omitted both handlers behave exactly as before.
   */
  eventBus?: {
    emit(type: "bicameral.verdict", payload: BicameralVerdictEventPayload): void;
  };
}

/**
 * B-BIC-17/18: map a `BicameralDriftStatus` onto the `bicameral.verdict`
 * event verdict enum (RD-1). `unknown` returns null — the drift handler
 * skips those rows so only actionable verdicts reach the event bus.
 */
export function mapDriftToVerdict(
  status: BicameralDriftStatus["status"],
): BicameralVerdictEventPayload["verdict"] | null {
  if (status === "drifted") return "drifted";
  if (status === "in-sync") return "in-sync";
  return null;
}

/**
 * B-BIC-17/18: emit one `bicameral.verdict` per drifted/in-sync decision in
 * a drift result. Absent-eventBus-safe and exception-isolated — a faulty
 * subscriber must never break the drift route response.
 */
export function emitDriftVerdicts(
  deps: BicameralRouteDeps,
  drift: BicameralDriftStatus[],
): void {
  const bus = deps.eventBus;
  if (!bus || !Array.isArray(drift)) return;
  for (const row of drift) {
    const verdict = mapDriftToVerdict(row.status);
    if (!verdict) continue;
    try {
      bus.emit("bicameral.verdict", {
        decisionId: row.decisionId,
        verdict,
        evidence: row.evidence,
      });
    } catch {
      /* a faulty subscriber must not break the drift route (Batch 4) */
    }
  }
}

/**
 * B151: receipt→HTTP mapping for non-ALLOW verdicts. ALLOW is absent — it
 * means "proceed", handled by the caller. Each entry maps a blocking verdict
 * to the HTTP status + error envelope returned in its place.
 */
const RECEIPT_HTTP_TABLE: Record<string, { status: number }> = {
  BLOCK: { status: 403 },
  ESCALATE: { status: 409 },
  MODIFY: { status: 409 },
  QUARANTINE: { status: 500 },
};

/**
 * B151: govern a bicameral tool call through the optional McpInterceptor.
 * Returns `null` when the route may proceed (no interceptor wired, or an ALLOW
 * verdict). Returns `true` when the request has been answered by a non-ALLOW
 * receipt (the caller must stop). Pure HTTP side effect on the `res`.
 */
export async function governToolCall(
  deps: BicameralRouteDeps,
  envelope: McpEnvelope,
  res: Response,
): Promise<boolean> {
  const interceptor = deps.getMcpInterceptor?.() ?? null;
  if (!interceptor) return false;
  const receipt: ReceiptContract = await interceptor.intercept(envelope);
  if (receipt.verdict === "ALLOW") return false;
  const mapped = RECEIPT_HTTP_TABLE[receipt.verdict] ?? { status: 500 };
  res.status(mapped.status).json({
    ok: false,
    error: receipt.verdictRationale ?? `governance verdict: ${receipt.verdict}`,
    verdict: receipt.verdict,
  });
  return true;
}

export function parseInstallMode(raw: unknown): InstallMode | null {
  if (raw === "solo" || raw === "team") return raw;
  return null;
}

export function parseVerdict(raw: unknown): BicameralRatifyVerdict | null {
  if (raw === "ratify" || raw === "reject") return raw;
  return null;
}
