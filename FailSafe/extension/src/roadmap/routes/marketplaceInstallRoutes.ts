// Marketplace install routes (B-INT-7 decomposition).
// install/:id (mint HITL nonce) · install/:id/confirm (validate nonce →
// async install + optional security scan + ledger). Shares the nonce store
// from marketplaceRouteShared.

import { Request, Response } from "express";
import { MARKETPLACE_INSTALLS_ENABLED } from "../services/MarketplaceInstaller";
import type { HITLRequest, MarketplaceItem, ScanStatus, SecurityScanResult } from "../services/MarketplaceTypes";
import {
  type MarketplaceRouteDeps,
  pendingApprovals,
  generateNonce,
} from "./marketplaceRouteShared";
import { type ReceiptItem, type ReceiptResult, receiptFields, recordInstallReceipt } from "./marketplaceInstallReceipt";

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

/** A scan that could not run is an L3 review verdict naming the cause (#469); a throw is a scanner-error (#538). */
export function inconclusiveVerdict(cause: string, scanStatus: ScanStatus = "inconclusive"): SecurityScanResult {
  return {
    passed: false,
    scanner: "none",
    scanStatus,
    timestamp: new Date().toISOString(),
    findings: [{ severity: "info", category: "scanner", description: `Security scan did not complete: ${cause}` }],
    riskGrade: "L3",
    recommendedAction: "review",
  };
}

/** Run the scan; a missing path is inconclusive and a throw is a scanner-error. */
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
    return inconclusiveVerdict(err instanceof Error ? err.message : String(err), "scanner-error");
  }
}

/** Reflect a re-scan verdict into the catalog and the Console (quarantined unless PASS). */
function applyVerdict(deps: MarketplaceRouteDeps, item: { id: string }, scanResult: SecurityScanResult): void {
  deps.marketplaceCatalog.updateItemStatus(item.id, {
    status: scanResult.passed ? "installed" : "quarantined",
    securityScan: scanResult,
    trustTier: scanResult.passed ? "scanned" : "quarantined",
  });
  deps.broadcast({ type: "marketplace.scanned", payload: { itemId: item.id, result: scanResult } });
}

/**
 * #469/#538: terminal-state handler for an install promise. Nothing reads as
 * installed (status or broadcast) until the receipt is durably written; an
 * install whose receipt failed is failed with no installPath, and a scan that
 * did not pass is quarantined either way. An item with no receipt keeps no
 * installPath, so it cannot be re-scanned (rescanAllowed).
 */
export async function handleInstallCompletion(
  deps: MarketplaceRouteDeps,
  item: ReceiptItem,
  result: { success: boolean; installPath?: string; error?: string },
  opts: InstallOpts,
): Promise<void> {
  if (!result.success) {
    deps.marketplaceCatalog.updateItemStatus(item.id, { status: "failed" });
    deps.broadcast({ type: "marketplace.failed", payload: { itemId: item.id, error: result.error } });
    return;
  }
  deps.marketplaceCatalog.updateItemStatus(item.id, {
    status: opts.runSecurityScan ? "scanning" : "installing",
    installPath: result.installPath,
    sandboxEnabled: opts.sandboxEnabled,
  });
  const verdict = opts.runSecurityScan ? await scanOrInconclusive(deps, item, result.installPath) : null;
  const outcome = verdict && !verdict.passed ? "quarantined" : "installed";
  const receipt = await recordInstallReceipt(deps.ledgerManager, item, result.installPath, opts, outcome, verdict);
  if (verdict && outcome === "quarantined") {
    quarantine(deps, item, verdict, receipt);
  } else if (!receipt.recorded) {
    unrecorded(deps, item, receipt.reason);
  } else {
    deps.marketplaceCatalog.updateItemStatus(item.id, {
      status: "installed",
      installedAt: new Date().toISOString(),
      trustTier: verdict ? "scanned" : "unverified",
      ...(verdict ? { securityScan: verdict } : {}),
    });
    if (verdict) deps.broadcast({ type: "marketplace.scanned", payload: { itemId: item.id, result: verdict } });
    deps.broadcast({ type: "marketplace.installed", payload: { itemId: item.id, installPath: result.installPath, ledgerEntryId: receipt.entryId } });
  }
}

/** A scan that did not pass: quarantined, with the receipt's fate named. */
function quarantine(deps: MarketplaceRouteDeps, item: { id: string }, verdict: SecurityScanResult, receipt: ReceiptResult): void {
  deps.marketplaceCatalog.updateItemStatus(item.id, {
    status: "quarantined",
    securityScan: verdict,
    trustTier: "quarantined",
    ...(receipt.recorded ? {} : { installPath: undefined }),
  });
  deps.broadcast({ type: "marketplace.scanned", payload: { itemId: item.id, result: verdict } });
  deps.broadcast({
    type: "marketplace.quarantined",
    payload: {
      itemId: item.id,
      scanStatus: verdict.scanStatus,
      riskGrade: verdict.riskGrade,
      recommendedAction: verdict.recommendedAction,
      findingCount: verdict.findings.length,
      ...receiptFields(receipt),
    },
  });
}

/** An install whose receipt could not be written is never reported installed. */
function unrecorded(deps: MarketplaceRouteDeps, item: { id: string }, reason: string): void {
  deps.marketplaceCatalog.updateItemStatus(item.id, { status: "failed", trustTier: "quarantined", installPath: undefined });
  deps.broadcast({
    type: "marketplace.failed",
    payload: {
      itemId: item.id,
      reason: "ledger-unrecorded",
      error: `The install was not recorded in the FailSafe ledger (${reason}), so it is not reported installed.`,
    },
  });
}

/** #538: only an installed or quarantined item that has a receipt (and so an installPath) may be re-scanned. */
export function rescanAllowed(item: { status?: string; installPath?: string }): boolean {
  return (item.status === "installed" || item.status === "quarantined") && !!item.installPath;
}

/**
 * #469/#538: re-scan an item. Owns the check and the transition: refused
 * (false, no status write) unless rescanAllowed; otherwise `scanning` is set
 * before any await and the returned promise settles the terminal state. A
 * rejected scan is failed with no installPath. Called by requestRescan after
 * the route's gate check.
 */
export function startRescan(deps: MarketplaceRouteDeps, item: { id: string; status?: string; installPath?: string }): false | Promise<void> {
  if (!rescanAllowed(item)) return false;
  deps.marketplaceCatalog.updateItemStatus(item.id, { status: "scanning" });
  return rescan(deps, item);
}

async function rescan(deps: MarketplaceRouteDeps, item: { id: string; installPath?: string }): Promise<void> {
  try {
    applyVerdict(deps, item, await scanOrInconclusive(deps, item, item.installPath));
  } catch (err) {
    try {
      deps.marketplaceCatalog.updateItemStatus(item.id, { status: "failed", installPath: undefined });
    } catch {
      // The failure below is still reported.
    }
    deps.broadcast({ type: "marketplace.failed", payload: { itemId: item.id, error: err instanceof Error ? err.message : String(err) } });
  }
}
