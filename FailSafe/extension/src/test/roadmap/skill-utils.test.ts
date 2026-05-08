// Functional tests for skill-utils UI module (escHtml + displayTag + skillTags).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  escHtml,
  displayTag,
  skillTags,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/skill-utils.js';

function setupDom() {
  const dom = new JSDOM();
  (globalThis as { document?: unknown }).document = dom.window.document;
  return () => { (globalThis as { document?: unknown }).document = undefined; };
}

suite('skill-utils (UI)', () => {
  let restore: () => void;
  setup(() => { restore = setupDom(); });
  teardown(() => { restore(); });

  test('escHtml — escapes the 5 HTML-significant characters', () => {
    assert.equal(escHtml('<'), '&lt;');
    assert.equal(escHtml('>'), '&gt;');
    assert.equal(escHtml('&'), '&amp;');
    // textContent does not encode quote marks; only structural chars
  });

  test('escHtml — neutralizes a script-injection payload', () => {
    const out = escHtml('<script>alert(1)</script>');
    assert.ok(!out.includes('<script>'));
    assert.match(out, /&lt;script&gt;/);
  });

  test('escHtml — coerces numeric input via textContent', () => {
    assert.equal(escHtml(42), '42');
  });

  test('escHtml — null/undefined become empty string (textContent semantics)', () => {
    // textContent assignment of null/undefined yields empty content, not literal "null".
    assert.equal(escHtml(null), '');
    assert.equal(escHtml(undefined), '');
  });

  test('displayTag — converts slug to title case', () => {
    assert.equal(displayTag('foo-bar'), 'Foo Bar');
    assert.equal(displayTag('hello_world'), 'Hello World');
    assert.equal(displayTag('multi-word_slug'), 'Multi Word Slug');
  });

  test('displayTag — empty/null returns empty string', () => {
    assert.equal(displayTag(''), '');
    assert.equal(displayTag(null), '');
    assert.equal(displayTag(undefined), '');
  });

  test('displayTag — single-word tag titlecases', () => {
    assert.equal(displayTag('alpha'), 'Alpha');
  });

  test('skillTags — empty skill returns empty array', () => {
    assert.deepEqual(skillTags({}), []);
    assert.deepEqual(skillTags(null), []);
  });

  test('skillTags — tags array is normalized to lowercase + dash-separated', () => {
    const tags = skillTags({ tags: ['Foo Bar', 'BAZ', 'Qux'] });
    assert.deepEqual(tags.sort(), ['baz', 'foo-bar', 'qux']);
  });

  test('skillTags — category appended as fallback tag', () => {
    const tags = skillTags({ tags: ['security'], category: 'governance' });
    assert.deepEqual(tags.sort(), ['governance', 'security']);
  });

  test('skillTags — duplicate values are deduped', () => {
    const tags = skillTags({ tags: ['security', 'Security', 'security'] });
    assert.deepEqual(tags, ['security']);
  });

  test('skillTags — "general" tag is filtered out', () => {
    const tags = skillTags({ tags: ['security', 'general'] });
    assert.deepEqual(tags, ['security']);
  });

  test('skillTags — empty strings are filtered out', () => {
    const tags = skillTags({ tags: ['', '  ', 'real'] });
    assert.deepEqual(tags, ['real']);
  });

  test('skillTags — internal whitespace becomes dashes', () => {
    const tags = skillTags({ tags: ['multi word tag'] });
    assert.deepEqual(tags, ['multi-word-tag']);
  });

  test('skillTags — non-array tags is treated as empty', () => {
    assert.deepEqual(skillTags({ tags: 'not-an-array', category: 'security' }), ['security']);
  });
});
