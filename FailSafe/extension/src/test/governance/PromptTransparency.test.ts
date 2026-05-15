// Functional tests for PromptTransparency + TransparencyLogger (FX305).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PromptTransparency, TransparencyLogger, type PromptEvent } from '../../governance/PromptTransparency';
import { EventBus } from '../../shared/EventBus';

function captureEvents(bus: EventBus): PromptEvent[] {
  const events: PromptEvent[] = [];
  // EventBus wraps payload as { type, timestamp, payload, seq } — unwrap to inner PromptEvent
  bus.on('transparency.prompt' as never, (wrapper: any) => events.push(wrapper.payload as PromptEvent));
  return events;
}

suite('PromptTransparency (FX305)', () => {
  test('FX305 emitBuildStarted — returns build id, emits event with sessionId/intentId/agentDid', () => {
    const bus = new EventBus();
    const events = captureEvents(bus);
    const t = new PromptTransparency(bus);
    const id = t.emitBuildStarted({ sessionId: 's1', intentId: 'i1', agentDid: 'did:t:a' });
    assert.match(id, /^prompt-/);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'prompt.build_started');
    assert.equal(events[0].sessionId, 's1');
    assert.equal(events[0].intentId, 'i1');
    assert.equal(events[0].agentDid, 'did:t:a');
  });

  test('FX305 emitBuildStarted — registers active build', () => {
    const t = new PromptTransparency(new EventBus());
    const id = t.emitBuildStarted({ sessionId: 's1' });
    assert.deepEqual(t.getActiveBuilds(), [id]);
  });

  test('FX305 emitBuildCompleted — emits with truncated promptPreview (<=200 chars)', () => {
    const bus = new EventBus();
    const events = captureEvents(bus);
    const t = new PromptTransparency(bus);
    const id = t.emitBuildStarted({ sessionId: 's1' });
    const longPrompt = 'A'.repeat(300);
    const e = t.emitBuildCompleted(id, { promptPreview: longPrompt, tokenCount: 50 });
    assert.equal(e.type, 'prompt.build_completed');
    assert.equal(e.promptPreview!.length, 200);
    assert.equal(e.tokenCount, 50);
    // Captured event matches returned event
    const completedEvent = events.find(x => x.type === 'prompt.build_completed')!;
    assert.equal(completedEvent.promptPreview!.length, 200);
  });

  test('FX305 emitBuildCompleted — populates promptHash (8-char hex)', () => {
    const t = new PromptTransparency(new EventBus());
    const id = t.emitBuildStarted({ sessionId: 's1' });
    const e = t.emitBuildCompleted(id, { promptPreview: 'hello world' });
    assert.match(String(e.promptHash), /^[0-9a-f]{8}$/);
  });

  test('FX305 emitBuildCompleted — same prompt produces same hash', () => {
    const t = new PromptTransparency(new EventBus());
    const id1 = t.emitBuildStarted({});
    const e1 = t.emitBuildCompleted(id1, { promptPreview: 'same prompt content' });
    const id2 = t.emitBuildStarted({});
    const e2 = t.emitBuildCompleted(id2, { promptPreview: 'same prompt content' });
    assert.equal(e1.promptHash, e2.promptHash);
  });

  test('FX305 emitBuildCompleted — removes build from activeBuilds', () => {
    const t = new PromptTransparency(new EventBus());
    const id = t.emitBuildStarted({});
    t.emitBuildCompleted(id, { promptPreview: 'p' });
    assert.deepEqual(t.getActiveBuilds(), []);
  });

  test('FX305 emitBuildCompleted — duration computed from build start', async () => {
    const t = new PromptTransparency(new EventBus());
    const id = t.emitBuildStarted({});
    await new Promise(r => setTimeout(r, 30));
    const e = t.emitBuildCompleted(id, { promptPreview: 'p' });
    assert.ok(typeof e.duration === 'number' && e.duration >= 25, `duration ${e.duration} should be >= 25ms`);
  });

  test('FX305 emitDispatched — emits dispatched event with promptHash + targetModel', () => {
    const bus = new EventBus();
    const events = captureEvents(bus);
    const t = new PromptTransparency(bus);
    const id = t.emitBuildStarted({ sessionId: 's1' });
    const e = t.emitDispatched(id, { promptHash: 'aabbccdd', targetModel: 'claude-opus' });
    assert.equal(e.type, 'prompt.dispatched');
    assert.equal(e.promptHash, 'aabbccdd');
    assert.equal(e.targetModel, 'claude-opus');
    assert.equal(events.find(x => x.type === 'prompt.dispatched')!.promptHash, 'aabbccdd');
  });

  test('FX305 emitDispatched — clears active build', () => {
    const t = new PromptTransparency(new EventBus());
    const id = t.emitBuildStarted({});
    t.emitDispatched(id, { promptHash: 'x' });
    assert.deepEqual(t.getActiveBuilds(), []);
  });

  test('FX305 emitDispatchBlocked — emits with reason + riskGrade', () => {
    const bus = new EventBus();
    const events = captureEvents(bus);
    const t = new PromptTransparency(bus);
    const id = t.emitBuildStarted({ sessionId: 's1' });
    const e = t.emitDispatchBlocked(id, { blockedReason: 'policy violation', riskGrade: 'L3' });
    assert.equal(e.type, 'prompt.dispatch_blocked');
    assert.equal(e.blockedReason, 'policy violation');
    assert.equal(e.riskGrade, 'L3');
    assert.ok(events.some(x => x.type === 'prompt.dispatch_blocked' && x.blockedReason === 'policy violation'));
  });

  test('FX305 clearStaleBuilds — removes builds older than timeout', async () => {
    const t = new PromptTransparency(new EventBus());
    t.emitBuildStarted({ sessionId: 's1' });
    await new Promise(r => setTimeout(r, 30));
    const cleared = t.clearStaleBuilds(20);
    assert.equal(cleared, 1);
    assert.deepEqual(t.getActiveBuilds(), []);
  });

  test('FX305 clearStaleBuilds — keeps builds newer than timeout', () => {
    const t = new PromptTransparency(new EventBus());
    t.emitBuildStarted({});
    const cleared = t.clearStaleBuilds(60000);
    assert.equal(cleared, 0);
    assert.equal(t.getActiveBuilds().length, 1);
  });
});

