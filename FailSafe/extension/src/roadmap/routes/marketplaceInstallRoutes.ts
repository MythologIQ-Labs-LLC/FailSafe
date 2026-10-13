// Marketplace install routes (B-INT-7 decomposition).
// install/:id (mint HITL nonce) · install/:id/confirm (validate nonce →
// async install + optional security scan + ledger). Shares the nonce store
// from marketplaceRouteShared.

import { Request, Response } from "express";
import type { HITLRequest } from "../services/MarketplaceTypes";
import {
  type MarketplaceRouteDeps,
  pendingApprovals,
  generateNonce,
} from "./marketplaceRouteShared";

export function registerMarketplaceInstallRoutes(
  app: import("express").Application,
  deps: MarketplaceRouteDeps,
): void {
  // POST /api/marketplace/install/:id - Request install (returns HITL nonce)
  app.post("/api/marketplace/install/:id", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;

    const itemId = String(req.params.id);
    const item = deps.marketplaceCatalog.getItem(itemId);
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    if (item.status === "installing" || item.status === "scanning") {
      res.status(409).json({ error: "Installation already in progress" });
      return;
    }

    // Generate HITL nonce for approval
    const nonce = generateNonce();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const hitlRequest: HITLRequest = {
      nonce,
      action: "marketplace.install",
      itemId: item.id,
      itemName: item.name,
      expiresAt,
    };

    pendingApprovals.set(nonce, hitlRequest);

    res.json({
      status: "pending_approval",
      nonce,
      expiresAt,
      item: {
        id: item.id,
        name: item.name,
        author: item.author,
        repoUrl: item.repoUrl,
        requiredPermissions: item.requiredPermissions,
        licenseType: item.licenseType,
      },
      message: `Installation of ${item.name} requires confirmation. Use the nonce to confirm.`,
    });
  });

  // POST /api/marketplace/install/:id/confirm - Confirm installation with nonce
  app.post(
    "/api/marketplace/install/:id/confirm",
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;

      const itemId = String(req.params.id);
      const { nonce, sandboxEnabled = true, runSecurityScan = true } = req.body;

      // Validate nonce
      const hitlRequest = pendingApprovals.get(nonce);
      if (!hitlRequest) {
        res.status(403).json({ error: "Invalid or expired approval nonce" });
        return;
      }

      if (hitlRequest.itemId !== itemId) {
        res.status(403).json({ error: "Nonce does not match item" });
        return;
      }

      if (new Date(hitlRequest.expiresAt).getTime() < Date.now()) {
        pendingApprovals.delete(nonce);
        res.status(403).json({ error: "Approval nonce has expired" });
        return;
      }

      // Consume nonce (one-time use)
      pendingApprovals.delete(nonce);

      const item = deps.marketplaceCatalog.getItem(itemId);
      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      // Update status to installing
      deps.marketplaceCatalog.updateItemStatus(item.id, {
        status: "installing",
      });

      deps.broadcast({
        type: "marketplace.installing",
        payload: { itemId: item.id },
      });

      // Start async installation; completion is handled off the response path
      // (progress + terminal state broadcast over WebSocket). B-INT-7 follow-up:
      // the completion logic is decomposed into named helpers below to keep this
      // handler + each helper under the Section-4 40-line function razor.
      void deps.marketplaceInstaller
        .install(item, { sandboxEnabled, runSecurityScan }, (progress) => {
          deps.broadcast({ type: "marketplace.progress", payload: { itemId: item.id, ...progress } });
        })
        .then((result) => handleInstallCompletion(deps, item, result, { sandboxEnabled, runSecurityScan }))
        .catch((err: unknown) => {
          deps.marketplaceCatalog.updateItemStatus(item.id, { status: "failed" });
          deps.broadcast({
            type: "marketplace.failed",
            payload: { itemId: item.id, error: err instanceof Error ? err.message : String(err) },
          });
        });

      res.json({
        status: "installing",
        itemId: item.id,
        message: "Installation started. Progress will be broadcast via WebSocket.",
      });
    },
  );
}

interface InstallOpts { sandboxEnabled: boolean; runSecurityScan: boolean; }

/** B-INT-7 follow-up: terminal-state handler for an install promise. */
async function handleInstallCompletion(
  deps: MarketplaceRouteDeps,
  item: { id: string; name: string },
  result: { success: boolean; installPath?: string; error?: string },
  opts: InstallOpts,
): Promise<void> {
  if (!result.success) {
    deps.marketplaceCatalog.updateItemStatus(item.id, { status: "failed" });
    deps.broadcast({ type: "marketplace.failed", payload: { itemId: item.id, error: result.error } });
    return;
  }
  deps.marketplaceCatalog.updateItemStatus(item.id, {
    status: opts.runSecurityScan ? "scanning" : "installed",
    installPath: result.installPath,
    installedAt: new Date().toISOString(),
    sandboxEnabled: opts.sandboxEnabled,
  });
  if (opts.runSecurityScan) {
    if (!result.installPath) {
      deps.marketplaceCatalog.updateItemStatus(item.id, { status: "quarantined" });
      deps.broadcast({ type: "marketplace.quarantined", payload: { itemId: item.id, error: "Missing install path for required security scan" } });
      recordInstallLedger(deps, item, result.installPath, opts, false);
      return;
    }
    let passed = false;
    try {
      passed = await runPostInstallScan(deps, item, result.installPath);
    } catch (err) {
      deps.marketplaceCatalog.updateItemStatus(item.id, { status: "quarantined" });
      deps.broadcast({ type: "marketplace.scan.failed", payload: {
        itemId: item.id, error: err instanceof Error ? err.message : String(err),
      } });
    }
    if (!passed) {
      recordInstallLedger(deps, item, result.installPath, opts, false);
      deps.broadcast({ type: "marketplace.quarantined", payload: { itemId: item.id, installPath: result.installPath } });
      return;
    }
  }
  recordInstallLedger(deps, item, result.installPath, opts, true);
  deps.broadcast({ type: "marketplace.installed", payload: { itemId: item.id, installPath: result.installPath } });
}

/** Run the post-install security scan + reflect its verdict into catalog status. */
async function runPostInstallScan(
  deps: MarketplaceRouteDeps,
  item: { id: string },
  installPath: string,
 ): Promise<boolean> {
  deps.broadcast({ type: "marketplace.scanning", payload: { itemId: item.id } });
  const scanResult = await deps.securityScanner.runFullScan(installPath, (msg) => {
    deps.broadcast({ type: "marketplace.scan.progress", payload: { itemId: item.id, message: msg } });
  });
  deps.marketplaceCatalog.updateItemStatus(item.id, {
    status: scanResult.passed ? "installed" : "quarantined",
    securityScan: scanResult,
    trustTier: scanResult.passed ? "scanned" : "quarantined",
  });
  deps.broadcast({ type: "marketplace.scanned", payload: { itemId: item.id, result: scanResult } });
  return scanResult.passed;
}

/** Anchor a successful marketplace install into the ledger (non-blocking). */
function recordInstallLedger(
  deps: MarketplaceRouteDeps,
  item: { id: string; name: string },
  installPath: string | undefined,
  opts: InstallOpts,
  success: boolean,
): void {
  if (!deps.ledgerManager) return;
  deps.ledgerManager.appendEntry({
    eventType: "MARKETPLACE_INSTALL",
    agentDid: "did:failsafe:marketplace",
    payload: {
      itemId: item.id,
      itemName: item.name,
      success,
      installPath,
      sandboxEnabled: opts.sandboxEnabled,
      securityScanEnabled: opts.runSecurityScan,
    },
  });
}
