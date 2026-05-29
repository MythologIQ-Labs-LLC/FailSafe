// Marketplace route shared core (B-INT-7 decomposition of MarketplaceRoute.ts).
// Deps contract + the in-memory HITL nonce store shared between the install
// request route (mints a nonce) and the confirm route (validates + consumes).

import { Request, Response } from "express";
import * as crypto from "crypto";
import type { MarketplaceCatalog } from "../services/MarketplaceCatalog";
import type { MarketplaceInstaller } from "../services/MarketplaceInstaller";
import type { SecurityScanner } from "../services/SecurityScanner";
import type { LedgerManager } from "../../qorelogic/ledger/LedgerManager";
import type { HITLRequest } from "../services/MarketplaceTypes";

export type MarketplaceRouteDeps = {
  rejectIfRemote: (req: Request, res: Response) => boolean;
  broadcast: (data: Record<string, unknown>) => void;
  marketplaceCatalog: MarketplaceCatalog;
  marketplaceInstaller: MarketplaceInstaller;
  securityScanner: SecurityScanner;
  ledgerManager?: LedgerManager;
};

// In-memory HITL nonce store (5 minute TTL). Module-level so the install +
// confirm routes (in marketplaceInstallRoutes.ts) share one store.
export const pendingApprovals = new Map<string, HITLRequest>();

export function generateNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function cleanExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, request] of pendingApprovals) {
    if (new Date(request.expiresAt).getTime() < now) {
      pendingApprovals.delete(nonce);
    }
  }
}
