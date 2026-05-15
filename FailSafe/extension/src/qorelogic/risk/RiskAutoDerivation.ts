/**
 * RiskAutoDerivation — auto-derive Risk Register entries from SHIELD lifecycle.
 *
 * Three derivers (all pure functions of their inputs + a RiskManager):
 *   - deriveFromVeto(ledgerEntry, gateArtifact, manager)
 *   - deriveFromDebug(ledgerEntry, manager)
 *   - deriveFromShadowGenomePattern(event, manager)
 *
 * De-dup is handled by RiskManager.createRisk's derivedFrom-key lookup.
 *
 * Per plan-qor-model-sourced-risks Phase 3.
 */

import type { LedgerEntry } from "../../roadmap/services/GovernancePhaseTracker";
import type { AuditGateArtifact } from "./AuditGateArtifactReader";
import type { RiskCategory, RiskSeverity } from "./types";
import { RiskManager } from "./RiskManager";

/** Shape emitted by ShadowGenomeManager on the EventBus channel
 *  'genome.failureArchived'. Verified at qorelogic/shadow/ShadowGenomeManager.ts:250. */
export interface GenomeFailureArchivedEvent {
  failureMode?: string;
  agentDid?: string;
  entryId: string;
}

/** Map VETO findings_categories to a Risk severity. */
export function mapVetoSeverity(categories: string[] | undefined): RiskSeverity {
  const cats = categories ?? [];
  if (cats.includes("security-l3")) return "critical";
  if (cats.includes("owasp-violation") || cats.includes("ghost-ui")) return "high";
  return "medium";
}

/** Map VETO findings_categories to a Risk category. */
export function mapVetoCategory(categories: string[] | undefined): RiskCategory {
  const cats = categories ?? [];
  if (cats.includes("security-l3") || cats.includes("owasp-violation")) return "security";
  if (cats.includes("prompt-injection")) return "security";
  if (cats.includes("dependency-unjustified")) return "dependency";
  if (cats.includes("razor-overage") || cats.includes("specification-drift")) return "technical-debt";
  return "governance";
}

/** Compose a risk title from VETO categories + ledger entry. */
function vetoTitle(ledgerEntry: number, categories: string[] | undefined): string {
  const cats = (categories ?? []).slice(0, 3).join(", ") || "unspecified";
  return `Audit VETO (Entry #${ledgerEntry}): ${cats}`;
}

export function deriveFromVeto(
  ledgerEntry: LedgerEntry,
  gateArtifact: AuditGateArtifact | null,
  riskManager: RiskManager,
): void {
  if (ledgerEntry.phase !== "GATE") return;
  if (!ledgerEntry.verdict?.toUpperCase().includes("VETO")) return;
  const categories = gateArtifact?.findings_categories;
  riskManager.createRisk({
    title: vetoTitle(ledgerEntry.entry, categories),
    description: `Auto-derived from META_LEDGER Entry #${ledgerEntry.entry}. ` +
      `Findings: ${(categories ?? ["(no gate artifact available)"]).join(", ")}.`,
    severity: mapVetoSeverity(categories),
    category: mapVetoCategory(categories),
    impact: "Audit gate failed; downstream phases blocked until findings are remediated.",
    mitigation: "Amend the plan per audit findings, re-run /qor-audit.",
    source: "audit-veto",
    derivedFrom: { ledgerEntry: ledgerEntry.entry, planSlug: ledgerEntry.plan },
  });
}

export function deriveFromDebug(
  ledgerEntry: LedgerEntry,
  riskManager: RiskManager,
): void {
  if (!ledgerEntry.phase) return;
  if (!String(ledgerEntry.phase).toUpperCase().includes("DEBUG")) return;
  riskManager.createRisk({
    title: `Debug session opened (Entry #${ledgerEntry.entry})`,
    description: `Auto-derived from META_LEDGER Entry #${ledgerEntry.entry} ` +
      `(${ledgerEntry.plan ?? "no plan"}).`,
    severity: "high",
    category: "technical-debt",
    impact: "An open defect requires diagnosis before further implementation.",
    mitigation: "Complete /qor-debug; record root cause; close the entry.",
    source: "debug",
    derivedFrom: { ledgerEntry: ledgerEntry.entry, planSlug: ledgerEntry.plan },
  });
}

export function deriveFromShadowGenomePattern(
  event: GenomeFailureArchivedEvent,
  riskManager: RiskManager,
): void {
  if (!event?.entryId) return;
  riskManager.createRisk({
    title: `Shadow Genome failure archived: ${event.failureMode ?? "unspecified"}`,
    description: `Auto-derived from EventBus 'genome.failureArchived' ` +
      `(entryId=${event.entryId}, agentDid=${event.agentDid ?? "unknown"}).`,
    severity: "high",
    category: "governance",
    impact: "Process failure recorded; risk of repeat without remediation.",
    mitigation: "Inspect the Shadow Genome entry; address the failure mode.",
    source: "shadow-genome",
    derivedFrom: { shadowGenomeEventId: event.entryId },
  });
}

/** Walk a list of recent ledger entries through the appropriate deriver.
 *  Called from HubSnapshotService per hub-refresh cycle. */
export function runAutoDerivation(
  entries: LedgerEntry[],
  artifactReader: { read: (sid: string) => AuditGateArtifact | null },
  riskManager: RiskManager,
): void {
  for (const entry of entries) {
    if (entry.phase === "GATE") {
      // Best-effort: try to read the gate artifact. The plan parser
      // currently doesn't capture a session id from the ledger Markdown,
      // so this read returns null until the parser is extended; the
      // deriver handles null gracefully (severity falls back to medium).
      const sid = inferSessionIdFromPlanSlug(entry.plan);
      const artifact = sid ? artifactReader.read(sid) : null;
      deriveFromVeto(entry, artifact, riskManager);
    } else {
      deriveFromDebug(entry, riskManager);
    }
  }
}

/** Best-effort session-id heuristic from a plan slug. Returns null when
 *  the slug isn't structured for sid recovery (most current cases). */
function inferSessionIdFromPlanSlug(_planSlug: string | undefined): string | null {
  // Current ledger entries don't carry a session id in the parsed shape.
  // Returning null causes deriveFromVeto to use the medium-default severity
  // fallback, per F3 graceful-on-missing contract.
  return null;
}
