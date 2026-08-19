// ACP permission authority (GH #172) — the `governAcpCall` analogue.
//
// `session/request_permission` is an Agent→Client method: the client implements
// the handler and returns the deciding outcome. This module is that handler's
// brain — it runs the permission request through the AcpInterceptor (→
// EnforcementEngine → ReceiptContract) and maps the `ReceiptVerdict` onto a
// schema-valid `RequestPermissionResponse.outcome`, choosing a concrete
// allow/reject `optionId` from the options the agent offered.
//
// HONEST SCOPE — two limits, stated plainly (do not read this as unconditional
// "fail-closed"):
//   1. COOPERATIVE-PATH only. A compliant agent calls `session/request_permission`;
//      a malicious/non-cooperative agent MAY skip it and act off-channel. Closing
//      that gap requires FailSafe Pro's OS-level enforcement.
//   2. MODE-DEPENDENT enforcement (ACP-ADV-02). The ALLOW path here simply
//      reflects the backing engine's VERDICT. Under a non-enforcing governance
//      mode (observe / assist) the engine returns ALLOW by design
//      (telemetry-only — "would have blocked"), so a grant produced here is only
//      as strong as the engine's current mode. Genuine deny-by-default applies to
//      DENY verdicts (BLOCK/QUARANTINE/ESCALATE/MODIFY) and to malformed/unmapped
//      intents (QUARANTINE) — NOT to ALLOW verdicts under observe mode. Surfacing
//      the effective mode in the outcome/receipt is wired with the engine receipt
//      change in the live-transport follow-up.
//
// Unlike the MCP path, the HTTP receipt→status table (RECEIPT_HTTP_TABLE) does
// NOT transfer: ACP is JSON-RPC over stdio, so the mapping target is the ACP
// outcome enum, not an HTTP status.

import type { ReceiptVerdict } from '../../contracts';
import type { AcpInterceptor } from './AcpInterceptor';
import type {
  AcpPermissionRequest,
  AcpPermissionOption,
  AcpPermissionOptionKind,
  AcpPermissionOutcome,
} from './acpTypes';

const REJECT_KINDS: readonly AcpPermissionOptionKind[] = ['reject_once', 'reject_always'];

/** Pick the first option matching `preferred` kind, else any option whose kind
 *  is in `kinds`. Returns null when none match. */
function pickOption(
  options: AcpPermissionOption[],
  kinds: readonly AcpPermissionOptionKind[],
  preferred: AcpPermissionOptionKind,
): AcpPermissionOption | null {
  return options.find((o) => o.kind === preferred)
    ?? options.find((o) => kinds.includes(o.kind))
    ?? null;
}

/**
 * Map a governance verdict onto an ACP permission outcome over the offered
 * options:
 *   - ALLOW → ONLY an `allow_once` option. We never auto-select `allow_always`
 *     (ACP-ADV-07) — the spec does not guarantee `always` is persisted/honored,
 *     and standing grants must be an explicit operator act, not an inferred one.
 *     If no `allow_once` option is offered → `cancelled` (safe non-grant).
 *   - BLOCK / QUARANTINE / MODIFY → a reject option (prefer `reject_once`, else
 *     `reject_always`). MODIFY has no ACP narrowing channel here, so it denies.
 *   - ESCALATE → conservative reject (no ACP "pending/deferred" outcome exists).
 *   - If no reject option is offered for a deny verdict → `cancelled` (the agent
 *     offered no way to express refusal; never falls through to allow).
 * Note the mode caveat in the file header: ALLOW here reflects the engine
 * verdict, which under observe mode is auto-allow by design.
 */
export function verdictToOutcome(
  verdict: ReceiptVerdict,
  options: AcpPermissionOption[],
): AcpPermissionOutcome {
  if (verdict === 'ALLOW') {
    // ACP-ADV-07: allow_once ONLY — no fallback to allow_always.
    const opt = options.find((o) => o.kind === 'allow_once') ?? null;
    return opt ? { outcome: 'selected', optionId: opt.optionId } : { outcome: 'cancelled' };
  }
  // BLOCK, QUARANTINE, MODIFY, ESCALATE all deny on the cooperative path.
  const opt = pickOption(options, REJECT_KINDS, 'reject_once');
  return opt ? { outcome: 'selected', optionId: opt.optionId } : { outcome: 'cancelled' };
}

/**
 * Decide an ACP `session/request_permission` request: govern it through the
 * interceptor, then map the verdict to an outcome. This is the function a live
 * ACP client's `requestPermission` handler would call.
 */
export async function decidePermission(
  request: AcpPermissionRequest,
  interceptor: AcpInterceptor,
): Promise<AcpPermissionOutcome> {
  const receipt = await interceptor.intercept({ type: 'permission', request });
  return verdictToOutcome(receipt.verdict, request.options);
}
