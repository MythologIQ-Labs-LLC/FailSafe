// Marketplace scan + uninstall routes (B-INT-7 decomposition).
// scan/:id (re-scan an installed item) · uninstall/:id (remove + ledger).

import { Request, Response } from "express";
import type { MarketplaceRouteDeps } from "./marketplaceRouteShared";
import { MARKETPLACE_INSTALLS_ENABLED } from "../services/MarketplaceInstaller";
import { startRescan } from "./marketplaceInstallRoutes";
import { MARKETPLACE_AGENT_DID, durableAppend, receiptFields } from "./marketplaceInstallReceipt";

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

    const answer = requestRescan(deps, String(req.params.id));
    res.status(answer.status).json(answer.body);
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

        // #538: the receipt is awaited; one that cannot be written is named, never left unhandled.
        const receipt = await durableAppend(deps.ledgerManager, {
          eventType: "MARKETPLACE_UNINSTALL",
          agentDid: MARKETPLACE_AGENT_DID,
          payload: { itemId: item.id, itemName: item.name },
        });

        deps.broadcast({
          type: "marketplace.uninstalled",
          payload: { itemId: item.id, ...receiptFields(receipt) },
        });
        res.json({ success, itemId: item.id, recorded: receipt.recorded });
        return;
      }

      res.json({ success, itemId: item.id });
    },
  );
}

/**
 * #538: the scan route's body after its gate check. startRescan owns the
 * check and the `scanning` transition; this answers 404 for an unknown item
 * and 400 when startRescan refuses. `done` settles when the scan has.
 */
export function requestRescan(
  deps: MarketplaceRouteDeps,
  itemId: string,
): { status: number; body: Record<string, unknown>; done?: Promise<void> } {
  const item = deps.marketplaceCatalog.getItem(itemId);
  if (!item) return { status: 404, body: { error: "Item not found" } };
  const done = startRescan(deps, item);
  if (done === false) return { status: 400, body: { error: "Item is not installed or quarantined with a recorded install" } };
  return {
    status: 200,
    body: { status: "scanning", itemId: item.id, message: "Security scan started. Results will be broadcast via WebSocket." },
    done,
  };
}
