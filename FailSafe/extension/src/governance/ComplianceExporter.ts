import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LedgerManager } from '../qorelogic/ledger/LedgerManager';
import { ShadowGenomeManager } from '../qorelogic/shadow/ShadowGenomeManager';
import { PatternLoader } from '../sentinel/PatternLoader';

type ComplianceFramework = 'SOC2' | 'ISO27001' | 'EU_AI_ACT';

interface ControlMapping {
  framework: string;
  controls: Array<{ id: string; description: string; evidenceType: string }>;
}

// #244 Tranche D: this bundle carries free-form fields written by agents and
// operators (ledger entry `payload`, Shadow Genome `decisionRationale` /
// `environmentContext` / `causalVector` / `remediationNotes`, etc.) into a
// file meant to leave the workspace for a third-party SOC2/ISO27001/EU_AI_ACT
// auditor. Reuse the Sentinel secrets/PII heuristics (the same detector
// already used to redact MCP policy config, see mcp-policy-audit.ts) rather
// than inventing a second pattern set. Cryptographic chain fields are
// excluded from scanning so a redaction can never silently corrupt the
// exported hash chain an auditor needs to verify.
const CHAIN_INTEGRITY_KEYS = new Set(['entryHash', 'prevHash', 'signature']);
const REDACTED = '[REDACTED]';

function compileRedactionPatterns(): RegExp[] {
  const loader = new PatternLoader();
  return loader
    .getPatterns()
    .filter((p) => p.category === 'secrets' || p.category === 'pii')
    .map((p) => loader.compilePattern(p))
    .filter((r): r is RegExp => r !== null);
}

export class ComplianceExporter {
  private redactionPatterns: RegExp[] | null = null;

  constructor(
    private ledgerManager: LedgerManager,
    private shadowGenomeManager: ShadowGenomeManager,
  ) {}

  private getRedactionPatterns(): RegExp[] {
    if (!this.redactionPatterns) {
      this.redactionPatterns = compileRedactionPatterns();
    }
    return this.redactionPatterns;
  }

  /** Recursively redacts secret/PII-shaped substrings from free-text fields, preserving chain-integrity fields verbatim. */
  private redact(value: unknown, key?: string): unknown {
    if (typeof value === 'string') {
      if (key && CHAIN_INTEGRITY_KEYS.has(key)) {
        return value;
      }
      let redacted = value;
      for (const pattern of this.getRedactionPatterns()) {
        redacted = redacted.replace(pattern, REDACTED);
      }
      return redacted;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.redact(v, k);
      }
      return out;
    }
    return value;
  }

  setLedgerManager(ledger: LedgerManager): void {
    this.ledgerManager = ledger;
  }

  setShadowGenomeManager(shadow: ShadowGenomeManager): void {
    this.shadowGenomeManager = shadow;
  }

  async exportBundle(framework: ComplianceFramework, outputDir: string): Promise<string> {
    const bundle = {
      framework,
      exportedAt: new Date().toISOString(),
      ledger: this.redact(await this.ledgerManager.getRecentEntries(10000)),
      shadowGenome: this.redact(await this.shadowGenomeManager.analyzeFailurePatterns()),
      unresolvedFailures: this.redact(await this.shadowGenomeManager.getUnresolvedEntries()),
      chainVerification: this.ledgerManager.verifyChain(),
      controlMapping: this.mapToFramework(framework),
    };

    const json = JSON.stringify(bundle, null, 2);
    const hash = crypto.createHash('sha256').update(json).digest('hex');
    const filename = `compliance-${framework}-${hash.slice(0, 12)}.json.gz`;
    const outputPath = path.join(outputDir, filename);

    const compressed = zlib.gzipSync(Buffer.from(json));
    fs.writeFileSync(outputPath, compressed);

    return outputPath;
  }

  private mapToFramework(framework: ComplianceFramework): ControlMapping {
    const mappings: Record<ComplianceFramework, ControlMapping> = {
      SOC2: {
        framework: 'SOC2',
        controls: [
          { id: 'CC6.1', description: 'Logical access controls', evidenceType: 'ledger' },
          { id: 'CC7.2', description: 'System monitoring', evidenceType: 'shadow_genome' },
        ],
      },
      ISO27001: {
        framework: 'ISO27001',
        controls: [
          { id: 'A.12.4', description: 'Logging and monitoring', evidenceType: 'ledger' },
          { id: 'A.14.2', description: 'Security in development', evidenceType: 'ledger' },
        ],
      },
      EU_AI_ACT: {
        framework: 'EU_AI_ACT',
        controls: [
          { id: 'Art.12', description: 'Record-keeping', evidenceType: 'ledger' },
          { id: 'Art.14', description: 'Human oversight', evidenceType: 'shadow_genome' },
        ],
      },
    };
    return mappings[framework];
  }
}
