import { IntentService } from './IntentService';
import { LedgerManager } from '../qorelogic/ledger/LedgerManager';
import { summarizeLedgerIntegrity } from '../qorelogic/ledger/LedgerIntegritySummary';

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
    // A failed intent read is NOT evidence that no unsealed intents exist.
    // Return a normal BLOCK result so release callers never mistake an
    // exception for a skipped preflight check (#473).
    let active: Awaited<ReturnType<IntentService['getActiveIntent']>>;
    try {
      active = await this.intentService.getActiveIntent();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        name: 'unsealed-intents',
        passed: false,
        reason: `Unable to verify active intent: ${detail}.`,
      };
    }
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
   * #473: share the compliance export's strict report normalization. A contradictory
   * ok:true report with failures, malformed fields, or unavailable storage cannot pass.
   * The existing PARTIAL SEAL policy remains a visible, warn-only release condition.
   */
  private async checkLedgerChainIntegrity(): Promise<{ check: ReleaseGateCheck; partial: boolean }> {
    const integrity = await summarizeLedgerIntegrity(this.ledger);
    return {
      check: {
        name: 'ledger-chain',
        passed: integrity.status === 'intact' || integrity.status === 'partial-seal',
        reason: integrity.reason,
      },
      partial: integrity.status === 'partial-seal',
    };
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
