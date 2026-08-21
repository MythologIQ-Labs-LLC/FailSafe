import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { TransparencyRenderer } from '../../../src/roadmap/ui/modules/transparency.js';
// @ts-expect-error JS module import in TS test context
import { resetDeepLinkFocusLatch } from '../../../src/roadmap/ui/modules/transparency-records.js';

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

  test('FX917 deep-link landing — focus moves to the matched record exactly once', () => {
    resetDeepLinkFocusLatch();
    const ts = new Date().toISOString();
    const url = `http://localhost/command-center.html#governance:audit?verdict=${encodeURIComponent(ts)}`;
    const { container, restore } = setupDom(url);
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({ type: 'sentinel.verdict', payload: { decision: 'WARN', riskGrade: 'L2', timestamp: ts } });
      const row = container.querySelector(`[data-event-ts="${ts}"]`) as HTMLElement;
      assert.ok(row, 'matched record renders');
      assert.equal(row.getAttribute('tabindex'), '-1', 'record must be programmatically focusable');
      assert.equal((globalThis as any).document.activeElement, row,
        'keyboard/AT users must land focused on the deep-linked verdict');
    } finally { restore(); }
  });

  test('FX917 no-re-steal (VETO #554 F1) — a later live append does not re-steal focus', () => {
    resetDeepLinkFocusLatch();
    const ts = new Date().toISOString();
    const url = `http://localhost/command-center.html#governance:audit?verdict=${encodeURIComponent(ts)}`;
    const { container, restore } = setupDom(url);
    try {
      const doc = (globalThis as any).document;
      const park = doc.createElement('button');
      doc.body.appendChild(park);
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({ type: 'sentinel.verdict', payload: { decision: 'WARN', riskGrade: 'L2', timestamp: ts } });
      assert.equal(doc.activeElement?.getAttribute?.('data-event-ts'), ts, 'first landing focuses the record');
      park.focus();
      assert.equal(doc.activeElement, park, 'user moved focus to the park element');
      renderer.onEvent({ type: 'sentinel.verdict', payload: { decision: 'PASS', riskGrade: 'L1', timestamp: new Date(Date.now() + 1000).toISOString() } });
      assert.equal(doc.activeElement, park,
        'a live event re-running the highlighter must NOT re-steal focus');
    } finally { restore(); }
  });

  test('FX917 latch survives element recreation — refilter rebuild does not re-steal focus', () => {
    resetDeepLinkFocusLatch();
    const ts = new Date().toISOString();
    const url = `http://localhost/command-center.html#governance:audit?verdict=${encodeURIComponent(ts)}`;
    const { container, restore } = setupDom(url);
    try {
      const doc = (globalThis as any).document;
      const park = doc.createElement('button');
      doc.body.appendChild(park);
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({ type: 'sentinel.verdict', payload: { decision: 'WARN', riskGrade: 'L2', timestamp: ts } });
      park.focus();
      renderer.refilter(); // destroys + recreates every card element
      renderer.onEvent({ type: 'sentinel.verdict', payload: { decision: 'PASS', riskGrade: 'L1', timestamp: new Date(Date.now() + 2000).toISOString() } });
      assert.equal(doc.activeElement, park,
        'element recreation must not reset the one-shot latch (module-state, not element-attached)');
    } finally { restore(); }
  });

  test('FX917 latch is target-keyed — a hashchange to a NEW target focuses once', () => {
    resetDeepLinkFocusLatch();
    const tsA = new Date().toISOString();
    const tsB = new Date(Date.now() + 5000).toISOString();
    const url = `http://localhost/command-center.html#governance:audit?verdict=${encodeURIComponent(tsA)}`;
    const { container, restore } = setupDom(url);
    try {
      const doc = (globalThis as any).document;
      const win = (globalThis as any).window;
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({ type: 'sentinel.verdict', payload: { decision: 'WARN', riskGrade: 'L2', timestamp: tsA } });
      assert.equal(doc.activeElement?.getAttribute?.('data-event-ts'), tsA, 'target A focused');
      win.location.hash = `#governance:audit?verdict=${encodeURIComponent(tsB)}`;
      renderer.onEvent({ type: 'sentinel.verdict', payload: { decision: 'BLOCK', riskGrade: 'L3', timestamp: tsB } });
      assert.equal(doc.activeElement?.getAttribute?.('data-event-ts'), tsB,
        'a new deep-link target must receive focus (a global-boolean latch fails this)');
    } finally { restore(); }
  });

  test('FX917 re-anchor — a destructive re-render with idle focus re-focuses the recreated row', () => {
    resetDeepLinkFocusLatch();
    const ts = new Date().toISOString();
    const url = `http://localhost/command-center.html#governance:audit?verdict=${encodeURIComponent(ts)}`;
    const { container, restore } = setupDom(url);
    try {
      const doc = (globalThis as any).document;
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({ type: 'sentinel.verdict', payload: { decision: 'WARN', riskGrade: 'L2', timestamp: ts } });
      assert.equal(doc.activeElement?.getAttribute?.('data-event-ts'), ts, 'first landing focuses the record');
      // Console boot path: a full render() rebuilds the container (innerHTML),
      // destroying the focused row while nothing else holds focus.
      renderer.render();
      const recreated = container.querySelector(`[data-event-ts="${ts}"]`) as HTMLElement;
      assert.ok(recreated, 'row recreated by the rebuild');
      assert.equal(doc.activeElement, recreated,
        'idle focus + destroyed row must re-anchor to the recreated record (audit #556)');
    } finally { restore(); }
  });

  test('FX917 no match — focus is untouched', () => {
    resetDeepLinkFocusLatch();
    const url = `http://localhost/command-center.html#governance:audit?verdict=${encodeURIComponent('2020-01-01T00:00:00.000Z')}`;
    const { container, restore } = setupDom(url);
    try {
      const doc = (globalThis as any).document;
      const before = doc.activeElement;
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({ type: 'sentinel.verdict', payload: { decision: 'WARN', riskGrade: 'L2', timestamp: new Date().toISOString() } });
      assert.equal(doc.activeElement, before, 'no focus theft on a missed deep link');
    } finally { restore(); }
  });

  test('FX916 non-today verdict deep link bypasses the default date filter and highlights', () => {
    const today = new Date();
    const yesterdayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12, 0, 0);
    const ts = yesterdayNoon.toISOString();
    const url = `http://localhost/command-center.html#governance:audit?verdict=${encodeURIComponent(ts)}`;
    const { container, restore } = setupDom(url);
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render(); // bindDateFilters defaults from/to to today-local bounds
      renderer.onEvent({
        type: 'sentinel.verdict',
        payload: { decision: 'WARN', riskGrade: 'L2', timestamp: ts },
      });
      const card = container.querySelector(`[data-event-ts="${ts}"]`);
      assert.ok(card, 'a deep-linked verdict from yesterday must render despite the default today filter');
      assert.equal(card!.classList.contains('cc-verdict--highlighted'), true,
        'and must be highlighted as the deep-link target');
    } finally { restore(); }
  });

  test('FX920/N5 — activating a filter chip preserves the focused element (in-place update)', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      const bar = container.querySelector('.cc-filter-bar')!;
      const chips = Array.from(bar.querySelectorAll('.cc-chip')) as HTMLElement[];
      assert.ok(chips.length > 1, 'precondition: multiple category chips');
      const target = chips[1];
      // Keyboard semantics: Enter on a focused button fires click.
      target.focus();
      target.click();
      assert.equal((globalThis as any).document.activeElement, target,
        'the focused chip must survive selection by OBJECT IDENTITY (pre-fix: innerHTML rebuild destroys it, focus falls to body)');
      assert.ok(target.classList.contains('active'), 'active class moved to the selected chip');
    } finally { restore(); }
  });

  test('FX920/N5 — chip nodes are stable across selections (no rebuild after first paint)', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      const bar = container.querySelector('.cc-filter-bar')!;
      const before = Array.from(bar.querySelectorAll('.cc-chip'));
      (before[1] as HTMLElement).click();
      (before[2] as HTMLElement).click();
      const after = Array.from(bar.querySelectorAll('.cc-chip'));
      assert.equal(before.length, after.length);
      before.forEach((node, i) => assert.equal(node, after[i], `chip ${i} must be the same node`));
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

// ── Audit Log verdict signal (plan-audit-log-verdict-signal) ──────────────────
// Enriched summary line + severity triage filter. Operator ruling: every
// exposed data point must answer "how is this helping me?" — a WARN record
// must say what, where, and why; triage needs pass-noise suppression.

function emitVerdict(renderer: any, overrides: Record<string, unknown> = {}) {
  renderer.onEvent({
    type: 'sentinel.verdict',
    payload: {
      type: 'sentinel.verdict', decision: 'WARN', riskGrade: 'L1',
      timestamp: new Date().toISOString(), ...overrides,
    },
  });
}

suite('Audit Log verdict signal — enriched summary line', () => {
  test('enriched payload renders file, summary sentence, and matched patterns in the card line', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      emitVerdict(renderer, {
        filePath: 'src/auth/session.ts',
        summary: '1 issue(s) detected - review recommended',
        matchedPatterns: ['hardcoded-credential', 'weak-hash'],
      });
      const line = container.querySelector('.cc-transparency-record')!.textContent || '';
      assert.match(line, /Sentinel WARN L1 - src\/auth\/session\.ts/);
      assert.match(line, /1 issue\(s\) detected - review recommended/);
      assert.match(line, /hardcoded-credential, weak-hash/);
    } finally { restore(); }
  });

  test('A7: without a filePath the summary serves as subject and is NOT duplicated into the reason', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      emitVerdict(renderer, {
        summary: '1 issue(s) detected - review recommended',
        matchedPatterns: ['hardcoded-credential'],
      });
      // Scope to the summary LINE: the expanded <pre> JSON detail legitimately
      // repeats every payload field — the dedup contract is about the line.
      const card = container.querySelector('.cc-transparency-record')!.cloneNode(true) as HTMLElement;
      card.querySelector('pre')?.remove();
      const line = card.textContent || '';
      const occurrences = line.split('1 issue(s) detected - review recommended').length - 1;
      assert.equal(occurrences, 1, `summary must appear exactly once in the line; got '${line}'`);
      assert.match(line, /hardcoded-credential/);
    } finally { restore(); }
  });

  test('legacy thin payload renders byte-identically to the pre-enrichment line (no throw, no reason)', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      emitVerdict(renderer, { filePath: 'src/x.ts' });
      const line = container.querySelector('.cc-transparency-record')!.textContent || '';
      assert.match(line, /Sentinel WARN L1 - src\/x\.ts/);
      assert.ok(!line.includes('('), `thin payload must not grow an empty reason; got '${line}'`);
    } finally { restore(); }
  });
});

