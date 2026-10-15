import { IntentService } from './IntentService';
import { LedgerManager } from '../qorelogic/ledger/LedgerManager';
import type { LedgerVerification } from '../qorelogic/ledger/LedgerVerifier';

export interface ReleaseGateCheck {
  name: string;
  passed: boolean;
  reason: string;
}

export interface ReleaseGateResult {
  allowed: boolean;
  failures: ReleaseGateCheck[];
  /** Checks that passed with a weaker guarantee than their name suggests (#473). */
  warnings: ReleaseGateCheck[];
}

export class ReleasePipelineGate {
  constructor(
    private readonly intentService: IntentService,
    private ledger: LedgerManager,
  ) {}

  setLedgerManager(ledger: LedgerManager): void {
    this.ledger = ledger;
  }

  async evaluate(version: string): Promise<ReleaseGateResult> {
    const [intents, ledger, versionCheck] = await Promise.all([
      this.checkUnsealedIntents(),
      this.checkLedgerChainIntegrity(),
      this.checkVersionCoherence(version),
    ]);
    const checks = [intents, ledger.check, versionCheck];
    return {
      allowed: checks.every(c => c.passed),
      failures: checks.filter(c => !c.passed),
      warnings: ledger.partial ? [ledger.check] : [],
    };
  }

  private async checkUnsealedIntents(): Promise<ReleaseGateCheck> {
    const active = await this.intentService.getActiveIntent();
    if (active && active.status !== 'SEALED') {
      return {
        name: 'unsealed-intents',
        passed: false,
        reason: `Active Intent "${active.id}" is in ${active.status} status. Seal before release.`,
      };
    }
    return { name: 'unsealed-intents', passed: true, reason: 'No unsealed intents.' };
  }

  /**
   * #473 LD9: "intact" only for a fully v3-sealed, fully anchored,
   * workspace-bound ledger; every weaker property is named as a warning.
   */
  private async checkLedgerChainIntegrity(): Promise<{ check: ReleaseGateCheck; partial: boolean }> {
    const name = 'ledger-chain';
    if (!this.ledger || typeof this.ledger.verifyLedger !== 'function') {
      return { check: { name, passed: false, reason: 'Ledger not wired.' }, partial: false };
    }
    const report = await this.ledger.verifyLedger();
    if (!report.ok) {
      const first = report.failures[0];
      const where = first ? `${first.code}${first.id !== null ? ` at id ${first.id}` : ''}` : 'unknown';
      return {
        check: { name, passed: false, reason: `Ledger verification failed: ${report.failures.length} failure(s); first ${where}.` },
        partial: false,
      };
    }
    const weaker = weakerProperties(report);
    if (weaker.length === 0) {
      return {
        check: { name, passed: true, reason: `Ledger chain intact: all ${report.rows} rows sealed v3 (every column), anchored at id ${report.anchor.headId}.` },
        partial: false,
      };
    }
    return { check: { name, passed: true, reason: `PARTIAL SEAL: ${weaker.join('; ')}.` }, partial: true };
  }

  private async checkVersionCoherence(version: string): Promise<ReleaseGateCheck> {
    const semverRe = /^v?\d+\.\d+\.\d+$/;
    if (!semverRe.test(version)) {
      return {
        name: 'version-coherence',
        passed: false,
        reason: `Version "${version}" does not match semver pattern.`,
      };
    }
    return { name: 'version-coherence', passed: true, reason: 'Version format valid.' };
  }
}

function weakerProperties(report: LedgerVerification): string[] {
  const weaker: string[] = [];
  const { v1Rows, v2Rows, unfrozenLegacyRows } = report.coverage;
  if (v1Rows + v2Rows > 0) {
    weaker.push(`${v1Rows} v1 and ${v2Rows} v2 legacy row(s) authenticate only part of each row; their integrity before activation is INCONCLUSIVE`);
  }
  if (unfrozenLegacyRows > 0) {
    weaker.push(`${unfrozenLegacyRows} legacy row(s) are not covered by an activation receipt`);
  }
  if (report.anchor.status === 'unanchored') {
    weaker.push('anchor never established');
  } else if (report.anchor.status === 'established-late') {
    weaker.push(`anchor established late at id ${report.anchor.establishedAtId}; earlier rows are INCONCLUSIVE for truncation`);
  }
  if (report.anchor.unanchoredTail > 0) {
    weaker.push(`${report.anchor.unanchoredTail} row(s) not yet anchored`);
  }
  if (!report.anchor.workspaceBound) {
    weaker.push('ledger not bound to a workspace');
  }
  if (report.rotation && !report.rotation.retiredVerificationOk) {
    weaker.push(`ROTATED FROM FAILED LEDGER (${report.rotation.retiredFile})`);
  }
  return weaker;
}
