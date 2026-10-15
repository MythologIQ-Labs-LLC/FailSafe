/**
 * ledger-seal — reads the last SESSION SEAL entry of docs/META_LEDGER.md (#476).
 *
 * The Seal commit is the single-parent commit whose ledger gained the session's
 * SESSION SEAL entry: the entry is present at the commit and its header is
 * absent at the parent. Text is CRLF-normalized first. A seal block must carry
 * exactly one Session label and exactly one Chain Hash (Merkle seal) label in
 * the forms below; anything else is 'unparseable'.
 */

export interface SessionSeal { entry: number; sessionId: string; chainHash: string }

// No leading zeros: '#0644' is never read as entry 644 (hasEntryHeader treats it as present).
const SEAL_HEADER = /^### Entry #([1-9]\d*): SESSION SEAL\b/gm;
const ANY_HEADER = /^### Entry #/m;
const SESSION_STRICT = /^\*\*Session\*\*: `([A-Za-z0-9_-]+)`[ \t]*$/gm;
const SESSION_LOOSE = /^\*\*Session\*\*:/gm;
const CHAIN_STRICT = /^\*\*Chain Hash \(Merkle seal\)\*\*: `([0-9a-f]{64})`[ \t]*$/gm;
const CHAIN_LOOSE = /^\*\*Chain Hash \(Merkle seal\)\*\*:/gm;

const lf = (text: string): string => text.replace(/\r\n/g, '\n');

function only(block: string, strict: RegExp, loose: RegExp): string | undefined {
  const s = [...block.matchAll(strict)];
  const l = [...block.matchAll(loose)];
  return s.length === 1 && l.length === 1 ? s[0][1] : undefined;
}

export function lastSessionSeal(text: string): SessionSeal | 'unparseable' | null {
  const t = lf(text || '');
  const headers = [...t.matchAll(SEAL_HEADER)];
  if (headers.length === 0) return null;
  const last = headers[headers.length - 1];
  const start = last.index ?? 0;
  const afterHeader = start + last[0].length;
  const next = t.slice(afterHeader).search(ANY_HEADER);
  const block = next < 0 ? t.slice(start) : t.slice(start, afterHeader + next);
  const sessionId = only(block, SESSION_STRICT, SESSION_LOOSE);
  const chainHash = only(block, CHAIN_STRICT, CHAIN_LOOSE);
  const entry = Number(last[1]);
  if (!sessionId || !chainHash || !Number.isSafeInteger(entry)) return 'unparseable';
  return { entry, sessionId, chainHash };
}

/** True when the text has a header for this entry number, zero-padded or not
 *  (conservative: a padded header in the parent still counts as present). */
export function hasEntryHeader(text: string, entry: number): boolean {
  if (!Number.isSafeInteger(entry) || entry <= 0) return false;
  return new RegExp(`^### Entry #0*${entry}:`, 'm').test(lf(text || ''));
}
