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
 *
 * Takes already-parsed `MetaLedgerEntry[]` rather than raw ledger text (#233
 * consumer-adapter migration): the caller reads the ledger through the shared
 * qorlogic consumer adapter (`readMetaLedgerArtifact`), which already delegates
 * to the canonical `parseMetaLedgerEntries` — this module does not re-parse.
 */

import type { MetaLedgerEntry } from '../meta-ledger-model';

/**
 * Return a stable marker for the latest SESSION SEAL entry among `entries`, or
 * null when there is none. The marker is that entry's Chain Hash (unique per
 * seal), falling back to `entry-<N>` when no chain hash is present. Only the
 * entry HEADER (title) is matched for "SESSION SEAL" — body mentions of prior
 * seal entries (e.g. a DELIVER entry's `Predecessor:` line) do not count,
 * because `MetaLedgerEntry.title` is header-only (meta-ledger-model.ts).
 */
export function latestSealMarker(entries: MetaLedgerEntry[]): string | null {
  const seals = entries.filter((e) => /SESSION SEAL/i.test(e.title));
  if (seals.length === 0) return null;
  const last = seals[seals.length - 1];
  return last.chainHash ?? `entry-${last.n}`;
}

/**
 * Tracks the latest-seen SESSION SEAL marker and reports whether a freshly-read
 * ledger contains a NEW seal (advancing its own state when so). Constructed from
 * the ledger as it exists at wiring time, so the pre-existing latest seal does
 * NOT fire on startup.
 */
export class SealWatchState {
  private lastMarker: string | null;

  constructor(initialEntries: MetaLedgerEntry[]) {
    this.lastMarker = latestSealMarker(initialEntries);
  }

  /** True (and advances state) iff `newEntries` carries a seal marker that
   *  differs from the last one seen. A null/unchanged marker returns false. */
  shouldFire(newEntries: MetaLedgerEntry[]): boolean {
    const marker = latestSealMarker(newEntries);
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
