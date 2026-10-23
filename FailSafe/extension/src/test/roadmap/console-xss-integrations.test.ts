// Lane E (plan-e-console-ui-xss) rows X16-X23 + X27: skills, install-skills
// modal/preview/picker, Bicameral card and marketplace sinks.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { SkillsRenderer } from '../../roadmap/ui/modules/skills.js';
// @ts-expect-error JS module import in TS test context
import { displayTag } from '../../roadmap/ui/modules/skill-utils.js';
// @ts-expect-error JS module import in TS test context
import { renderInstallModal } from '../../roadmap/ui/modules/install-skills-modal.js';
// @ts-expect-error JS module import in TS test context
import { renderPreviewButton, bindPreviewEvents } from '../../roadmap/ui/modules/install-skills-preview.js';
// @ts-expect-error JS module import in TS test context
import { renderPickerSection, bindPickerEvents } from '../../roadmap/ui/modules/install-skills-picker.js';
// @ts-expect-error JS module import in TS test context
import { renderRunning } from '../../roadmap/ui/modules/bicameral-card-render.js';
// @ts-expect-error JS module import in TS test context
import { MarketplaceRenderer } from '../../roadmap/ui/modules/marketplace.js';
import { TAG, DQ, JSURL, MARK, assertInert, installDom, settle } from './xssProbe';

// A SKILL.md category survives skillTags() (lower case, no whitespace) and,
// unescaped, would close data-tag/value and add its own handler.
const CATEGORY = `x"/onmouseenter=window.${MARK.toLowerCase()}=1/x="`;

suite('Lane E XSS: skills.js tag filter (X16-X17)', () => {
  let restore: () => void;
  let doc: Document;
  setup(() => {
    const env = installDom('<div id="skills"><div class="content"></div></div>');
    restore = env.restore;
    doc = env.dom.window.document;
  });
  teardown(() => restore());

  test('X16 tag suggestion: a hostile category round-trips through data-tag (S12)', async () => {
    const r = new SkillsRenderer('skills');
    r.skills = [{ id: 's1', name: 'S', description: 'd', tags: [], category: CATEGORY }];
    const content = doc.querySelector('.content')!;
    await r.renderSkillsView(content, {});
    const input = content.querySelector('.cc-tag-input') as HTMLInputElement;
    input.value = 'x';
    input.dispatchEvent(new (doc.defaultView as unknown as { Event: typeof Event }).Event('input'));
    const options = content.querySelectorAll('.cc-tag-option');
    assert.equal(options.length, 1, 'one suggestion for the hostile tag');
    assertInert(content, { allowOn: ['onmouseenter', 'onmouseleave'] });
    assert.equal(options[0].getAttribute('data-tag'), CATEGORY);
  });

  test('X17 active category chip: the selected hostile tag round-trips through value (S12)', () => {
    const r = new SkillsRenderer('skills');
    r.activeCat = CATEGORY;
    const host = doc.querySelector('.content')!;
    host.innerHTML = r.renderCategoryChips();
    assertInert(host);
    const input = host.querySelector('.cc-tag-input') as HTMLInputElement;
    assert.equal(input.value, displayTag(CATEGORY), 'the display-cased tag round-trips through value');
  });
});

suite('Lane E XSS: install skills modal, preview, picker (X18-X20)', () => {
  let restore: () => void;
  let doc: Document;
  setup(() => {
    const env = installDom('<div id="m"></div>');
    restore = env.restore;
    doc = env.dom.window.document;
  });
  teardown(() => restore());

  test('X18 host checkbox: a host-registry key round-trips through value (S13)', () => {
    const root = doc.getElementById('m')!;
    root.innerHTML = renderInstallModal([{ host: DQ, installed: false }], false);
    assertInert(root);
    assert.equal((root.querySelector('input.cc-modal-host') as HTMLInputElement).value, DQ);
  });

  test('X19 preview: an echoed host key round-trips through data-host (S14)', async () => {
    const root = doc.getElementById('m')!;
    root.innerHTML = `<div class="cc-modal"><div class="cc-modal-body">
      <input type="checkbox" class="cc-modal-host" checked>${renderPreviewButton(false)}</div></div>`;
    (root.querySelector('input.cc-modal-host') as HTMLInputElement).value = 'claude';
    (globalThis as Record<string, unknown>).fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ byHost: { [DQ]: { wouldWrite: [] }, [`${DQ}2`]: { degraded: true } } }),
    });
    bindPreviewEvents(root, {}, () => undefined);
    (root.querySelector('[data-action="preview"]') as HTMLButtonElement).click();
    await settle();
    const blocks = root.querySelectorAll('.cc-preview-host');
    assert.equal(blocks.length, 2, 'both host blocks render');
    assertInert(root);
    assert.equal(blocks[0].getAttribute('data-host'), DQ);
    assert.equal(blocks[1].getAttribute('data-host'), `${DQ}2`);
  });

  test('X20 picker: hostile host and skill names stay inert (S15)', async () => {
    const root = doc.getElementById('m')!;
    root.innerHTML = `<input type="checkbox" class="cc-modal-host" checked>${renderPickerSection([], false)}`;
    (root.querySelector('input.cc-modal-host') as HTMLInputElement).value = TAG;
    const fetchStub = async () => ({ json: async () => ({ skills: [{ name: DQ }] }) });
    bindPickerEvents(root, { fetch: fetchStub });
    const details = root.querySelector('[data-cc-picker="root"]') as HTMLDetailsElement;
    details.open = true;
    details.dispatchEvent(new (doc.defaultView as unknown as { Event: typeof Event }).Event('toggle'));
    await settle();
    const block = root.querySelector('.cc-picker-host');
    assert.ok(block, 'the host block renders');
    assertInert(root);
    assert.equal(block!.getAttribute('data-host'), TAG);
    assert.equal((root.querySelector('.cc-picker-skill input') as HTMLInputElement).value, DQ);
  });
});

