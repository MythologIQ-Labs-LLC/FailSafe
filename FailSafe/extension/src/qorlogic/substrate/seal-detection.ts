/**
 * seal-detection — pure logic for B-SUBSTRATE-3 (auto-hook the substrate runner
 * into /qor-substantiate).
 *
 * /qor-substantiate's seal is a write to docs/META_LEDGER.md that appends a new
 * `### Entry #N: SESSION SEAL — ...` block. The extension already watches the
 * ledger via WorkspaceMutationBus, but that watcher fires on ANY ledger edit.
 * This module distinguishes a *new SESSION SEAL* from any other ledger write so
 * the substrate run only fires when a substantiate actually sealed.
 *
 * Pure (no fs / vscode / timers) so the new-seal state machine is
 * deterministically testable — no watcher/clock races (B-BIC-24 lesson).
 */

const ENTRY_HEADER_RE = /^### Entry #(\d+):([^\n]*)$/gm;
const CHAIN_HASH_RE = /\*\*Chain Hash\*\*:\s*`([0-9a-f]{64})`/;

/**
 * Return a stable marker for the latest SESSION SEAL entry in the ledger, or
 * null when there is none. The marker is that entry's Chain Hash (unique per
 * seal), falling back to `entry-<N>` when no chain hash is present. Only the
 * entry HEADER line is matched for "SESSION SEAL" — body mentions of prior seal
 * entries (e.g. a DELIVER entry's `Predecessor:` line) do not count.
 */
export function latestSealMarker(ledgerText: string): string | null {
  const matches = [...ledgerText.matchAll(ENTRY_HEADER_RE)];
  if (matches.length === 0) return null;
  let marker: string | null = null;
  for (let i = 0; i < matches.length; i += 1) {
    const header = matches[i][2];
    if (!/SESSION SEAL/i.test(header)) continue;
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? ledgerText.length) : ledgerText.length;
    const body = ledgerText.slice(start, end);
    const chain = body.match(CHAIN_HASH_RE);
    marker = chain ? chain[1] : `entry-${matches[i][1]}`;
  }
  return marker;
}

/**
 * Tracks the latest-seen SESSION SEAL marker and reports whether a freshly-read
 * ledger contains a NEW seal (advancing its own state when so). Constructed from
 * the ledger as it exists at wiring time, so the pre-existing latest seal does
 * NOT fire on startup.
 */
export class SealWatchState {
  private lastMarker: string | null;

  constructor(initialLedgerText: string) {
    this.lastMarker = latestSealMarker(initialLedgerText);
  }

  /** True (and advances state) iff `newLedgerText` carries a seal marker that
   *  differs from the last one seen. A null/unchanged marker returns false. */
  shouldFire(newLedgerText: string): boolean {
    const marker = latestSealMarker(newLedgerText);
    if (marker !== null && marker !== this.lastMarker) {
      this.lastMarker = marker;
      return true;
    }
    return false;
  }

  /** Current tracked marker (for diagnostics/tests). */
  get marker(): string | null {
    return this.lastMarker;
  }
}
