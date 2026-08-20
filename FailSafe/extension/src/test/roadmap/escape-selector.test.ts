// #360 — shared attribute-selector value escaping (escapeSelectorValue).
// Extracted from the CodeQL-remediated inline fallback in roadmap.js (PR #359
// alert 33) so governance.js and transparency-records.js stop carrying the
// incomplete quote-only variant. CSS.escape is authoritative when present; the
// fallback exists for CSS-less DOM shims and must stay selector-safe on its own.

import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { escapeSelectorValue } from '../../../src/roadmap/ui/modules/escape-selector.js';
import { JSDOM } from 'jsdom';

suite('escapeSelectorValue (#360)', () => {
  const savedCSS = (globalThis as { CSS?: unknown }).CSS;
  teardown(() => { (globalThis as { CSS?: unknown }).CSS = savedCSS; });

  test('delegates to CSS.escape when available', () => {
    let seen: string | null = null;
    (globalThis as { CSS?: unknown }).CSS = {
      escape: (v: string) => { seen = v; return 'ESCAPED'; },
    };
    assert.equal(escapeSelectorValue('a"b'), 'ESCAPED');
    assert.equal(seen, 'a"b');
  });

  suite('fallback arm (CSS global absent)', () => {
    setup(() => { (globalThis as { CSS?: unknown }).CSS = undefined; });

    function domWithId(id: string) {
      const dom = new JSDOM('<!DOCTYPE html><div id="host"></div>');
      const el = dom.window.document.createElement('div');
      el.setAttribute('data-alert-id', id);
      dom.window.document.getElementById('host')!.appendChild(el);
      return { dom, el };
    }

    test('backslash before quote — hostile trailing-backslash id cannot neutralize the quote escape', () => {
      const hostile = 'x\\"onmouseover="1';
      const { dom, el } = domWithId(hostile);
      const safe = escapeSelectorValue(hostile);
      const found = dom.window.document.querySelector(`[data-alert-id="${safe}"]`);
      assert.equal(found, el, 'escaped selector must match the exact hostile value');
    });

    test('quote-only and backslash-only inputs round-trip through querySelector', () => {
      for (const id of ['plain', 'has"quote', 'has\\backslash', 'ends\\']) {
        const { dom, el } = domWithId(id);
        const found = dom.window.document.querySelector(
          `[data-alert-id="${escapeSelectorValue(id)}"]`);
        assert.equal(found, el, `must match id '${id}'`);
      }
    });

    test('CSS newline characters cannot produce an unparseable selector (audit advisory 5)', () => {
      // Raw \n \r \f inside a quoted CSS string is a parse error — querySelector
      // throws SyntaxError instead of mis-matching. The fallback must keep the
      // selector syntactically valid even for these inputs.
      const dom = new JSDOM('<!DOCTYPE html><div id="host"></div>');
      for (const id of ['line\nbreak', 'car\rreturn', 'form\ffeed']) {
        const safe = escapeSelectorValue(id);
        assert.doesNotThrow(
          () => dom.window.document.querySelector(`[data-alert-id="${safe}"]`),
          `selector must stay parseable for ${JSON.stringify(id)}`);
      }
    });

    test('coerces non-string input like CSS.escape does', () => {
      const { dom, el } = domWithId('548');
      const found = dom.window.document.querySelector(
        `[data-alert-id="${escapeSelectorValue(548)}"]`);
      assert.equal(found, el);
    });
  });
});
