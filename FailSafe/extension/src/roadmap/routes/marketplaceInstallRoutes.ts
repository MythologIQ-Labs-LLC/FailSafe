// Marketplace install routes (B-INT-7 decomposition).
// install/:id (mint HITL nonce) · install/:id/confirm (validate nonce →
// async install + optional security scan + ledger). Shares the nonce store
// from marketplaceRouteShared.

import { Request, Response } from "express";
import { MARKETPLACE_INSTALLS_ENABLED } from "../services/MarketplaceInstaller";
import type { HITLRequest, MarketplaceItem, SecurityScanResult } from "../services/MarketplaceTypes";
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
    if (!MARKETPLACE_INSTALLS_ENABLED) { res.status(503).json({ error: "Marketplace installation temporarily disabled pending security remediation" }); return; }

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
      if (!MARKETPLACE_INSTALLS_ENABLED) { res.status(503).json({ error: "Marketplace installation temporarily disabled pending security remediation" }); return; }

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
      void startInstall(deps, item, { sandboxEnabled, runSecurityScan });

      res.json({
        status: "installing",
        itemId: item.id,
        message: "Installation started. Progress will be broadcast via WebSocket.",
      });
    },
  );
}

interface InstallOpts { sandboxEnabled: boolean; runSecurityScan: boolean; }

/**
 * #469: install, then the completion handler; a rejected install is a failed
 * terminal state, never an item stuck installing. Called by the confirm route
 * after its gate check.
 */
export async function startInstall(
  deps: MarketplaceRouteDeps,
  item: MarketplaceItem,
  opts: InstallOpts,
): Promise<void> {
  try {
    const result = await deps.marketplaceInstaller.install(item, opts, (progress) => {
      deps.broadcast({ type: "marketplace.progress", payload: { itemId: item.id, ...progress } });
    });
    await handleInstallCompletion(deps, item, result, opts);
  } catch (err) {
    deps.marketplaceCatalog.updateItemStatus(item.id, { status: "failed" });
    deps.broadcast({ type: "marketplace.failed", payload: { itemId: item.id, error: err instanceof Error ? err.message : String(err) } });
  }
}

/** A scan that could not run is an inconclusive L3 verdict naming the cause (#469). */
export function inconclusiveVerdict(cause: string): SecurityScanResult {
  return {
    passed: false,
    scanner: "none",
    timestamp: new Date().toISOString(),
    findings: [{ severity: "info", category: "scanner", description: `Security scan did not complete: ${cause}` }],
    riskGrade: "L3",
    recommendedAction: "review",
  };
}

/** Run the scan; a missing path or a throw becomes an inconclusive verdict. */
async function scanOrInconclusive(
  deps: MarketplaceRouteDeps,
  item: { id: string },
  installPath: string | undefined,
): Promise<SecurityScanResult> {
  if (!installPath) return inconclusiveVerdict("the install path is missing");
  deps.broadcast({ type: "marketplace.scanning", payload: { itemId: item.id } });
  try {
    return await deps.securityScanner.runFullScan(installPath, (msg) => {
      deps.broadcast({ type: "marketplace.scan.progress", payload: { itemId: item.id, message: msg } });
    });
  } catch (err) {
    return inconclusiveVerdict(err instanceof Error ? err.message : String(err));
  }
}

/** Reflect a verdict into the catalog and the Console (quarantined unless PASS). */
function applyVerdict(deps: MarketplaceRouteDeps, item: { id: string }, scanResult: SecurityScanResult): void {
  deps.marketplaceCatalog.updateItemStatus(item.id, {
    status: scanResult.passed ? "installed" : "quarantined",
    securityScan: scanResult,
    trustTier: scanResult.passed ? "scanned" : "quarantined",
  });
  deps.broadcast({ type: "marketplace.scanned", payload: { itemId: item.id, result: scanResult } });
}

/**
 * #469: terminal-state handler for an install promise. marketplace.installed
 * and a success ledger entry happen only for an install that completed and,
 * when a scan was asked for, passed it; anything else is quarantined.
 */
export async function handleInstallCompletion(
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
    ...(opts.runSecurityScan ? {} : { trustTier: "unverified" as const }),
  });
  if (opts.runSecurityScan) {
    const verdict = await scanOrInconclusive(deps, item, result.installPath);
    applyVerdict(deps, item, verdict);
    if (!verdict.passed) {
      recordInstallLedger(deps, item, result.installPath, opts, "quarantined");
      return;
    }
  }
  recordInstallLedger(deps, item, result.installPath, opts, "installed");
  deps.broadcast({ type: "marketplace.installed", payload: { itemId: item.id, installPath: result.installPath } });
}

/** #469: re-scan an installed item; a rejected scan quarantines it. Called by the scan route after its gate check. */
export async function startRescan(deps: MarketplaceRouteDeps, item: { id: string; installPath?: string }): Promise<void> {
  try {
    applyVerdict(deps, item, await scanOrInconclusive(deps, item, item.installPath));
  } catch (err) {
    deps.broadcast({ type: "marketplace.failed", payload: { itemId: item.id, error: err instanceof Error ? err.message : String(err) } });
  }
}

/** Anchor a marketplace install outcome into the ledger (non-blocking). */
function recordInstallLedger(
  deps: MarketplaceRouteDeps,
  item: { id: string; name: string },
  installPath: string | undefined,
  opts: InstallOpts,
  outcome: "installed" | "quarantined",
): void {
  if (!deps.ledgerManager) return;
  deps.ledgerManager.appendEntry({
    eventType: "MARKETPLACE_INSTALL",
    agentDid: "did:failsafe:marketplace",
    payload: {
      itemId: item.id,
      itemName: item.name,
      success: outcome === "installed",
      outcome,
      scanned: opts.runSecurityScan,
      installPath,
      sandboxEnabled: opts.sandboxEnabled,
      securityScanEnabled: opts.runSecurityScan,
    },
  });
}
