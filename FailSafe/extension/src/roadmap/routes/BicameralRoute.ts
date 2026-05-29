// Bicameral MCP integration routes — orchestrator.
//
// B-INT-6: decomposed from a single 490-line module into a shared core
// (`bicameralRouteShared.ts`: deps contract + governToolCall + helpers) plus
// three route-group registrars wired here:
//   - lifecycle/config (status · install · connect/disconnect · auto-connect · upstream)
//   - decision feed    (history · drift · ratify · open-binding — B151-governed)
//   - advanced tools    (B-INT-1: 11 tool routes via bicameralToolRoutes)
//
// B151: the governed tool routes run their call through the universal
// McpInterceptor when one is wired; a non-ALLOW receipt short-circuits via the
// receipt→HTTP table in the shared core. When no interceptor is wired (legacy
// fixtures) the routes behave exactly as before migration.
//
// The public surface (`setupBicameralRoutes`, `BicameralRouteDeps`,
// `governToolCall`) is preserved via the re-exports below so existing importers
// + tests are unaffected by the decomposition.

import { registerBicameralLifecycleRoutes } from "./bicameralLifecycleRoutes";
import { registerBicameralDecisionRoutes } from "./bicameralDecisionRoutes";
import { registerBicameralToolRoutes } from "./bicameralToolRoutes";
import type { BicameralRouteDeps } from "./bicameralRouteShared";

export { governToolCall } from "./bicameralRouteShared";
export type { BicameralRouteDeps } from "./bicameralRouteShared";

export function setupBicameralRoutes(
  app: import("express").Application,
  deps: BicameralRouteDeps,
): void {
  registerBicameralLifecycleRoutes(app, deps);
  registerBicameralDecisionRoutes(app, deps);
  registerBicameralToolRoutes(app, deps); // B-INT-1: 11 advanced tool routes
}
