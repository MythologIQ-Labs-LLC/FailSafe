// Functional tests for IdeActivityTracker (FX450) + ConfigurationProfile (FX461) + EmptyStates (FX463) + WebSocketManager (FX458).

import { strict as assert } from 'assert';
import { IdeActivityTracker } from '../../roadmap/services/IdeActivityTracker';
import { ConfigurationProfile } from '../../genesis/ConfigurationProfile';
import { renderEmptyState } from '../../genesis/EmptyStates';
import { WebSocketManager } from '../../roadmap/services/WebSocketManager';
import { EventBus } from '../../shared/EventBus';

suite('IdeActivityTracker (FX450)', () => {
  test('FX450 — initial state has no active tasks/debug sessions, phase from plan', () => {
    const bus = new EventBus();
    const t = new IdeActivityTracker(bus);
    const state = t.getRunState('Implement');
    assert.equal(state.currentPhase, 'Implement');
    assert.deepEqual(state.activeTasks, []);
    assert.deepEqual(state.activeDebugSessions, []);
  });

  test('FX450 — default phase is "Plan" when no plan phase provided', () => {
    const bus = new EventBus();
    const t = new IdeActivityTracker(bus);
    assert.equal(t.getRunState().currentPhase, 'Plan');
  });

  test('FX450 — ide.taskStarted event registers active task', () => {
    const bus = new EventBus();
    const t = new IdeActivityTracker(bus);
    bus.emit('ide.taskStarted' as never, { name: 'compile', group: 'build' });
    const state = t.getRunState();
    assert.equal(state.activeTasks.length, 1);
    assert.equal(state.activeTasks[0].name, 'compile');
    assert.equal(state.activeTasks[0].group, 'build');
  });

  test('FX450 — ide.taskEnded removes task by name', () => {
    const bus = new EventBus();
    const t = new IdeActivityTracker(bus);
    bus.emit('ide.taskStarted' as never, { name: 'compile' });
    bus.emit('ide.taskEnded' as never, { name: 'compile' });
    assert.equal(t.getRunState().activeTasks.length, 0);
  });

  test('FX450 — build task → currentPhase reflects "Build: <name>"', () => {
    const bus = new EventBus();
    const t = new IdeActivityTracker(bus);
    bus.emit('ide.taskStarted' as never, { name: 'webpack', group: 'build' });
    assert.equal(t.getRunState().currentPhase, 'Build: webpack');
  });

  test('FX450 — non-build task does NOT override phase', () => {
    const bus = new EventBus();
    const t = new IdeActivityTracker(bus);
    bus.emit('ide.taskStarted' as never, { name: 'test', group: 'test' });
    assert.equal(t.getRunState('Implement').currentPhase, 'Implement');
  });

  test('FX450 — debug session active → currentPhase reflects "Debug: <name>"', () => {
    const bus = new EventBus();
    const t = new IdeActivityTracker(bus);
    bus.emit('ide.debugStarted' as never, { name: 'run-tests', type: 'node' });
    assert.equal(t.getRunState().currentPhase, 'Debug: run-tests');
  });

  test('FX450 — debug session takes priority over build task', () => {
    const bus = new EventBus();
    const t = new IdeActivityTracker(bus);
    bus.emit('ide.taskStarted' as never, { name: 'webpack', group: 'build' });
    bus.emit('ide.debugStarted' as never, { name: 'run-tests', type: 'node' });
    assert.equal(t.getRunState().currentPhase, 'Debug: run-tests');
  });

  test('FX450 — ide.debugEnded removes debug session', () => {
    const bus = new EventBus();
    const t = new IdeActivityTracker(bus);
    bus.emit('ide.debugStarted' as never, { name: 'd1', type: 'node' });
    bus.emit('ide.debugEnded' as never, { name: 'd1' });
    assert.equal(t.getRunState().activeDebugSessions.length, 0);
  });

  test('FX450 — events without name field are ignored', () => {
    const bus = new EventBus();
    const t = new IdeActivityTracker(bus);
    bus.emit('ide.taskStarted' as never, { group: 'build' }); // no name
    bus.emit('ide.taskStarted' as never, null);
    bus.emit('ide.debugStarted' as never, {}); // no name
    assert.equal(t.getRunState().activeTasks.length, 0);
    assert.equal(t.getRunState().activeDebugSessions.length, 0);
  });
});

