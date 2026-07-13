/**
 * WorkspaceArtifactBuilder — assembles the workspace-truth artifact snapshot
 * consumed by `ConsoleServer.buildHubSnapshot`. Extracted from
 * `ConsoleServer.assembleWorkspaceArtifactSnapshot` per audit Entry #277/#278
 * Amendment 1: keeps workspace-artifact reads + SHIELD-phase derivation in a
 * single dedicated module so `ConsoleServer.ts` can move toward the Section 4
 * Razor cap.
 *
 * Each reader is a pure function over a markdown / yaml file; failures degrade
 * to nulls / empty arrays. The builder also derives the per-step SHIELD
 * lifecycle status (via PlanPhaseStatusDeriver) so the Monitor can render the
 * 4-step Phase track without reaching into the in-memory PlanManager.
 */

import * as fs from "fs";
import * as path from "path";

import { MetaLedgerReader, summarizeEntries, type LedgerSummary } from "./MetaLedgerReader";
import { readMetaLedgerArtifact } from "../../qorlogic/consumer/consumer-adapter";
import { buildConsumerDiagnostics } from "../../qorlogic/consumer/diagnostics";
import type { ConsumerDiagnostics } from "../../qorlogic/consumer/types";
import { PlanFileReader, type ParsedPlan } from "./PlanFileReader";
import { SystemStateReader, type SystemStateSnapshot } from "./SystemStateReader";
import { BacklogReader, type PlanBlockerProjection } from "./BacklogReader";
import { AuditReportReader, type AuditSnapshot } from "./AuditReportReader";
import { ChangelogReader, type ReleaseEntry } from "./ChangelogReader";
import {
  parseMetaLedger,
  getCurrentPhase,
  type ShieldPhase,
} from "./GovernancePhaseTracker";
import {
  derivePlanPhaseStatuses,
  type ShieldPhaseStatus,
} from "./PlanPhaseStatusDeriver";
import {
  getQorLogicInstallStatus,
  type QorLogicInstallStatus,
  type QorLogicVersionStatus,
} from "../../qorlogic/qorLogicInstallRecord";

export interface WorkspaceArtifactSnapshot {
  ledgerSummary: LedgerSummary;
  ledgerVerdicts: ReturnType<MetaLedgerReader["recentVerdicts"]>;
  ledgerCompletions: ReturnType<MetaLedgerReader["recentCompletions"]>;
  activePlanFromFile: ParsedPlan | null;
  planBlockers: PlanBlockerProjection[];
  systemState: SystemStateSnapshot;
  latestAudit: AuditSnapshot | null;
  recentReleases: ReleaseEntry[];
  qorLogicInstall: QorLogicInstallStatus;
  shieldPhase: ShieldPhase;
  latestVerdict: string | undefined;
  derivedShieldPhases: ShieldPhaseStatus[];
  /** #233 consumer-adapter diagnostics: per-artifact state + compatibility. */
  qorConsumer: ConsumerDiagnostics;
}

export class WorkspaceArtifactBuilder {
  /**
   * @param qorLogicVersionStatus B197 surfacing: resolved `verifyInstalledVersion()`
   *   result, threaded in by HubSnapshotService (which already runs in async context).
   *   When omitted, qorLogicInstall ships without version-floor fields and the UI
   *   gracefully omits the warning (legacy/test back-compat).
   */
  constructor(
    private readonly workspaceRoot: string,
    private readonly qorLogicVersionStatus?: QorLogicVersionStatus,
  ) {}

  build(): WorkspaceArtifactSnapshot {
    // #233: the MetaLedgerReader/summarize path is gated by the consumer
    // adapter so a MALFORMED ledger degrades to an EXPLICIT empty summary
    // (fail-visible via the qorConsumer block) instead of an
    // indistinguishable silent empty; `unavailable` matches the previous
    // missing-file posture. Version-floor incompatibility is surfaced in the
    // diagnostics block rather than by suppressing ledger rendering, so
    // below-floor installs keep today's hub behavior (B197 warning UX).
    const ledgerEnvelope = readMetaLedgerArtifact(this.workspaceRoot);
    const ledgerReadable = ledgerEnvelope.state === "ok" || ledgerEnvelope.state === "stale";
    const ledger = new MetaLedgerReader(this.workspaceRoot);
    const { shieldPhase, latestVerdict } = this.readGovernanceState();
    const derivedShieldPhases = derivePlanPhaseStatuses(shieldPhase, latestVerdict);
    return {
      ledgerSummary: ledgerReadable ? ledger.summarize() : summarizeEntries([]),
      ledgerVerdicts: ledgerReadable ? ledger.recentVerdicts(10) : [],
      ledgerCompletions: ledgerReadable ? ledger.recentCompletions(12) : [],
      activePlanFromFile: new PlanFileReader(this.workspaceRoot).pickLatestPlan(),
      planBlockers: new BacklogReader(this.workspaceRoot).parseOpenBlockers(),
      systemState: new SystemStateReader(this.workspaceRoot).read(),
      latestAudit: new AuditReportReader(this.workspaceRoot).read(),
      recentReleases: new ChangelogReader(this.workspaceRoot).recentReleases(5),
      qorLogicInstall: getQorLogicInstallStatus(this.workspaceRoot, this.qorLogicVersionStatus),
      shieldPhase,
      latestVerdict,
      derivedShieldPhases,
      qorConsumer: buildConsumerDiagnostics(this.workspaceRoot, {
        versionStatus: this.qorLogicVersionStatus,
      }),
    };
  }

  private readGovernanceState(): { shieldPhase: ShieldPhase; latestVerdict: string | undefined } {
    const ledgerPath = path.join(this.workspaceRoot, "docs", "META_LEDGER.md");
    if (!fs.existsSync(ledgerPath)) {
      return { shieldPhase: "IDLE", latestVerdict: undefined };
    }
    try {
      const content = fs.readFileSync(ledgerPath, "utf8");
      const entries = parseMetaLedger(content);
      return {
        shieldPhase: getCurrentPhase(entries),
        latestVerdict: entries[0]?.verdict,
      };
    } catch {
      return { shieldPhase: "IDLE", latestVerdict: undefined };
    }
  }
}
