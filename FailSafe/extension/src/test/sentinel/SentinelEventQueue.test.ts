// Phase 60 Section 4 Razor — functional tests for SentinelEventQueue.
// Asserts priority sort order and the 100-event cap.

import { strict as assert } from 'assert';
import { SentinelEventQueue, MAX_QUEUE_DEPTH } from '../../sentinel/SentinelEventQueue';
import { SentinelEvent } from '../../shared/types';

function makeEvent(
    priority: SentinelEvent['priority'],
    id: string,
    type: SentinelEvent['type'] = 'FILE_MODIFIED'
): SentinelEvent {
    return {
        id,
        timestamp: new Date().toISOString(),
        priority,
        source: 'file_watcher',
        type,
        payload: { path: `src/${id}.ts` }
    };
}

suite('SentinelEventQueue (Phase 60)', () => {
    let queue: SentinelEventQueue;

    setup(() => {
        queue = new SentinelEventQueue();
    });

    test('starts empty', () => {
        assert.equal(queue.size(), 0);
        assert.equal(queue.isEmpty(), true);
        assert.equal(queue.dequeue(), undefined);
    });

    test('enqueue single event — size is 1', () => {
        queue.enqueue(makeEvent('normal', 'a'));
        assert.equal(queue.size(), 1);
        assert.equal(queue.isEmpty(), false);
    });

    test('dequeue returns and removes the event', () => {
        queue.enqueue(makeEvent('normal', 'a'));
        const popped = queue.dequeue();
        assert.equal(popped?.id, 'a');
        assert.equal(queue.size(), 0);
    });

    test('priority sort — critical drains before high before normal before low', () => {
        queue.enqueue(makeEvent('low', 'L1'));
        queue.enqueue(makeEvent('normal', 'N1'));
        queue.enqueue(makeEvent('high', 'H1'));
        queue.enqueue(makeEvent('critical', 'C1'));

        const order = [
            queue.dequeue()?.id,
            queue.dequeue()?.id,
            queue.dequeue()?.id,
            queue.dequeue()?.id
        ];
        assert.deepEqual(order, ['C1', 'H1', 'N1', 'L1']);
    });

    test('priority sort is stable within a tier (insertion order preserved)', () => {
        queue.enqueue(makeEvent('high', 'H1'));
        queue.enqueue(makeEvent('high', 'H2'));
        queue.enqueue(makeEvent('high', 'H3'));

        assert.equal(queue.dequeue()?.id, 'H1');
        assert.equal(queue.dequeue()?.id, 'H2');
        assert.equal(queue.dequeue()?.id, 'H3');
    });

    test('priority sort handles interleaved insertion deterministically', () => {
        queue.enqueue(makeEvent('normal', 'N1'));
        queue.enqueue(makeEvent('critical', 'C1'));
        queue.enqueue(makeEvent('low', 'L1'));
        queue.enqueue(makeEvent('critical', 'C2'));
        queue.enqueue(makeEvent('high', 'H1'));

        const order = [
            queue.dequeue()?.id,
            queue.dequeue()?.id,
            queue.dequeue()?.id,
            queue.dequeue()?.id,
            queue.dequeue()?.id
        ];
        // Critical first (both), then high, normal, low
        assert.equal(order[0], 'C1');
        assert.equal(order[1], 'C2');
        assert.equal(order[2], 'H1');
        assert.equal(order[3], 'N1');
        assert.equal(order[4], 'L1');
    });

    test('100-event cap — queue size never exceeds MAX_QUEUE_DEPTH', () => {
        assert.equal(MAX_QUEUE_DEPTH, 100);
        for (let i = 0; i < 150; i++) {
            queue.enqueue(makeEvent('normal', `n${i}`));
        }
        assert.equal(queue.size(), 100);
    });

    test('100-event cap — overflow drops the lowest priority tail', () => {
        // Fill with 100 low-priority events.
        for (let i = 0; i < 100; i++) {
            queue.enqueue(makeEvent('low', `L${i}`));
        }
        assert.equal(queue.size(), 100);

        // One critical event should bump out a low.
        queue.enqueue(makeEvent('critical', 'C1'));
        assert.equal(queue.size(), 100);
        assert.equal(queue.dequeue()?.id, 'C1');
        // Remaining 99 are all low-priority survivors.
        const remaining = queue.snapshot();
        assert.equal(remaining.length, 99);
        assert.ok(remaining.every(e => e.priority === 'low'));
    });

    test('100-event cap — bulk overflow keeps highest priorities', () => {
        // 100 low + 5 critical inserted after — criticals must survive.
        for (let i = 0; i < 100; i++) {
            queue.enqueue(makeEvent('low', `L${i}`));
        }
        for (let i = 0; i < 5; i++) {
            queue.enqueue(makeEvent('critical', `C${i}`));
        }
        assert.equal(queue.size(), 100);

        const drained: SentinelEvent[] = [];
        while (!queue.isEmpty()) {
            const e = queue.dequeue();
            if (e) {
                drained.push(e);
            }
        }
        // First 5 must be the criticals.
        assert.equal(drained.slice(0, 5).every(e => e.priority === 'critical'), true);
        // Remaining 95 are low.
        assert.equal(drained.slice(5).every(e => e.priority === 'low'), true);
    });

    test('snapshot — returns a defensive copy', () => {
        queue.enqueue(makeEvent('high', 'H1'));
        const snap = queue.snapshot();
        snap.pop();
        assert.equal(queue.size(), 1);
    });

    test('clear — drops every event', () => {
        queue.enqueue(makeEvent('critical', 'C1'));
        queue.enqueue(makeEvent('high', 'H1'));
        queue.clear();
        assert.equal(queue.size(), 0);
        assert.equal(queue.isEmpty(), true);
    });

    test('custom maxDepth honoured by constructor', () => {
        const tiny = new SentinelEventQueue(3);
        tiny.enqueue(makeEvent('low', 'L1'));
        tiny.enqueue(makeEvent('low', 'L2'));
        tiny.enqueue(makeEvent('low', 'L3'));
        tiny.enqueue(makeEvent('critical', 'C1'));
        assert.equal(tiny.size(), 3);
        assert.equal(tiny.dequeue()?.id, 'C1');
    });
});
