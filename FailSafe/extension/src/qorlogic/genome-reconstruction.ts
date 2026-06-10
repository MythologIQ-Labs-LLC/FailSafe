/**
 * genome-reconstruction — project the historical governance ledger (META_LEDGER)
 * into a Shadow Genome graph as an UNGOVERNED appendix (operator direction): a
 * FailSafe-downstream reconstruction that NEVER touches qor-logic's `.qor/genome.jsonl`
 * and is NOT part of the governance tree (not Merkle-chained, not a ledger entry).
 *
 * Every reconstructed node is tagged `provenance: 'reconstructed'` and back-cites its
 * source entry (`metadata.ledgerEntry`) — it is an INTERPRETATION of governance history,
 * not a recorded shadow event, and is labeled per-record so a mixed graph stays honest.
 *
 * PURE: MetaLedgerEntry[] in, GenomeGraph out. No I/O (the caller reads the ledger via
 * the canonical `parseMetaLedgerEntries`). Degrade-safe: [] in -> empty graph.
 *
 * Mapping (#454 research): GATE Verdict=VETO -> failure (+ its gate governance, applies_to);
 * GATE Verdict=PASS / GOVERNANCE / SECURE -> governance; SUBSTANTIATE / DELIVER -> checkpoint;
 * IMPLEMENT -> state; DEBUG / REMEDIATE -> remediation governance. Planning phases
 * (RESEARCH / PLAN / ORGANIZE / BOOTSTRAP / ENCODE / RECONCILE) are not execution events -> no node.
 */

import type { GenomeGraph, GenomeNode, GenomeEdge } from './shadow-genome-client';
import type { MetaLedgerEntry } from './meta-ledger-model';

const RECONSTRUCTED = 'reconstructed' as const;
const cap = (s: string): string => (s.length > 80 ? `${s.slice(0, 77)}...` : s);
const titlecase = (phase: string): string => phase.charAt(0) + phase.slice(1).toLowerCase();

function meta(e: MetaLedgerEntry, extra?: Record<string, unknown>): Record<string, unknown> {
  return { source: 'appendix', ledgerEntry: e.n, phase: e.phase, ...(extra || {}) };
}

/** Reconstruct an appendix GenomeGraph from parsed META_LEDGER entries. Pure. */
export function reconstructGenomeFromLedger(entries: MetaLedgerEntry[]): GenomeGraph {
  const nodes: GenomeNode[] = [];
  const edges: GenomeEdge[] = [];
  for (const e of entries) {
    const phase = (e.phase || '').toUpperCase();
    const verdict = (e.verdict || '').toUpperCase();
    if (phase === 'GATE' && verdict === 'VETO') {
      const gid = `lg-${e.n}-gate`;
      const fid = `lg-${e.n}-fail`;
      nodes.push({ id: gid, type: 'governance', label: cap(`Gate: ${e.title}`), provenance: RECONSTRUCTED, metadata: meta(e, { verdict }) });
      nodes.push({ id: fid, type: 'failure', label: cap(e.title), provenance: RECONSTRUCTED, metadata: meta(e, { verdict, riskGrade: e.riskGrade }) });
      edges.push({ id: `lg-${e.n}-ev`, source: gid, target: fid, type: 'applies_to', metadata: meta(e) });
    } else if (phase === 'GATE' || phase === 'GOVERNANCE' || phase === 'SECURE') {
      nodes.push({ id: `lg-${e.n}-gov`, type: 'governance', label: cap(`${titlecase(phase)}: ${e.title}`), provenance: RECONSTRUCTED, metadata: meta(e, verdict ? { verdict } : undefined) });
    } else if (phase === 'SUBSTANTIATE' || phase === 'DELIVER') {
      nodes.push({ id: `lg-${e.n}-cp`, type: 'checkpoint', label: cap(e.title), provenance: RECONSTRUCTED, metadata: meta(e) });
    } else if (phase === 'IMPLEMENT') {
      nodes.push({ id: `lg-${e.n}-state`, type: 'state', label: cap(e.title), provenance: RECONSTRUCTED, metadata: meta(e) });
    } else if (phase === 'REMEDIATE' || phase === 'REMEDIATION' || phase === 'DEBUG') {
      nodes.push({ id: `lg-${e.n}-rem`, type: 'governance', label: cap(`Remediation: ${e.title}`), provenance: RECONSTRUCTED, metadata: meta(e) });
    }
    // other phases (RESEARCH/PLAN/ORGANIZE/BOOTSTRAP/ENCODE/RECONCILE) are planning, not shadow events.
  }
  return { nodes, edges };
}
