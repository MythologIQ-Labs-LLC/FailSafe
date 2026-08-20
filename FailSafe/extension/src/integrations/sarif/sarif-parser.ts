/**
 * sarif-parser — offline SARIF 2.1.0 ingestion (B-INT-9 / issue #99, v1).
 *
 * The contract review (docs/research/integrations/INTEGRATION_SEMGREP_SARIF_CONTRACT_REVIEW.md)
 * scoped the minimum safe slice as a strict offline parser with stable dedup
 * keys + explicit provenance — no Semgrep account, no network. Pure (no fs):
 * callers pass the file text, so parsing is deterministically fixture-tested.
 *
 * SARIF is a vendor-neutral OASIS standard; GitHub code-scanning accepts a
 * subset of 2.1.0. We parse the common shape produced by Semgrep CE and other
 * 2.1.0 producers and normalize each result to a SarifFinding.
 */

export type SarifSeverity = 'high' | 'warn' | 'info';

export interface SarifFinding {
  ruleId: string;
  severity: SarifSeverity;
  message: string;
  file: string | null;
  startLine: number | null;
  startColumn: number | null;
  tool: string;
  toolVersion: string | null;
  /** Stable, deterministic dedup key (ruleId + location). */
  dedupKey: string;
}

export interface SarifParseResult {
  findings: SarifFinding[];
  errors: string[];
}

const LEVEL_TO_SEVERITY: Record<string, SarifSeverity> = {
  error: 'high',
  warning: 'warn',
  note: 'info',
  none: 'info',
};

interface SarifResult {
  ruleId?: string;
  rule?: { id?: string };
  level?: string;
  message?: { text?: string };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: { uri?: string };
      region?: { startLine?: number; startColumn?: number };
    };
  }>;
}
interface SarifRun {
  tool?: { driver?: { name?: string; version?: string; rules?: Array<{ id?: string; defaultConfiguration?: { level?: string } }> } };
  results?: SarifResult[];
}
interface SarifDoc { version?: string; runs?: SarifRun[] }

/**
 * Parse SARIF 2.1.0 text into normalized findings. Returns `errors` (never
 * throws) for malformed JSON / non-2.1.0 / missing runs; individual malformed
 * results are skipped rather than aborting the whole import.
 */
export function parseSarif(text: string): SarifParseResult {
  const errors: string[] = [];
  let doc: SarifDoc;
  try {
    doc = JSON.parse(text) as SarifDoc;
  } catch (e) {
    return { findings: [], errors: [`malformed JSON: ${(e as Error).message}`] };
  }
  if (!doc || typeof doc !== 'object') {
    return { findings: [], errors: ['not a SARIF object'] };
  }
  if (!doc.version || !String(doc.version).startsWith('2.1')) {
    return { findings: [], errors: [`unsupported SARIF version: ${doc.version ?? '(none)'} (expected 2.1.0)`] };
  }
  if (!Array.isArray(doc.runs)) {
    return { findings: [], errors: ['SARIF has no runs[] array'] };
  }

  const findings: SarifFinding[] = [];
  for (const run of doc.runs) {
    if (!run || typeof run !== 'object') {
      errors.push('run is not an object — skipped');
      continue;
    }
    const driver = run.tool?.driver;
    const tool = driver?.name ?? 'unknown';
    const toolVersion = driver?.version ?? null;
    // Rule-default levels for results that omit `level`.
    const ruleLevels = new Map<string, string>();
    const rules = Array.isArray(driver?.rules) ? driver.rules : [];
    if (driver?.rules && !Array.isArray(driver.rules)) errors.push('driver.rules is not an array — skipped');
    for (const r of rules) {
      if (r.id && r.defaultConfiguration?.level) ruleLevels.set(r.id, r.defaultConfiguration.level);
    }
    const results = Array.isArray(run.results) ? run.results : [];
    if (run.results && !Array.isArray(run.results)) errors.push('run.results is not an array — skipped');
    for (const res of results) {
      const ruleId = res.ruleId ?? res.rule?.id;
      if (!ruleId) { errors.push('result missing ruleId — skipped'); continue; }
      const level = res.level ?? ruleLevels.get(ruleId) ?? 'warning';
      const severity = LEVEL_TO_SEVERITY[level] ?? 'warn';
      const message = res.message?.text ?? '';
      const phys = res.locations?.[0]?.physicalLocation;
      const file = phys?.artifactLocation?.uri ?? null;
      const startLine = phys?.region?.startLine ?? null;
      const startColumn = phys?.region?.startColumn ?? null;
      const dedupKey = `${tool}::${ruleId}::${file ?? ''}::${startLine ?? ''}::${startColumn ?? ''}`;
      findings.push({ ruleId, severity, message, file, startLine, startColumn, tool, toolVersion, dedupKey });
    }
  }
  return { findings, errors };
}
