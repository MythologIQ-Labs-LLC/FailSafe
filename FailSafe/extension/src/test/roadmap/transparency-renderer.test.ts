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
      const ts = new Date().toISOString();
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({
        type: 'sentinel.verdict',
        payload: {
          type: 'sentinel.verdict',
          decision: 'WARN',
          riskGrade: 'L2',
          filePath: 'src/example.ts',
          timestamp: ts,
        },
      });
      const card = container.querySelector('.cc-transparency-record');
      assert.ok(card, 'expected a rendered transparency record');
      assert.match(card!.textContent || '', /Sentinel WARN/);
      assert.match(card!.textContent || '', /L2/);
      assert.match(card!.textContent || '', /src\/example\.ts/);
      assert.equal(card!.getAttribute('data-event-ts'), ts);
    } finally { restore(); }
  });

  test('verdict deep link highlights the matching transparency row', () => {
    const ts = new Date().toISOString();
    const url = `http://localhost/command-center.html#governance:audit?verdict=${encodeURIComponent(ts)}`;
    const { container, restore } = setupDom(url);
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({
        type: 'sentinel.verdict',
        payload: {
          decision: 'BLOCK',
          riskGrade: 'L3',
          timestamp: ts,
        },
      });
      const card = container.querySelector(`[data-event-ts="${ts}"]`);
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

  // qor-debug regression guard — the default date filter compared a UTC ISO
  // entry.time (with `Z`, ms precision) against LOCAL minute-precision bounds
  // using lexicographic string `<`/`>`. An event late in the local day (whose
  // UTC instant + ms precision pushes its string past the `T23:59` bound) was
  // wrongly filtered out. Deterministic across runner timezones: an event at
  // today-local 23:59:30 must render under the default today bounds.
  test('late-in-day event (UTC/precision edge) still renders under the default date filter', () => {
    const { container, restore } = setupDom();
    try {
      const today = new Date();
      // today-local 23:59:30 → toISOString() yields the matching UTC instant.
      const lateLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 30);
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render(); // bindDateFilters defaults from/to to today-local 00:00..23:59
      renderer.onEvent({
        type: 'sentinel.verdict',
        payload: { decision: 'WARN', riskGrade: 'L2', timestamp: lateLocal.toISOString() },
      });
      const card = container.querySelector('.cc-transparency-record');
      assert.ok(card, 'a 23:59:30 local event must pass the today date filter (epoch compare, inclusive minute)');
    } finally { restore(); }
  });
});
