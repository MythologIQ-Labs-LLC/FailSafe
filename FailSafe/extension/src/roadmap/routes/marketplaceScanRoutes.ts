// Marketplace scan + uninstall routes (B-INT-7 decomposition).
// scan/:id (re-scan an installed item) · uninstall/:id (remove + ledger).

import { Request, Response } from "express";
import type { MarketplaceRouteDeps } from "./marketplaceRouteShared";

export function registerMarketplaceScanRoutes(
  app: import("express").Application,
  deps: MarketplaceRouteDeps,
): void {
  // POST /api/marketplace/scan/:id - Run security scan on installed item
  app.post("/api/marketplace/scan/:id", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;

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

    deps.broadcast({
      type: "marketplace.scanning",
      payload: { itemId: item.id },
    });

    // Run scan asynchronously
    deps.securityScanner
      .runFullScan(item.installPath, (msg) => {
        deps.broadcast({
          type: "marketplace.scan.progress",
          payload: { itemId: item.id, message: msg },
        });
      })
      .then((scanResult) => {
        deps.marketplaceCatalog.updateItemStatus(item.id, {
          status: scanResult.passed ? "installed" : "quarantined",
          securityScan: scanResult,
          trustTier: scanResult.passed ? "scanned" : "quarantined",
        });

        deps.broadcast({
          type: "marketplace.scanned",
          payload: { itemId: item.id, result: scanResult },
        });
      });

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
