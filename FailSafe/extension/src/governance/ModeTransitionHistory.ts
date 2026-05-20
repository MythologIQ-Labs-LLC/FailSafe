/**
 * ModeTransitionHistory — in-memory ring buffer of recent governance-mode
 * transitions. Subscribes to `governance.modeChanged` (config-edit path)
 * plus `governance.breakGlass{Activated,Revoked,Expired}` and projects
 * each into a uniform `ModeTransitionRecord` for the UI feed.
 *
 * B-EM-2: optional `hydrateFromLedger()` seeds the ring from the most
 * recent USER_OVERRIDE entries (governance_mode_changed + break_glass_*)
 * so the feed survives extension reload. While hydration is in flight,
 * live events queue into a temp buffer and drain on completion so the
 * race between the constructor wiring subscriptions and the async
 * ledger query does NOT corrupt DESC order.
 */

import * as crypto from "crypto";
import { EventBus } from "../shared/EventBus";
import type {
  GovernanceModeChangedEvent,
  ModeTransitionRecord,
} from "./types";

const RING_CAPACITY = 10;
const HYDRATION_LIMIT = 10;

const MATCHING_LEDGER_ACTIONS = new Set([
  "governance_mode_changed",
  "break_glass_activated",
  "break_glass_revoked",
  "break_glass_expired",
]);

interface LedgerEntryShape {
  id?: number | string | null;
  agentDid?: string | null;
  payload?: unknown;
}

interface LedgerHydrationSource {
  getEntriesByType(
    eventType: "USER_OVERRIDE",
    limit: number,
  ): Promise<LedgerEntryShape[]>;
}

export class ModeTransitionHistory {
  private records: ModeTransitionRecord[] = [];
  private disposers: Array<() => void> = [];
  /** True only while `hydrateFromLedger()` is running. Default false so
   *  callers that never hydrate (existing test fixtures) get unchanged
   *  live-event recording behavior. */
  private hydrating = false;
  private pendingDuringHydration: ModeTransitionRecord[] = [];

  constructor(private readonly eventBus: EventBus) {
    this.disposers.push(
      this.eventBus.on("governance.modeChanged", (ev) => {
        this.recordFromModeChanged(ev.payload as GovernanceModeChangedEvent);
      }),
    );
    this.disposers.push(
      this.eventBus.on("governance.breakGlassActivated", (ev) => {
        this.recordFromBreakGlass(ev.payload, "break_glass_activated");
      }),
    );
    this.disposers.push(
      this.eventBus.on("governance.breakGlassRevoked", (ev) => {
        this.recordFromBreakGlass(ev.payload, "revoked");
      }),
    );
    this.disposers.push(
      this.eventBus.on("governance.breakGlassExpired", (ev) => {
        this.recordFromBreakGlass(ev.payload, "expired");
      }),
    );
  }

  /**
   * B-EM-2: hydrate the ring from the persistent ledger. Must be called
   * once at startup after the LedgerManager initializes; ring stays
   * `hydrating=true` until this completes so live events that fire during
   * the async query are queued and drained afterward (preserving DESC order).
   */
  async hydrateFromLedger(ledger: LedgerHydrationSource): Promise<void> {
    this.hydrating = true;
    let entries: LedgerEntryShape[];
    try {
      entries = await ledger.getEntriesByType("USER_OVERRIDE", HYDRATION_LIMIT);
    } catch {
      this.finishHydration();
      return;
    }
    // Ledger returns DESC; reverse to ASC so we can push() oldest-first
    // (each push() unshifts at index 0, leaving DESC order at the end).
    const projected: ModeTransitionRecord[] = [];
    for (const e of entries) {
      const r = this.projectLedgerEntry(e);
      if (r) projected.push(r);
    }
    for (const r of projected.reverse()) this.push(r);
    this.finishHydration();
  }

  private finishHydration(): void {
    this.hydrating = false;
    // Drain queued live events on top of hydrated history.
    const pending = this.pendingDuringHydration;
    this.pendingDuringHydration = [];
    for (const r of pending) this.push(r);
  }

  private projectLedgerEntry(entry: LedgerEntryShape): ModeTransitionRecord | null {
    const p = entry.payload as Record<string, unknown> | undefined;
    if (!p) return null;
    const action = String(p.action ?? "");
    if (!MATCHING_LEDGER_ACTIONS.has(action)) return null;
    if (!p.previousMode || !p.newMode || !p.timestamp) return null;
    let reason: ModeTransitionRecord["reason"];
    let actor: string;
    if (action === "governance_mode_changed") {
      reason = "config_edit";
      actor = String(entry.agentDid ?? "unknown");
    } else if (action === "break_glass_activated") {
      reason = "break_glass_activated";
      actor = String(p.requestedBy ?? entry.agentDid ?? "unknown");
    } else if (action === "break_glass_revoked") {
      reason = "revoked";
      actor = String(p.requestedBy ?? entry.agentDid ?? "unknown");
    } else {
      reason = "expired";
      actor = String(p.requestedBy ?? entry.agentDid ?? "unknown");
    }
    return {
      id: this.newId(),
      previousMode: p.previousMode as ModeTransitionRecord["previousMode"],
      newMode: p.newMode as ModeTransitionRecord["newMode"],
      reason,
      actor,
      timestamp: String(p.timestamp),
      ledgerEntryRef: entry.id == null ? null : String(entry.id),
    };
  }

  getRecent(limit: number = RING_CAPACITY): ModeTransitionRecord[] {
    if (limit <= 0) return [];
    return this.records.slice(0, Math.min(limit, this.records.length));
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  private recordFromModeChanged(p: GovernanceModeChangedEvent): void {
    const record: ModeTransitionRecord = {
      id: this.newId(),
      previousMode: p.previousMode,
      newMode: p.newMode,
      reason: p.reason,
      actor: p.actor,
      timestamp: p.timestamp,
      ledgerEntryRef: p.ledgerEntryRef ?? null,
    };
    if (this.hydrating) {
      this.pendingDuringHydration.push(record);
      return;
    }
    this.push(record);
  }

  private recordFromBreakGlass(payload: unknown, reason: ModeTransitionRecord["reason"]): void {
    const p = (payload ?? {}) as Record<string, unknown>;
    if (!p.previousMode || !p.newMode || !p.timestamp) return;
    const record: ModeTransitionRecord = {
      id: this.newId(),
      previousMode: p.previousMode as ModeTransitionRecord["previousMode"],
      newMode: p.newMode as ModeTransitionRecord["newMode"],
      reason,
      actor: String(p.requestedBy ?? "unknown"),
      timestamp: String(p.timestamp),
      ledgerEntryRef: null,
    };
    if (this.hydrating) {
      this.pendingDuringHydration.push(record);
      return;
    }
    this.push(record);
  }

  private push(record: ModeTransitionRecord): void {
    this.records.unshift(record);
    if (this.records.length > RING_CAPACITY) {
      this.records.length = RING_CAPACITY;
    }
  }

  private newId(): string {
    return `mt-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  }
}