suite('TransparencyLogger (FX305)', () => {
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tlog-')); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX305 TransparencyLogger — log + readRecentEvents round-trip', () => {
    const l = new TransparencyLogger(dir);
    const e1: PromptEvent = { id: 'p1', type: 'prompt.build_started', timestamp: '2026-05-07T00:00:00Z' };
    const e2: PromptEvent = { id: 'p2', type: 'prompt.dispatched', timestamp: '2026-05-07T00:00:01Z' };
    l.log(e1);
    l.log(e2);
    const recent = l.readRecentEvents();
    assert.equal(recent.length, 2);
    // Most recent first
    assert.equal(recent[0].id, 'p2');
    assert.equal(recent[1].id, 'p1');
  });

  test('FX305 TransparencyLogger — readRecentEvents on missing file → []', () => {
    const l = new TransparencyLogger(dir);
    assert.deepEqual(l.readRecentEvents(), []);
  });

  test('FX305 TransparencyLogger — limit returns most recent N', () => {
    const l = new TransparencyLogger(dir);
    for (let i = 0; i < 10; i++) {
      l.log({ id: `p${i}`, type: 'prompt.build_started', timestamp: new Date(i).toISOString() });
    }
    const recent = l.readRecentEvents(3);
    assert.equal(recent.length, 3);
    assert.equal(recent[0].id, 'p9');
    assert.equal(recent[1].id, 'p8');
    assert.equal(recent[2].id, 'p7');
  });
});
