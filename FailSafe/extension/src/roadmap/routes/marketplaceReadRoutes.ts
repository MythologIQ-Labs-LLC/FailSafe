// Marketplace read-only routes (B-INT-7 decomposition).
// catalog · item/:id · scanners · featured · installed. No mutation, no HITL.

import { Request, Response } from "express";
import type { MarketplaceRouteDeps } from "./marketplaceRouteShared";

export function registerMarketplaceReadRoutes(
  app: import("express").Application,
  deps: MarketplaceRouteDeps,
): void {
  // GET /api/marketplace/catalog - Get all marketplace items
  app.get("/api/marketplace/catalog", async (_req: Request, res: Response) => {
    const catalog = deps.marketplaceCatalog.getCatalog();
    const scannerStatus = await deps.securityScanner.checkAvailability();
    deps.marketplaceCatalog.setScannerAvailability(scannerStatus);

    res.json({
      items: catalog,
      scanners: scannerStatus,
      globalCachePath: deps.marketplaceCatalog.getCachePath(),
    });
  });

  // GET /api/marketplace/item/:id - Get single item details
  app.get("/api/marketplace/item/:id", (req: Request, res: Response) => {
    const itemId = String(req.params.id);
    const item = deps.marketplaceCatalog.getItem(itemId);
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    res.json({ item });
  });

  // GET /api/marketplace/scanners - Check scanner availability
  app.get("/api/marketplace/scanners", async (_req: Request, res: Response) => {
    const status = await deps.securityScanner.checkAvailability();
    deps.marketplaceCatalog.setScannerAvailability(status);
    res.json(status);
  });

  // GET /api/marketplace/featured - Get featured items
  app.get("/api/marketplace/featured", (_req: Request, res: Response) => {
    res.json({ items: deps.marketplaceCatalog.getFeatured() });
  });

  // GET /api/marketplace/installed - Get installed items
  app.get("/api/marketplace/installed", (_req: Request, res: Response) => {
    res.json({ items: deps.marketplaceCatalog.getInstalled() });
  });
}
