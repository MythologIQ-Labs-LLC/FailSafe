// Bicameral integration wiring — mediator + verdict-consumer + upstream
// wiring. Extracted from bootstrapBicameral.ts (Batch 4) as a cohesive
// helper so that file stays under the Section 4 razor limit. Holds the
// post-client wiring blocks: the B-BIC-16 drift-to-L3 mediator, the B-INT-2
// preflight-to-L3 mediator, the B-BIC-18 drift-to-risk mediator, the
// B-BIC-17 Sentinel verdict classifier, and the Phase 4 upstream monitor.

import * as vscode from "vscode";
import { DriftToL3Mediator } from "../integrations/bicameral/DriftToL3Mediator";
import { DriftToRiskMediator } from "../integrations/bicameral/DriftToRiskMediator";
import { PreflightToL3Mediator } from "../integrations/bicameral/PreflightToL3Mediator";
import { UpstreamMonitor } from "../integrations/bicameral/UpstreamMonitor";
import { httpFetchShim } from "../integrations/bicameral/http-fetch-shim";
import { SentinelWatchPolicy } from "../sentinel/SentinelWatchPolicy";
import type { EventBus } from "../shared/EventBus";
import type { FailSafeEvent } from "../shared/types";
import type { BicameralVerdictEventPayload } from "../shared/types/events";
import type {
  BicameralIntegrationDeps,
  ConsoleServerSurface,
} from "./bootstrapBicameral";

/** B-BIC-16: drift-to-L3 mediator. Wired only when all deps are supplied. */
function wireDriftToL3(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  deps: BicameralIntegrationDeps,
): void {
  if (!deps.l3Service || !deps.eventBus || !deps.logger || !consoleServer.setDriftToL3Mediator) {
    return;
  }
  const client = consoleServer.getBicameralClient();
  if (!client) return;
  const mediator = new DriftToL3Mediator({
    client,
    l3Service: deps.l3Service,
    eventBus: deps.eventBus,
    logger: deps.logger,
  });
  consoleServer.setDriftToL3Mediator(mediator);
  context.subscriptions.push({ dispose: () => mediator.dispose() });
}

/** B-INT-2: preflight-to-L3 mediator. Wired when the L3 preflight surface +
 *  logger are supplied; the client is read lazily so a rewire is picked up. */
function wirePreflightToL3(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  deps: BicameralIntegrationDeps,
): void {
  if (!deps.l3PreflightService || !deps.logger) return;
  const l3Preflight = deps.l3PreflightService;
  const mediator = new PreflightToL3Mediator({
    client: () => consoleServer.getBicameralClient(),
    l3Service: l3Preflight,
    logger: deps.logger,
  });
  l3Preflight.setPreflightMediator(mediator);
  context.subscriptions.push({
    dispose: () => l3Preflight.setPreflightMediator(null),
  });
}

/** B-BIC-17: Sentinel verdict classifier. RD-2 classification-only — a high-
 *  priority notifying verdict is surfaced over the existing WebSocket
 *  broadcast channel; it is NOT made a SentinelEvent nor arbitrated. */
function wireSentinelVerdictClassifier(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  eventBus: EventBus,
): void {
  const policy = new SentinelWatchPolicy();
  const unsubscribe = eventBus.on("bicameral.verdict", (event: FailSafeEvent) => {
    const payload = event.payload as BicameralVerdictEventPayload;
    if (!payload || typeof payload.verdict !== "string") return;
    const classified = policy.classifyBicameralVerdict(payload.verdict);
    if (!classified.notify) return;
    consoleServer.broadcastEvent({
      type: "bicameral.verdict.classified",
      decisionId: payload.decisionId,
      priority: classified.priority,
    });
  });
  context.subscriptions.push({ dispose: () => unsubscribe() });
}

/** B-BIC-17/18 (Batch 4): subscribe the two bicameral.verdict consumers — the
 *  DriftToRiskMediator (Risks Register mirror) + the Sentinel classifier. */
function wireVerdictConsumers(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  deps: BicameralIntegrationDeps,
): void {
  if (!deps.eventBus) return;
  if (deps.riskRegister) {
    const mediator = new DriftToRiskMediator({
      eventBus: deps.eventBus,
      riskRegister: deps.riskRegister,
    });
    context.subscriptions.push({ dispose: () => mediator.dispose() });
  }
  wireSentinelVerdictClassifier(context, consoleServer, deps.eventBus);
}

/** Construct + register the bicameral mediators + the bicameral.verdict
 *  subscribers. Each block is opt-in — wired only when its deps are present. */
export function wireMediators(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  deps: BicameralIntegrationDeps,
): void {
  wireDriftToL3(context, consoleServer, deps);
  wirePreflightToL3(context, consoleServer, deps);
  wireVerdictConsumers(context, consoleServer, deps);
}

/** Phase 4: construct + register the bicameral UpstreamMonitor. Wired only
 *  when logger is present; configProvider falls back to 24h-poll defaults.
 *
 *  RC1 (v5.1.6 hotfix 678c871): the monitor is a non-critical 24h background
 *  poller — it must NEVER abort extension activation. The construction is
 *  wrapped in try/catch, and the HTTP transport is feature-detected: the
 *  extension-host Node runtime does not reliably expose a global `fetch`, so
 *  we fall back to a tiny node:https GET shim. */
export function wireUpstreamMonitor(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  deps: BicameralIntegrationDeps,
): void {
  if (!deps.logger || !consoleServer.setUpstreamMonitor) return;
  const logger = deps.logger;
  try {
    // RC1: feature-detect the global `fetch`. Falls back to the node:https
    // shim on hosts (e.g. some vscode-test electron runtimes) that lack it.
    const httpFetch: typeof fetch =
      typeof fetch === "function" ? fetch : httpFetchShim;
    const monitor = new UpstreamMonitor({
      httpFetch,
      configProvider: deps.configProvider ?? {},
      logger,
    });
    monitor.start();
    consoleServer.setUpstreamMonitor?.(monitor);
    context.subscriptions.push({ dispose: () => monitor.dispose() });
  } catch (err) {
    logger.warn("UpstreamMonitor wiring skipped (non-critical)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
