/**
 * MarketplaceRoute - REST API endpoints for the Agent Marketplace — orchestrator.
 *
 * Provides catalog browsing, installation with HITL gates, security scanning,
 * and uninstallation endpoints.
 *
 * B-INT-7: decomposed from a single 382-line module into a shared nonce core
 * (`marketplaceRouteShared.ts`) plus three route-group registrars (read /
 * install / scan) wired here. `setupMarketplaceRoutes` + `MarketplaceRouteDeps`
 * are preserved (the latter re-exported) so importers + tests are unaffected.
 */
import { registerMarketplaceReadRoutes } from "./marketplaceReadRoutes";
import { registerMarketplaceInstallRoutes } from "./marketplaceInstallRoutes";
import { registerMarketplaceScanRoutes } from "./marketplaceScanRoutes";
import { type MarketplaceRouteDeps, cleanExpiredNonces } from "./marketplaceRouteShared";

export type { MarketplaceRouteDeps } from "./marketplaceRouteShared";

export function setupMarketplaceRoutes(
  app: import("express").Application,
  deps: MarketplaceRouteDeps,
): void {
  // Clean expired HITL nonces periodically.
  setInterval(cleanExpiredNonces, 60000);

  registerMarketplaceReadRoutes(app, deps);
  registerMarketplaceInstallRoutes(app, deps);
  registerMarketplaceScanRoutes(app, deps);
}
