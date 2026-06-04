// ACP permission authority (GH #172) — the `governAcpCall` analogue.
//
// `session/request_permission` is an Agent→Client method: the client implements
// the handler and returns the deciding outcome. This module is that handler's
// brain — it runs the permission request through the AcpInterceptor (→
// EnforcementEngine → ReceiptContract) and maps the `ReceiptVerdict` onto a
// schema-valid `RequestPermissionResponse.outcome`, choosing a concrete
// allow/reject `optionId` from the options the agent offered.
//
// IMPORTANT (honest scope): this gate is COOPERATIVE-PATH only. A compliant
// agent calls `session/request_permission`; a malicious/non-cooperative agent
// MAY skip it and act off-channel. Closing that gap requires FailSafe Pro's
// OS-level enforcement — out of scope for this in-editor foundation.
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

const ALLOW_KINDS: readonly AcpPermissionOptionKind[] = ['allow_once', 'allow_always'];
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
 * options. Fail-closed:
 *   - ALLOW → a permissive option (prefer `allow_once`; never auto-`allow_always`
 *     since the spec does not guarantee `always` is persisted/honored).
 *   - BLOCK / QUARANTINE / MODIFY → a reject option (prefer `reject_once`).
 *     MODIFY has no ACP narrowing channel in the foundation, so it denies.
 *   - ESCALATE → conservative `reject_once` (no ACP "pending/deferred" outcome
 *     exists; a held/deferred decision is a transport-layer follow-up).
 *   - If the required option kind is absent → `cancelled` (safe non-grant).
 */
export function verdictToOutcome(
  verdict: ReceiptVerdict,
  options: AcpPermissionOption[],
): AcpPermissionOutcome {
  if (verdict === 'ALLOW') {
    const opt = pickOption(options, ALLOW_KINDS, 'allow_once');
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
