// Marketplace install and uninstall receipts (#538 lane C, #469 residual).
// A receipt is the MARKETPLACE_INSTALL / MARKETPLACE_UNINSTALL ledger entry;
// it counts only once the ledger has durably written it. Nothing here throws:
// every failure is returned as { recorded: false, reason }.

import * as fs from "fs";
import * as path from "path";
import type { LedgerManager } from "../../qorelogic/ledger/LedgerManager";
import type { MarketplaceItem, SecurityScanResult } from "../services/MarketplaceTypes";

export const MARKETPLACE_AGENT_DID = "did:failsafe:marketplace";
const MAX_FINDINGS = 20;
const MAX_FINDING_TEXT = 300;
const MAX_REF_FILE = 4 * 1024;
const MAX_PACKED_REFS = 1024 * 1024;
const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HEAD_REF = /^refs\/heads\/[A-Za-z0-9._/-]+$/;

export type ReceiptResult = { recorded: true; entryId: number } | { recorded: false; reason: string };
export type InstallOutcome = "installed" | "quarantined";
export type ReceiptItem = Pick<MarketplaceItem, "id" | "name" | "repoUrl" | "repoRef" | "version">;
type AppendRequest = Parameters<LedgerManager["appendEntry"]>[0];

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Event fields naming whether a receipt was written. */
export function receiptFields(receipt: ReceiptResult): Record<string, unknown> {
  return receipt.recorded ? { recorded: true, ledgerEntryId: receipt.entryId } : { recorded: false, ledgerError: receipt.reason };
}

/**
 * Append and report whether the entry is durable: the ledger is wired, says it
 * is available, and returned a real entry (a disabled ledger returns a stub
 * instead of throwing).
 */
export async function durableAppend(ledger: LedgerManager | undefined, request: AppendRequest): Promise<ReceiptResult> {
  try {
    if (!ledger) return { recorded: false, reason: "no ledger is wired" };
    if (typeof ledger.isAvailable !== "function") return { recorded: false, reason: "the ledger does not report availability" };
    if (!ledger.isAvailable()) {
      const why = typeof ledger.getDisabledReason === "function" ? ledger.getDisabledReason() : undefined;
      return { recorded: false, reason: why ?? "the ledger is unavailable" };
    }
    const entry = await ledger.appendEntry(request);
    if (!entry || !Number.isInteger(entry.id) || entry.id <= 0 || entry.entryHash === "STUB_DISABLED") {
      return { recorded: false, reason: "the ledger returned no durable entry" };
    }
    return { recorded: true, entryId: entry.id };
  } catch (err) {
    return { recorded: false, reason: message(err) };
  }
}

/** A regular file of at most `max` bytes inside `base`, or null. */
function readSmallFile(base: string, file: string, max: number): string | null {
  const st = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!st || !st.isFile() || st.size > max) return null;
  const real = fs.realpathSync.native(file);
  if (!real.startsWith(base + path.sep)) return null;
  return fs.readFileSync(real, "utf8");
}

/**
 * The commit a fresh clone checked out, read from its .git without running
 * git: HEAD as an object name, or a refs/heads ref through its loose file or
 * packed-refs. Anything else is unresolved.
 */
export function readClonedCommit(installPath: string | undefined): { commit: string | null; commitSource: "clone-head" | "unresolved" } {
  const none = { commit: null, commitSource: "unresolved" as const };
  if (!installPath) return none;
  try {
    const gitDir = path.join(installPath, ".git");
    const st = fs.lstatSync(gitDir, { throwIfNoEntry: false });
    if (!st || !st.isDirectory()) return none;
    const base = fs.realpathSync.native(gitDir);
    const head = readSmallFile(base, path.join(gitDir, "HEAD"), MAX_REF_FILE)?.trim();
    if (!head) return none;
    if (OBJECT_NAME.test(head)) return { commit: head, commitSource: "clone-head" };
    const ref = /^ref: (\S+)$/.exec(head)?.[1];
    if (!ref || !HEAD_REF.test(ref) || ref.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return none;
    const loose = readSmallFile(base, path.join(gitDir, ...ref.split("/")), MAX_REF_FILE)?.trim();
    if (loose && OBJECT_NAME.test(loose)) return { commit: loose, commitSource: "clone-head" };
    const packed = readSmallFile(base, path.join(gitDir, "packed-refs"), MAX_PACKED_REFS);
    for (const line of packed ? packed.split(/\r?\n/) : []) {
      const [name, refName] = line.split(" ");
      if (refName === ref && OBJECT_NAME.test(name)) return { commit: name, commitSource: "clone-head" };
    }
    return none;
  } catch {
    return none;
  }
}

/** The receipt payload: outcome, bounded verdict, scanner identity and source. */
export function installReceiptPayload(
  item: ReceiptItem,
  installPath: string | undefined,
  opts: { sandboxEnabled: boolean; runSecurityScan: boolean },
  outcome: InstallOutcome,
  verdict: SecurityScanResult | null,
): Record<string, unknown> {
  const findings = verdict?.findings ?? [];
  return {
    itemId: item.id,
    itemName: item.name,
    success: outcome === "installed",
    outcome,
    scanned: opts.runSecurityScan,
    installPath,
    sandboxEnabled: opts.sandboxEnabled,
    securityScanEnabled: opts.runSecurityScan,
    verdict: verdict ? {
      passed: verdict.passed,
      scanStatus: verdict.scanStatus,
      riskGrade: verdict.riskGrade,
      recommendedAction: verdict.recommendedAction,
      timestamp: verdict.timestamp,
      findingCount: findings.length,
      findings: findings.slice(0, MAX_FINDINGS).map((f) => ({
        severity: f.severity,
        category: String(f.category).slice(0, MAX_FINDING_TEXT),
        description: String(f.description).slice(0, MAX_FINDING_TEXT),
      })),
      findingsTruncated: findings.length > MAX_FINDINGS,
    } : null,
    scanner: verdict ? { name: verdict.scanner, versions: verdict.scannerVersions ?? {} } : null,
    source: { repoUrl: item.repoUrl, repoRef: item.repoRef || "main", version: item.version, ...readClonedCommit(installPath) },
  };
}

/** Write the install receipt; never throws. */
export async function recordInstallReceipt(
  ledger: LedgerManager | undefined,
  item: ReceiptItem,
  installPath: string | undefined,
  opts: { sandboxEnabled: boolean; runSecurityScan: boolean },
  outcome: InstallOutcome,
  verdict: SecurityScanResult | null,
): Promise<ReceiptResult> {
  try {
    const payload = installReceiptPayload(item, installPath, opts, outcome, verdict);
    return await durableAppend(ledger, {
      eventType: "MARKETPLACE_INSTALL",
      agentDid: MARKETPLACE_AGENT_DID,
      ...(verdict ? { riskGrade: verdict.riskGrade } : {}),
      payload,
    });
  } catch (err) {
    return { recorded: false, reason: message(err) };
  }
}