suite('Audit Log severity triage filter', () => {
  function seedMixed(renderer: any) {
    emitVerdict(renderer, { decision: 'PASS', riskGrade: 'L1', filePath: 'src/ok.ts', timestamp: '2026-08-20T10:00:00.000Z' });
    emitVerdict(renderer, { decision: 'WARN', riskGrade: 'L1', filePath: 'src/warn.ts', timestamp: '2026-08-20T10:01:00.000Z' });
    emitVerdict(renderer, { decision: 'BLOCK', riskGrade: 'L3', filePath: 'src/block.ts', timestamp: '2026-08-20T10:02:00.000Z' });
  }
  function visibleFiles(container: Element): string[] {
    return Array.from(container.querySelectorAll('.cc-transparency-record'))
      .map(c => (c.textContent || '').match(/src\/\w+\.ts/)?.[0] || '');
  }
  function clickLevel(container: Element, label: string) {
    const chip = Array.from(container.querySelectorAll('.cc-chip'))
      .find(c => (c as HTMLElement).dataset.lvl && c.textContent === label) as HTMLElement;
    assert.ok(chip, `severity chip '${label}' must exist`);
    chip.click();
  }

  test('severity chips render as a second chip row (All levels / Issues / Warn / Block)', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      const labels = Array.from(container.querySelectorAll('.cc-chip[data-lvl]')).map(c => c.textContent);
      assert.deepEqual(labels, ['All levels', 'Issues', 'Warn', 'Block']);
    } finally { restore(); }
  });

  test('Issues hides pass records and keeps warn + violation', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      seedMixed(renderer);
      clickLevel(container, 'Issues');
      // refilter() renders newest-first — assert membership, not order.
      assert.deepEqual(visibleFiles(container).sort(), ['src/block.ts', 'src/warn.ts']);
    } finally { restore(); }
  });

  test('Warn and Block isolate their own levels', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      seedMixed(renderer);
      clickLevel(container, 'Warn');
      assert.deepEqual(visibleFiles(container), ['src/warn.ts']);
      clickLevel(container, 'Block');
      assert.deepEqual(visibleFiles(container), ['src/block.ts']);
      clickLevel(container, 'All levels');
      assert.equal(visibleFiles(container).length, 3);
    } finally { restore(); }
  });

  test('A9: a deep-linked record bypasses the severity filter (real location hash, no stubbing)', () => {
    const ts = '2026-08-20T10:01:00.000Z';
    const url = `http://localhost/command-center.html#governance:audit?verdict=${encodeURIComponent(ts)}`;
    const { container, restore } = setupDom(url);
    try {
      resetDeepLinkFocusLatch();
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.activeLevel = 'Block';
      seedMixed(renderer);
      const files = visibleFiles(container);
      assert.ok(files.includes('src/warn.ts'),
        'the deep-linked WARN record must render even while the Block severity filter is active');
    } finally { restore(); }
  });

  test('A8: live-envelope-shaped entries (type transparency, decision in payload) match severity chips', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      renderer.onEvent({ type: 'transparency', payload: {
        type: 'sentinel.verdict', decision: 'WARN', riskGrade: 'L1',
        filePath: 'src/live.ts', timestamp: '2026-08-20T11:00:00.000Z',
      } });
      clickLevel(container, 'Issues');
      assert.ok(visibleFiles(container).includes('src/live.ts'),
        'live-streamed WARN must survive the Issues filter (recordLevel is envelope-agnostic)');
      clickLevel(container, 'Block');
      assert.equal(visibleFiles(container).length, 0);
    } finally { restore(); }
  });

  test('FX920 parity: severity chip element survives selection (in-place toggle, no rebuild)', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new TransparencyRenderer('audit-root');
      renderer.render();
      const chip = Array.from(container.querySelectorAll('.cc-chip[data-lvl]'))
        .find(c => c.textContent === 'Issues') as HTMLElement;
      chip.click();
      assert.ok(chip.isConnected, 'the clicked chip must survive selection');
      assert.ok(chip.classList.contains('active'));
    } finally { restore(); }
  });
});
