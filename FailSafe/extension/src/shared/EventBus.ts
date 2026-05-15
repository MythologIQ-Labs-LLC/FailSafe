/**
 * EventBus - Inter-component communication for FailSafe
 *
 * Enables loose coupling between Genesis, QorLogic, and Sentinel
 * components through a publish-subscribe pattern.
 */

import { FailSafeEvent, FailSafeEventType } from "./types";

type EventCallback<T = unknown> = (event: FailSafeEvent<T>) => void;

export class EventBus {
  private listeners: Map<FailSafeEventType, Set<EventCallback>> = new Map();
  private allListeners: Set<EventCallback> = new Set();
  private eventHistory: (FailSafeEvent & { seq: number })[] = [];
  private maxHistorySize = 1000;
  private sequenceNumber = 0;
  private isDisposed = false;

  /**
   * Subscribe to a specific event type
   */
  on<T = unknown>(
    eventType: FailSafeEventType,
    callback: EventCallback<T>,
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback as EventCallback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback as EventCallback);
    };
  }

  /**
   * Subscribe to all events
   */
  onAll(callback: EventCallback): () => void {
    this.allListeners.add(callback);
    return () => {
      this.allListeners.delete(callback);
    };
  }

  /**
   * Subscribe to an event type, but only trigger once
   */
  once<T = unknown>(
    eventType: FailSafeEventType,
    callback: EventCallback<T>,
  ): () => void {
    const wrappedCallback: EventCallback<T> = (event) => {
      callback(event);
      this.listeners.get(eventType)?.delete(wrappedCallback as EventCallback);
    };

    return this.on(eventType, wrappedCallback);
  }

  /**
   * Emit an event to all subscribers
   */
  emit<T = unknown>(eventType: FailSafeEventType, payload: T): void {
    if (this.isDisposed) return;
    this.sequenceNumber++;
    const event: FailSafeEvent<T> & { seq: number } = {
      type: eventType,
      timestamp: new Date().toISOString(),
      payload,
      seq: this.sequenceNumber,
    };

    // Store in history
    this.eventHistory.push(event as FailSafeEvent & { seq: number });
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify specific listeners
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event as FailSafeEvent);
        } catch (error) {
          console.error(`EventBus: Error in listener for ${eventType}:`, error);
        }
      }
    }

    // Notify all-event listeners
    for (const callback of this.allListeners) {
      try {
        callback(event as FailSafeEvent);
      } catch (error) {
        console.error(`EventBus: Error in all-event listener:`, error);
      }
    }
  }

  /**
   * Get event history for SSE reconnection recovery ONLY.
   * Do NOT use this method to derive application state.
   * All durable state must be read from its single source of truth
   * (checkpoint DB, ledger DB, trust engine, etc.).
   */
  getHistory(eventType?: FailSafeEventType, limit?: number): FailSafeEvent[] {
    let history = eventType
      ? this.eventHistory.filter((e) => e.type === eventType)
      : [...this.eventHistory];

    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * Get events after a specific sequence number (for SSE reconnection)
   */
  getHistorySince(sinceSeq: number): (FailSafeEvent & { seq: number })[] {
    return this.eventHistory.filter((e) => e.seq > sinceSeq);
  }

  /**
   * Get the current sequence number
   */
  getSequenceNumber(): number {
    return this.sequenceNumber;
  }

  /**
   * Clear all listeners and history
   */
  dispose(): void {
    this.listeners.clear();
    this.allListeners.clear();
    this.eventHistory = [];
    this.isDisposed = true;
  }
}
