// Marketplace scan + uninstall routes (B-INT-7 decomposition).
// scan/:id (re-scan an installed item) · uninstall/:id (remove + ledger).

import { Request, Response } from "express";
import type { MarketplaceRouteDeps } from "./marketplaceRouteShared";
import { MARKETPLACE_INSTALLS_ENABLED } from "../services/MarketplaceInstaller";
import { startRescan } from "./marketplaceInstallRoutes";

export function registerMarketplaceScanRoutes(
  app: import("express").Application,
  deps: MarketplaceRouteDeps,
): void {
  // POST /api/marketplace/scan/:id - Run security scan on installed item
  app.post("/api/marketplace/scan/:id", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    // #468: scanning stays shut for as long as installation is (the release gate);
    // the scanners themselves run from an empty folder through the trusted resolver.
    if (!MARKETPLACE_INSTALLS_ENABLED) { res.status(503).json({ error: "Marketplace scanning temporarily disabled pending security remediation (#468/#469)" }); return; }

    const itemId = String(req.params.id);
    const item = deps.marketplaceCatalog.getItem(itemId);
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    if (!item.installPath) {
      res.status(400).json({ error: "Item is not installed" });
      return;
    }

    // Update status
    deps.marketplaceCatalog.updateItemStatus(item.id, { status: "scanning" });

    // Run scan asynchronously (#469: a rejected scan quarantines, never leaves the item scanning)
    void startRescan(deps, item);

    res.json({
      status: "scanning",
      itemId: item.id,
      message: "Security scan started. Results will be broadcast via WebSocket.",
    });
  });

  // DELETE /api/marketplace/uninstall/:id - Uninstall an item
  app.delete(
    "/api/marketplace/uninstall/:id",
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;

      const itemId = String(req.params.id);
      const item = deps.marketplaceCatalog.getItem(itemId);
      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      const success = await deps.marketplaceInstaller.uninstall(item);

      if (success) {
        deps.marketplaceCatalog.updateItemStatus(item.id, {
          status: "not-installed",
          installPath: undefined,
          installedAt: undefined,
          securityScan: undefined,
          trustTier: "unverified",
        });

        // Record to ledger
        if (deps.ledgerManager) {
          deps.ledgerManager.appendEntry({
            eventType: "MARKETPLACE_UNINSTALL",
            agentDid: "did:failsafe:marketplace",
            payload: { itemId: item.id, itemName: item.name },
          });
        }

        deps.broadcast({
          type: "marketplace.uninstalled",
          payload: { itemId: item.id },
        });
      }

      res.json({ success, itemId: item.id });
    },
  );
}
