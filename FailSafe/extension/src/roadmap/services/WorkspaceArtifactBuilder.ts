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

import { MetaLedgerReader, type LedgerSummary } from "./MetaLedgerReader";
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
}

export class WorkspaceArtifactBuilder {
  constructor(private readonly workspaceRoot: string) {}

  build(): WorkspaceArtifactSnapshot {
    const ledger = new MetaLedgerReader(this.workspaceRoot);
    const { shieldPhase, latestVerdict } = this.readGovernanceState();
    const derivedShieldPhases = derivePlanPhaseStatuses(shieldPhase, latestVerdict);
    return {
      ledgerSummary: ledger.summarize(),
      ledgerVerdicts: ledger.recentVerdicts(10),
      ledgerCompletions: ledger.recentCompletions(12),
      activePlanFromFile: new PlanFileReader(this.workspaceRoot).pickLatestPlan(),
      planBlockers: new BacklogReader(this.workspaceRoot).parseOpenBlockers(),
      systemState: new SystemStateReader(this.workspaceRoot).read(),
      latestAudit: new AuditReportReader(this.workspaceRoot).read(),
      recentReleases: new ChangelogReader(this.workspaceRoot).recentReleases(5),
      qorLogicInstall: getQorLogicInstallStatus(this.workspaceRoot),
      shieldPhase,
      latestVerdict,
      derivedShieldPhases,
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
