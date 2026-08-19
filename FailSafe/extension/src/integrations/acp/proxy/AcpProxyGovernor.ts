// ACP proxy governance brain (GH #172 Part 2). The transport shell (the SDK MITM
// proxy, a follow-up slice) calls INTO this for every governable ACP frame; this
// module owns the enforcement decision, the effective-mode surfacing (B3 /
// ACP-ADV-02), and the durable record emission (B7 / ACP-NIST-03). It speaks no
// transport — pure logic + injected deps — so it is fully unit-tested.
//
// HONEST SCOPE (carried from the foundation): governance is cooperative-path +
// mode-dependent. This module does NOT override observe mode (observe = "watch,
// don't block"); instead it SURFACES the effective mode on every record so a
// non-enforcing ALLOW is never silently presented as an enforced grant.

import type { ReceiptContract, ReceiptVerdict } from '../../../contracts';
import type { AcpInterceptor } from '../AcpInterceptor';
import { verdictToOutcome } from '../acpPermissionAuthority';
import type { AcpPermissionRequest, AcpPermissionOutcome, AcpGovernableIntent } from '../acpTypes';

/**
 * Effective governance posture at decision time. `enforcing` is FALSE under
 * observe / assist, where the engine returns ALLOW by design — so any ALLOW
 * produced then is telemetry-only, not an enforced grant. (Editor-level
 * enforce is tier-independent per the 2026-08-19 ruling; the former
 * lockstep-off ALLOW path no longer exists.)
 */
export interface AcpEffectiveMode {
  mode: string;
  enforcing: boolean;
}

/** A single governance decision for the durable trail (B7). */
export interface AcpGovernanceRecord {
  kind: 'permission' | 'intent';
  verdict: ReceiptVerdict;
  /** The effective governance mode (B3) — so a non-enforcing verdict is auditable. */
  effectiveMode: string;
  enforcing: boolean;
  /** Whether the proxy actually withheld the action (true only when a deny
   *  verdict was produced under an ENFORCING mode). */
  blocked: boolean;
  target?: string;
  rationale?: string;
}

/** Sink for governance records — the transport backs this with `LedgerManager`. */
export interface AcpLedgerSink {
  record(entry: AcpGovernanceRecord): void;
}

export interface AcpProxyGovernorOpts {
  /** Resolve the effective governance posture per decision (transport reads
   *  `getGovernanceModeState`). */
  effectiveMode: () => AcpEffectiveMode;
  /** Optional durable sink (LedgerManager-backed). Absent → no-op (degrade safe). */
  ledger?: AcpLedgerSink;
}

const DENY_VERDICTS: ReadonlySet<ReceiptVerdict> = new Set(['BLOCK', 'QUARANTINE', 'MODIFY', 'ESCALATE']);

/** Decisions the proxy acts on for a governed effect. */
export interface AcpEffectDecision {
  receipt: ReceiptContract;
  /** True when the proxy should withhold/deny the action (deny verdict AND an
   *  enforcing mode). Under observe mode this is always false (don't block). */
  blocked: boolean;
  record: AcpGovernanceRecord;
}

export class AcpProxyGovernor {
  constructor(
    private readonly interceptor: AcpInterceptor,
    private readonly opts: AcpProxyGovernorOpts,
  ) {}

  /**
   * Govern a `session/request_permission` and return the ACP outcome. The
   * outcome reflects the engine verdict (observe mode → the engine's ALLOW is
   * kept — "don't block"), but the emitted record carries `enforcing`/`mode` so
   * a non-enforcing grant is auditable (B3).
   */
  async governPermission(
    request: AcpPermissionRequest,
  ): Promise<{ outcome: AcpPermissionOutcome; record: AcpGovernanceRecord }> {
    const receipt = await this.interceptor.intercept({ type: 'permission', request });
    const outcome = verdictToOutcome(receipt.verdict, request.options);
    const mode = this.opts.effectiveMode();
    const blocked = mode.enforcing && DENY_VERDICTS.has(receipt.verdict);
    const record = this.makeRecord('permission', receipt, mode, blocked);
    this.emit(record);
    return { outcome, record };
  }

  /**
   * Govern a non-permission effect (`fs/write_text_file`, `terminal/create`,
   * tool call). Returns the receipt + whether to withhold the action. NOTE: a
   * deny only WITHHOLDS under an enforcing mode; and fs/terminal *payload*
   * policy is not enforced until the engine widening (B2) — until then the
   * verdict reflects only path/scope + malformed/oversized QUARANTINE.
   */
  async governEffect(intent: AcpGovernableIntent): Promise<AcpEffectDecision> {
    const receipt = await this.interceptor.intercept(intent);
    const mode = this.opts.effectiveMode();
    const blocked = mode.enforcing && DENY_VERDICTS.has(receipt.verdict);
    const record = this.makeRecord('intent', receipt, mode, blocked);
    this.emit(record);
    return { receipt, blocked, record };
  }

  private makeRecord(
    kind: AcpGovernanceRecord['kind'],
    receipt: ReceiptContract,
    mode: AcpEffectiveMode,
    blocked: boolean,
  ): AcpGovernanceRecord {
    return {
      kind,
      verdict: receipt.verdict,
      effectiveMode: mode.mode,
      enforcing: mode.enforcing,
      blocked,
      rationale: receipt.verdictRationale,
    };
  }

  /** Best-effort emit — a faulty sink must never break governance (degrade safe). */
  private emit(record: AcpGovernanceRecord): void {
    try {
      this.opts.ledger?.record(record);
    } catch {
      /* a broken ledger sink must not break the proxy decision path */
    }
  }
}
