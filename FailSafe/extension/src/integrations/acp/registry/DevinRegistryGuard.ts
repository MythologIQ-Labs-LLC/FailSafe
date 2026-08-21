// Devin Desktop ACP registry tamper-guard (GH #172 Part 2, B6).
//
// The Devin registry is unsigned + user-writable, so any process can rewrite the
// FailSafe entry's `cmd` back to the raw agent (bypassing FailSafe) or remove it.
// This compares the LIVE registry's FailSafe entry against the EXPECTED entry so
// the integration can detect drift and re-assert (the fs.watch / re-assert wiring
// is the route layer; this is the pure detector).

import type { DevinRegistry, DevinAgent } from './DevinRegistryWriter';

export type GuardStatus = 'intact' | 'tampered' | 'missing';

export interface GuardResult {
  status: GuardStatus;
  /** The platform keys whose cmd/args drifted (only for `tampered`). */
  driftedPlatforms: string[];
}

/**
 * Compare the FailSafe agent in the live registry against the expected entry.
 *   - `missing`  — the entry was removed (or never installed).
 *   - `tampered` — present, but one or more platforms' `cmd`/`args`/`archive`
 *                  drifted from expected (the bypass attack), OR the live entry
 *                  carries a platform key the expected entry never had.
 *   - `intact`   — every platform on both sides matches exactly.
 *
 * `archive` is compared too: a non-empty `archive` makes Devin download a
 * binary before launching it, which changes what actually runs even if `cmd`
 * is untouched (see DevinRegistryWriter's `buildGovernedTwin` comment). Live
 * platform keys absent from `expected` are also drift — restricting the scan
 * to `expected`'s keys would let an attacker add a new platform variant that
 * the guard never looks at.
 */
export function checkFailSafeEntry(reg: DevinRegistry, expected: DevinAgent): GuardResult {
  const live = reg.agents.find((a) => a && a.id === expected.id);
  if (!live) return { status: 'missing', driftedPlatforms: [] };
  const liveBin = live.distribution?.binary ?? {};
  const expBin = expected.distribution.binary;
  const drifted = new Set<string>();
  for (const key of Object.keys(expBin)) {
    const l = liveBin[key];
    const e = expBin[key];
    if (!l || l.cmd !== e.cmd || l.archive !== e.archive || JSON.stringify(l.args) !== JSON.stringify(e.args)) {
      drifted.add(key);
    }
  }
  for (const key of Object.keys(liveBin)) {
    if (!(key in expBin)) drifted.add(key);
  }
  return drifted.size > 0
    ? { status: 'tampered', driftedPlatforms: [...drifted] }
    : { status: 'intact', driftedPlatforms: [] };
}