suite('ConfigurationProfile (FX461)', () => {
  test('FX461 set + resolve — round-trip with explicit source', () => {
    const c = new ConfigurationProfile();
    c.set('theme', 'mythiq', 'user');
    assert.equal(c.resolve('theme'), 'mythiq');
  });

  test('FX461 resolve — unknown key returns empty string', () => {
    const c = new ConfigurationProfile();
    assert.equal(c.resolve('not-set'), '');
  });

  test('FX461 set — overrides existing entry', () => {
    const c = new ConfigurationProfile();
    c.set('foo', 'bar', 'user');
    c.set('foo', 'baz', 'workspace');
    assert.equal(c.resolve('foo'), 'baz');
  });

  test('FX461 getAll — returns all entries with source labels', () => {
    const c = new ConfigurationProfile();
    c.set('a', '1', 'default');
    c.set('b', '2', 'workspace');
    const all = c.getAll();
    assert.equal(all.length, 2);
    assert.deepEqual(all.find(e => e.key === 'a'), { key: 'a', value: '1', source: 'default' });
  });

  test('FX461 loadDefaults — only adds keys not already present', () => {
    const c = new ConfigurationProfile();
    c.set('a', 'user-value', 'user');
    c.loadDefaults({ a: 'default-value', b: 'default-b' });
    assert.equal(c.resolve('a'), 'user-value', 'existing user value preserved');
    assert.equal(c.resolve('b'), 'default-b', 'new default value added');
  });

  test('FX461 loadDefaults — assigns "default" source to new entries', () => {
    const c = new ConfigurationProfile();
    c.loadDefaults({ key: 'val' });
    assert.equal(c.getAll()[0].source, 'default');
  });
});

suite('EmptyStates (FX463)', () => {
  test('FX463 renderEmptyState — no-workspace produces HTML with title + back link', () => {
    const html = renderEmptyState('no-workspace');
    assert.match(html, /No Workspace/);
    assert.match(html, /Open a workspace folder/);
    assert.match(html, /\/console\/home/);
  });

  test('FX463 renderEmptyState — no-runs produces "No Plans"', () => {
    const html = renderEmptyState('no-runs');
    assert.match(html, /No Plans/);
    assert.match(html, /Create an intent/);
  });

  test('FX463 renderEmptyState — no-skills produces skill-registry message', () => {
    const html = renderEmptyState('no-skills');
    assert.match(html, /No Skills Installed/);
    assert.match(html, /skill registry/);
  });

  test('FX463 renderEmptyState — no-failures produces Shadow Genome message', () => {
    const html = renderEmptyState('no-failures');
    assert.match(html, /No Failures/);
    assert.match(html, /Shadow Genome/);
  });

  test('FX463 renderEmptyState — output is valid HTML5 with DOCTYPE', () => {
    const html = renderEmptyState('no-workspace');
    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /<\/html>$/);
  });
});

suite('WebSocketManager (FX458)', () => {
  test('FX458 broadcast — without setup is silent (no throw)', () => {
    const w = new WebSocketManager();
    assert.doesNotThrow(() => w.broadcast({ type: 'test' }));
  });

  test('FX458 close — without setup is silent (no throw)', () => {
    const w = new WebSocketManager();
    assert.doesNotThrow(() => w.close());
  });

  test('FX458 close — after setup unsets internal wss', () => {
    const w = new WebSocketManager();
    // Simulate setup having occurred via a fake server (we don't actually start one)
    (w as any).wss = { close: () => {}, clients: new Set() };
    w.close();
    assert.equal((w as any).wss, null);
  });

  test('FX458 broadcast — JSON-serializes payload + sends to OPEN clients only', () => {
    const w = new WebSocketManager();
    const sent: string[] = [];
    const openClient = { readyState: 1 /* OPEN */, send: (m: string) => sent.push(m) };
    const closedClient = { readyState: 3 /* CLOSED */, send: (m: string) => sent.push('CLOSED-' + m) };
    (w as any).wss = { clients: new Set([openClient, closedClient]) };
    w.broadcast({ type: 'event', value: 42 });
    assert.equal(sent.length, 1, 'only OPEN client receives message');
    assert.deepEqual(JSON.parse(sent[0]), { type: 'event', value: 42 });
  });
});
