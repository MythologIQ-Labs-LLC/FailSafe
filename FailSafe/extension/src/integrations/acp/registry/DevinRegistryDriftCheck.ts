// Pure (vscode-free) drift-check for a previously-installed FailSafe ACP
// registry entry (FailSafe#398, follow-up from #298).
//
// `DevinRegistryGuard.checkFailSafeEntry` is a correct tamper detector but had
// zero production callers — nothing re-verified an installed entry against
// what FailSafe expects it to be, so a later external rewrite of the registry
// (e.g. a Devin Desktop auto-update or a user "repair") could silently bypass
// the proxy. This module wires that detector to a persisted "expected" entry
// (recorded at install time by the caller) so a later re-check can distinguish
// intact / tampered / missing without knowing in advance what the entry should
// look like.

import { parseRegistry, type DevinAgent } from './DevinRegistryWriter';
import { checkFailSafeEntry, type GuardResult } from './DevinRegistryGuard';

/**
 * Compare the live registry text against a previously-installed FailSafe
 * entry. `expected` is whatever FailSafe itself wrote at install time for
 * this channel (persisted by the caller); when it is `undefined` — FailSafe
 * was never installed here, or was explicitly uninstalled — there is nothing
 * to drift from, so this returns `null` rather than a false "missing" alarm.
 */
export function checkInstalledEntryDrift(
  registryText: string | null | undefined,
  expected: DevinAgent | undefined,
): GuardResult | null {
  if (!expected) return null;
  return checkFailSafeEntry(parseRegistry(registryText), expected);
}
