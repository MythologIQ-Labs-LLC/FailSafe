/**
 * meta-ledger-model — the canonical parse of `docs/META_LEDGER.md` `### Entry #N:`
 * blocks into a typed model. ONE parser for every governance consumer (the tracker
 * projection FX862 and the substantiate seal-detector both used to parse the same
 * blocks independently; #197 research F2). PURE — string in, model out, no I/O.
 *
 * Named `MetaLedgerEntry` (not `LedgerEntry`) on purpose: `LedgerEntry` already
 * names three unrelated types — the runtime ledger event (`shared/types`), the
 * `GovernancePhaseTracker` shape, and the old tracker-local markdown shape. This
 * model is specifically the parsed META_LEDGER markdown entry.
 *
 * Degrade-safe: empty/garbage in → `[]`, never a throw.
 */

export interface MetaLedgerEntry {
  n: number;
  /** Header text after `### Entry #N:` (trimmed). */
  title: string;
  /** First whitespace-delimited token of `**Phase**` (e.g. `DELIVER`). */
  phase: string;
  version?: string;
  tag?: string;
  date?: string;
  /** First non-empty paragraph under `## Decision`, collapsed + capped at 300 chars. */
  decision?: string;
  /** The entry's `**Chain Hash**` (64 hex), when present. */
  chainHash?: string;
}

const CHAIN_HASH_RE = /\*\*Chain Hash\*\*:\s*`([0-9a-f]{64})`/;

/** Parse `### Entry #N: <title>` blocks → structured entries. The markers are
 *  stable across the Merkle ledger: `**Phase**`, `**Version**`, `**Tag**`,
 *  `**Date**`, `## Decision`, `**Chain Hash**`. */
export function parseMetaLedgerEntries(metaLedger: string): MetaLedgerEntry[] {
  const text = metaLedger || '';
  const out: MetaLedgerEntry[] = [];
  // Split on the entry header; keep the header with its block.
  const parts = text.split(/(?=^### Entry #\d+:)/m);
  for (const block of parts) {
    const head = /^### Entry #(\d+):\s*(.+)$/m.exec(block);
    if (!head) continue;
    const n = parseInt(head[1], 10);
    const title = head[2].trim();
    const phase = (/^\*\*Phase\*\*:\s*(.+)$/m.exec(block)?.[1] || '').trim().split(/\s+/)[0];
    const version = /^\*\*Version\*\*:\s*(.+)$/m.exec(block)?.[1]?.trim();
    const tag = /^\*\*Tag\*\*:\s*(.+)$/m.exec(block)?.[1]?.trim();
    const date = /^\*\*Date\*\*:\s*(.+)$/m.exec(block)?.[1]?.trim();
    const chainHash = CHAIN_HASH_RE.exec(block)?.[1];
    // First non-empty paragraph under `## Decision` (stop at the next `##`).
    let decision: string | undefined;
    const dec = /^## Decision\s*$([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(block);
    if (dec) {
      const para = dec[1].split(/\n\s*\n/).map((s) => s.trim()).find(Boolean);
      if (para) decision = para.replace(/\s+/g, ' ').trim().slice(0, 300);
    }
    out.push({ n, phase, title, version, tag, date, decision, chainHash });
  }
  return out;
}
