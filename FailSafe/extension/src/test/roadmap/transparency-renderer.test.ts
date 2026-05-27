import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { TransparencyRenderer } from '../../../src/roadmap/ui/modules/transparency.js';

function setupDom(url = 'http://localhost/command-center.html#governance:audit') {
  const dom = new JSDOM('<!DOCTYPE html><div id="audit-root"></div>', { url });
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  (globalThis as { CSS?: unknown }).CSS = dom.window.CSS;
  return {
    container: dom.window.document.getElementById('audit-root')!,
    restore: () => {
      (globalThis as { document?: unknown }).document = undefined;
      (globalThis as { window?: unknown }).window = undefined;
      (globalThis as { CSS?: unknown }).CSS = undefined;
    },
  };
}

suite('TransparencyRenderer verdict records', () => {
  test('sentinel verdict summary names decision, risk, and subject', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({
        type: 'sentinel.verdict',
        payload: {
          type: 'sentinel.verdict',
          decision: 'WARN',
          riskGrade: 'L2',
          filePath: 'src/example.ts',
          timestamp: '2026-05-27T19:37:56.730Z',
        },
      });
      const card = container.querySelector('.cc-transparency-record');
      assert.ok(card, 'expected a rendered transparency record');
      assert.match(card!.textContent || '', /Sentinel WARN/);
      assert.match(card!.textContent || '', /L2/);
      assert.match(card!.textContent || '', /src\/example\.ts/);
      assert.equal(card!.getAttribute('data-event-ts'), '2026-05-27T19:37:56.730Z');
    } finally { restore(); }
  });

  test('verdict deep link highlights the matching transparency row', () => {
    const url = 'http://localhost/command-center.html#governance:audit?verdict=2026-05-27T19%3A37%3A56.730Z';
    const { container, restore } = setupDom(url);
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({
        type: 'sentinel.verdict',
        payload: {
          decision: 'BLOCK',
          riskGrade: 'L3',
          timestamp: '2026-05-27T19:37:56.730Z',
        },
      });
      const card = container.querySelector('[data-event-ts="2026-05-27T19:37:56.730Z"]');
      assert.equal(card!.classList.contains('cc-verdict--highlighted'), true);
    } finally { restore(); }
  });

  test('audit id deep link filters out non-matching records', () => {
    const url = 'http://localhost/command-center.html#governance:audit?id=evt-2';
    const { container, restore } = setupDom(url);
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({ type: 'sentinel.verdict', payload: { id: 'evt-1', decision: 'WARN' } });
      renderer.onEvent({ type: 'sentinel.verdict', payload: { id: 'evt-2', decision: 'BLOCK' } });
      const cards = container.querySelectorAll('.cc-transparency-record');
      assert.equal(cards.length, 1);
      assert.equal(cards[0].getAttribute('data-event-id'), 'evt-2');
      assert.equal(cards[0].classList.contains('cc-verdict--highlighted'), true);
    } finally { restore(); }
  });
});
