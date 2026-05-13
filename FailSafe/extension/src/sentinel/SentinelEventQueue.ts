/**
 * SentinelEventQueue - Priority queue for Sentinel events.
 *
 * Owns:
 * - In-memory event buffer.
 * - Priority sort (critical -> high -> normal -> low).
 * - Hard cap at MAX_QUEUE_DEPTH (100) — overflow drops the lowest-priority
 *   tail so critical events never lose their slot.
 *
 * Extracted from SentinelDaemon as part of Phase 60 Section 4 Razor
 * refactor. Behaviour is preserved: same sort order, same cap, same
 * single-event dequeue semantics consumed by the processing loop.
 */
import { SentinelEvent } from '../shared/types';

export const MAX_QUEUE_DEPTH = 100;

const PRIORITY_ORDER: Record<SentinelEvent['priority'], number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3
};

export class SentinelEventQueue {
    private readonly maxDepth: number;
    private events: SentinelEvent[] = [];

    constructor(maxDepth: number = MAX_QUEUE_DEPTH) {
        this.maxDepth = maxDepth;
    }

    /**
     * Insert an event, re-sort by priority, then trim to the cap.
     */
    enqueue(event: SentinelEvent): void {
        this.events.push(event);
        this.events.sort(comparePriority);
        if (this.events.length > this.maxDepth) {
            this.events = this.events.slice(0, this.maxDepth);
        }
    }

    /**
     * Remove and return the highest-priority event, or undefined when empty.
     */
    dequeue(): SentinelEvent | undefined {
        return this.events.shift();
    }

    /**
     * Current depth, used for SentinelStatus.queueDepth.
     */
    size(): number {
        return this.events.length;
    }

    /**
     * True when no events are queued.
     */
    isEmpty(): boolean {
        return this.events.length === 0;
    }

    /**
     * Snapshot of the queue (defensive copy) for diagnostics or tests.
     */
    snapshot(): SentinelEvent[] {
        return [...this.events];
    }

    /**
     * Drop every queued event without dispatching. Used by stop().
     */
    clear(): void {
        this.events = [];
    }
}

function comparePriority(a: SentinelEvent, b: SentinelEvent): number {
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
}
