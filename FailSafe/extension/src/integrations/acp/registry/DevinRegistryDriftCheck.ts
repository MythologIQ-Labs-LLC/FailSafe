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
import { checkFailSafeEntry, type GuardStatus } from './DevinRegistryGuard';

export type DriftStatus = GuardStatus | 'malformed';

export interface DriftCheckResult {
  status: DriftStatus;
  /** The platform keys whose cmd/args/archive drifted (only for `tampered`). */
  driftedPlatforms: string[];
}

/**
 * Compare the live registry text against a previously-installed FailSafe
 * entry. `expected` is whatever FailSafe itself wrote at install time for
 * this channel (persisted by the caller); when it is `undefined` — FailSafe
 * was never installed here, or was explicitly uninstalled — there is nothing
 * to drift from, so this returns `null` rather than a false "missing" alarm.
 *
 * `registryText` present but not valid JSON is reported as `malformed`, not
 * `missing` — `DevinRegistryWriter.parseRegistry`'s parse-tolerant fallback
 * (used by the actual install/uninstall writers, where "degrade to an empty
 * skeleton rather than block install" is the right behavior) would otherwise
 * make an unreadable/corrupt registry indistinguishable from a cleanly
 * removed entry, which understates the real risk and points the operator at
 * the wrong remedy.
 */
export function checkInstalledEntryDrift(
  registryText: string | null | undefined,
  expected: DevinAgent | undefined,
): DriftCheckResult | null {
  if (!expected) return null;
  if (registryText != null) {
    try {
      JSON.parse(registryText);
    } catch {
      return { status: 'malformed', driftedPlatforms: [] };
    }
  }
  return checkFailSafeEntry(parseRegistry(registryText), expected);
}
