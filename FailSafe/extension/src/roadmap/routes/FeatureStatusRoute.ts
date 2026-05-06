/**
 * FeatureStatusRoute - Express handlers for `/api/v1/features` and
 * `/api/v1/status`.
 *
 * Extracted from ConsoleServer.registerFeatureAndStatusRoutes (B166
 * Phase 2 / plan-v4.10.1a-no-b132). Behavior preserved verbatim — the
 * status response derives from `deps.buildHubSnapshot()` exactly as the
 * inline implementation did. No `rejectIfRemote` short-circuit applies
 * to either endpoint, matching the original.
 */
import type { Application, Request, Response } from "express";
import { FEATURE_TIER_MAP } from "../../core/FeatureGateService";
import type { FeatureFlag } from "../../core/interfaces/IFeatureGate";
import type { ApiRouteDeps } from "./types";

export function registerFeatureStatusRoute(
  app: Application,
  deps: ApiRouteDeps,
): void {
  app.get("/api/v1/features", (_req: Request, res: Response) => {
    if (!deps.featureGate) {
      res.json({ tier: "free", features: {} });
      return;
    }
    const gate = deps.featureGate;
    const tier = gate.getTier();
    const features: Record<string, { requiredTier: string; enabled: boolean }> = {};
    for (const flag of Object.keys(FEATURE_TIER_MAP) as FeatureFlag[]) {
      features[flag] = {
        requiredTier: FEATURE_TIER_MAP[flag],
        enabled: gate.isEnabled(flag),
      };
    }
    res.json({ tier, features });
  });

  app.get("/api/v1/status", async (_req: Request, res: Response) => {
    const hub = await deps.buildHubSnapshot();
    const sentinel = hub.sentinelStatus as Record<string, unknown> | undefined;
    res.json({
      sentinel: {
        running: sentinel?.running ?? false,
        mode: sentinel?.mode ?? "unknown",
        eventsProcessed: sentinel?.eventsProcessed ?? 0,
      },
      governance: { mode: sentinel?.mode ?? "observe" },
      chain: { valid: hub.chainValid ?? false },
      version: hub.version ?? "unknown",
    });
  });
}
