/**
 * ModeTransitionHistory — in-memory ring buffer of recent governance-mode
 * transitions. Subscribes to `governance.modeChanged` (config-edit path)
 * plus `governance.breakGlass{Activated,Revoked,Expired}` and projects
 * each into a uniform `ModeTransitionRecord` for the UI feed.
 *
 * V1: ring capped at 10 entries, in-memory only. Cross-session
 * persistence tracked as B-EM-2.
 */

import * as crypto from "crypto";
import { EventBus } from "../shared/EventBus";
import type {
  GovernanceModeChangedEvent,
  ModeTransitionRecord,
} from "./types";

const RING_CAPACITY = 10;

export class ModeTransitionHistory {
  private records: ModeTransitionRecord[] = [];
  private disposers: Array<() => void> = [];

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

  getRecent(limit: number = RING_CAPACITY): ModeTransitionRecord[] {
    if (limit <= 0) return [];
    return this.records.slice(0, Math.min(limit, this.records.length));
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  private recordFromModeChanged(p: GovernanceModeChangedEvent): void {
    this.push({
      id: this.newId(),
      previousMode: p.previousMode,
      newMode: p.newMode,
      reason: p.reason,
      actor: p.actor,
      timestamp: p.timestamp,
      ledgerEntryRef: p.ledgerEntryRef ?? null,
    });
  }

  private recordFromBreakGlass(payload: unknown, reason: ModeTransitionRecord["reason"]): void {
    const p = (payload ?? {}) as Record<string, unknown>;
    if (!p.previousMode || !p.newMode || !p.timestamp) return;
    this.push({
      id: this.newId(),
      previousMode: p.previousMode as ModeTransitionRecord["previousMode"],
      newMode: p.newMode as ModeTransitionRecord["newMode"],
      reason,
      actor: String(p.requestedBy ?? "unknown"),
      timestamp: String(p.timestamp),
      ledgerEntryRef: null,
    });
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
