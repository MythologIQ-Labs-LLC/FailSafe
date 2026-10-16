/**
 * sarif-to-risk — map normalized SARIF findings onto FailSafe risk records for
 * RiskRegisterManager.upsertRisk (keyed-idempotent by `id`). Pure; the SARIF
 * dedupKey becomes the stable risk id so re-importing the same scan upserts
 * rather than duplicating. WARN-only governance signal (status 'open', operator
 * triages) per the contract review.
 */

import { parseSarif, type SarifFinding } from './sarif-parser';
import { writeInChunks, type ImportBatch, type ImportWriteOutcome } from '../../roadmap/services/riskImportBatch';

export function sarifFindingToRisk(f: SarifFinding): Record<string, unknown> {
  const risk: Record<string, unknown> = {
    id: `sarif:${f.dedupKey}`,
    title: f.message ? `${f.ruleId}: ${f.message.slice(0, 140)}` : f.ruleId,
    severity: f.severity,
    source: 'sarif',
    status: 'open',
    provenance: { sarifVersion: '2.1.0', tool: f.tool, toolVersion: f.toolVersion, ruleId: f.ruleId },
  };
  if (f.file) risk.location = { file: f.file, line: f.startLine, column: f.startColumn };
  return risk;
}

/** Map + dedup findings to risk records (first occurrence of each id wins). */
export function sarifFindingsToRisks(findings: SarifFinding[]): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const out: Array<Record<string, unknown>> = [];
  for (const f of findings) {
    const risk = sarifFindingToRisk(f);
    const id = risk.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(risk);
  }
  return out;
}

/**
 * Orchestrate a SARIF text import: parse → map+dedup → upsert each risk via the
 * injected `upsert` (RiskRegisterManager.upsertRisk at runtime). Pure-testable —
 * the upsert sink is injected, so no fs/RiskRegisterManager is needed in tests.
 * With `batch` (v6.0.8 #528) the records are written in 500-record chunks,
 * each one register update; parsing and mapping happen before any lock.
 */
export function importSarifText(
  text: string,
  upsert: (risk: Record<string, unknown>) => unknown,
  batch?: ImportBatch,
): { findings: number; risks: number; failed: number; errors: string[]; write: ImportWriteOutcome } {
  const { findings, errors } = parseSarif(text);
  const riskRecords = sarifFindingsToRisks(findings);
  // #241 Tranche C (FX915): a failing register write must not abort the
  // remaining findings mid-stream — count it and continue (FX910 pattern).
  const write = writeInChunks(riskRecords, { write: (r) => upsert(r), newSide: () => null, keep: () => undefined }, batch);
  return { findings: findings.length, risks: write.written, failed: write.failed, errors, write };
}
