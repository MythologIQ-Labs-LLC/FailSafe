// B311 (plan-b311-b312 LD7, LD11): affected architecture decisions in the VS Code L3 panel.
//
// The HTML builder escapes each line (markup stays text) and omits the block without lines; the
// panel renders the queue at once, then once more with the block from a single describe call, and
// drops a result that arrives after the queue changed.

import { strict as assert } from 'assert';
import { buildL3ApprovalHtml } from '../../genesis/panels/l3ApprovalHtml';
import { L3ApprovalPanel } from '../../genesis/panels/L3ApprovalPanel';
import { EventBus } from '../../shared/EventBus';
import type { L3ApprovalRequest } from '../../shared/types';

const item = (id: string, filePath: string): L3ApprovalRequest => ({
  id, state: 'QUEUED', filePath, riskGrade: 'L3', agentDid: 'did:agent:x', agentTrust: 0.4, sentinelSummary: 's', flags: [],
  queuedAt: '2026-10-20T00:00:00.000Z', slaDeadline: '2026-10-20T00:10:00.000Z',
} as L3ApprovalRequest);

function fakePanel() {
  const panel = {
    webview: {
      html: '', cspSource: 'vscode-resource:',
      onDidReceiveMessage: () => ({ dispose() {} }),
    },
    onDidDispose: () => ({ dispose() {} }),
    reveal: () => undefined,
    dispose: () => undefined,
  };
  return panel;
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

suite('B311 L3 panel architecture lines', () => {
  test('the builder escapes each line and omits the block without lines', () => {
    const queue = [item('a', 'src/a.ts'), item('b', 'src/b.ts')];
    const opts = { nonce: 'n', cspSource: 'c', architecture: {
      a: ['src/a.ts: <b>runtime</b> (canonical, "runtime") docs/R.md, via contract', 'src/[U+202E]x.ts: rlo (canonical, "rlo") docs/X.md, via contract'],
    } } as Parameters<typeof buildL3ApprovalHtml>[1];
    const html = buildL3ApprovalHtml(queue, opts);
    assert.ok(html.includes('&lt;b&gt;runtime&lt;/b&gt;'), 'markup stays text');
    assert.ok(!html.includes('<b>runtime</b>'));
    assert.ok(html.includes('src/[U+202E]x.ts'));
    assert.equal((html.match(/class="item-architecture"/g) ?? []).length, 1, 'only the item with lines has the block');
    assert.ok(!buildL3ApprovalHtml(queue, { nonce: 'n', cspSource: 'c' }).includes('class="item-architecture"'));
  });

  test('the panel renders at once, then once with the block from one describe call', async () => {
    const queue = [item('a', 'src/a.ts'), item('b', 'src/b.ts')];
    const calls: string[][] = [];
    const describe = async (paths: string[]) => {
      calls.push(paths);
      await tick(30);
      return { lines: ['x'], byPath: { 'src/a.ts': ['src/a.ts: runtime (canonical, "runtime") docs/R.md, via contract'] } };
    };
    const panel = fakePanel();
    const Ctor = L3ApprovalPanel as unknown as new (p: unknown, q: unknown, b: EventBus, d: unknown) => L3ApprovalPanel;
    new Ctor(panel, { getL3Queue: () => queue, processL3Decision: async () => undefined }, new EventBus(), describe);
    assert.ok(!panel.webview.html.includes('class="item-architecture"'), 'first render has no block');
    await tick(80);
    assert.deepEqual(calls, [['src/a.ts', 'src/b.ts']], 'one describe call for the panel');
    assert.ok(panel.webview.html.includes('class="item-architecture"'));
    assert.ok(panel.webview.html.includes('runtime (canonical'));
  });

  test('a result that arrives after the queue changed is dropped; a throwing describe leaves the first render', async () => {
    let queue = [item('a', 'src/a.ts')];
    const bus = new EventBus();
    let first = true;
    const describe = async () => {
      const slow = first;
      first = false;
      await tick(slow ? 60 : 5);
      return { lines: ['x'], byPath: { 'src/a.ts': [slow ? 'STALE LINE' : 'FRESH LINE'] } };
    };
    const panel = fakePanel();
    const Ctor = L3ApprovalPanel as unknown as new (p: unknown, q: unknown, b: EventBus, d: unknown) => L3ApprovalPanel;
    new Ctor(panel, { getL3Queue: () => queue, processL3Decision: async () => undefined }, bus, describe);
    queue = [item('a', 'src/a.ts'), item('c', 'src/c.ts')];
    bus.emit('qorelogic.l3Queued' as never, {} as never);
    await tick(120);
    assert.ok(panel.webview.html.includes('FRESH LINE'));
    assert.ok(!panel.webview.html.includes('STALE LINE'), 'the stale result is dropped');

    // A rejecting describe is caught by the panel: the first render stays and nothing is left unhandled.
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      const p2 = fakePanel();
      new Ctor(p2, { getL3Queue: () => [item('a', 'src/a.ts')], processL3Decision: async () => undefined }, new EventBus(),
        async () => { throw new Error('boom'); });
      const firstHtml = p2.webview.html;
      await tick(40);
      assert.equal(p2.webview.html, firstHtml);
      assert.deepEqual(unhandled, [], 'no unhandled rejection');

      // A render that throws after describe answers is caught too.
      const p3 = fakePanel();
      let renders = 0;
      Object.defineProperty(p3.webview, 'html', {
        get: () => '', set: () => { renders += 1; if (renders > 1) throw new Error('render'); }, configurable: true,
      });
      new Ctor(p3, { getL3Queue: () => [item('a', 'src/a.ts')], processL3Decision: async () => undefined }, new EventBus(),
        async () => ({ lines: ['x'], byPath: { 'src/a.ts': ['src/a.ts: r (canonical, "r") docs/R.md, via contract'] } }));
      await tick(40);
      assert.equal(renders, 2);
      assert.deepEqual(unhandled, [], 'no unhandled rejection from the second render');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