suite('Lane E XSS: Bicameral card (X21)', () => {
  let restore: () => void;
  let doc: Document;
  setup(() => {
    const env = installDom('<div id="b"></div>');
    restore = env.restore;
    doc = env.dom.window.document;
  });
  teardown(() => restore());

  test('X21 decision feed: hostile MCP fields round-trip through data-* (S16)', () => {
    const root = doc.getElementById('b')!;
    root.innerHTML = renderRunning({
      features: [{ feature: DQ, decisions: [{ id: DQ, title: 'T', status: 'ratified',
        bindings: [{ filePath: DQ, startLine: DQ, symbol: 's' }] }] }],
      driftByFile: {},
    });
    assertInert(root);
    assert.equal(root.querySelector('.cc-bicameral-feature')!.getAttribute('data-feature'), DQ);
    assert.equal(root.querySelector('.cc-bicameral-decision')!.getAttribute('data-decision-id'), DQ);
    assert.equal(root.querySelector('[data-action="bicameral-ratify"]')!.getAttribute('data-decision-id'), DQ);
    const open = root.querySelector('[data-action="bicameral-open-binding"]')!;
    assert.equal(open.getAttribute('data-file-path'), DQ);
    assert.equal(open.getAttribute('data-start-line'), DQ);
  });
});

suite('Lane E XSS: marketplace (X22, X23, X27)', () => {
  let restore: () => void;
  let doc: Document;
  setup(() => {
    const env = installDom('<div id="mp"><div class="cc-marketplace-modal"><div class="cc-marketplace-modal-body"></div></div></div>');
    restore = env.restore;
    doc = env.dom.window.document;
  });
  teardown(() => restore());

  const item = {
    id: 'i1', name: 'N', author: 'a', description: 'd', category: 'c', tags: [],
    status: 'not-installed', trustTier: 'unverified', requiredPermissions: [], repoUrl: 'https://github.com/a/b',
  };

  function render(it: Record<string, unknown>): Element {
    const r = new MarketplaceRenderer('mp');
    r.scanners = { garak: false, promptfoo: false };
    const host = doc.createElement('div');
    host.innerHTML = r.renderCard(it);
    doc.body.appendChild(host);
    r.showModal(it);
    return doc.body;
  }

  test('X22 a javascript: repo URL is never a link target; a hostile id round-trips (S18)', () => {
    const root = render({ ...item, id: DQ, repoUrl: JSURL });
    assertInert(root);
    for (const a of Array.from(root.querySelectorAll('a'))) {
      const href = a.getAttribute('href') ?? '';
      assert.ok(!/^\s*javascript:/i.test(href), `no javascript: href (got ${href})`);
    }
    assert.equal(root.querySelector('.cc-marketplace-card')!.getAttribute('data-id'), DQ);
  });

  test('X23 control: an https repo URL stays a link on the card and in the modal', () => {
    const root = render(item);
    const hrefs = Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    assert.deepEqual(hrefs, ['https://github.com/a/b', 'https://github.com/a/b']);
  });

  test('X27 scan summary: hostile riskGrade and scanner stay text (fold 5, marketplace.js:220/222)', () => {
    const root = render({ ...item, securityScan: { passed: false, riskGrade: TAG, scanner: TAG, findings: [] } });
    assertInert(root);
    assert.ok(root.querySelector('.cc-marketplace-card')!.textContent!.includes(TAG));
  });
});
