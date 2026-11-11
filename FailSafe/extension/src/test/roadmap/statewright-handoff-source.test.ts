// #652 source contract for the Statewright website handoff (audit VETO #939,
// R1 and R2). Behavioural tests cannot list every way a page could contact a
// site or show a status, so the handoff is also pinned at its source: the card
// is one exact string, its styles are a closed list, and the renderer may
// mention Statewright only to place that card.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
// @ts-expect-error untyped JS module
import * as handoff from '../../../src/roadmap/ui/modules/statewright-handoff.js';

const MODULES = path.resolve(__dirname, '..', '..', '..', 'src', 'roadmap', 'ui', 'modules');
const read = (name: string): string => fs.readFileSync(path.join(MODULES, name), 'utf8').replace(/\r\n/g, '\n');
const count = (text: string, re: RegExp): number => (text.match(re) || []).length;

const CARD = `
  <section class="cc-intcat-statewright" data-id="statewright" aria-label="Statewright AI website integration">
    <div class="cc-intcat-head"><strong>Statewright AI</strong><span class="cc-intcat-pill">Website handoff</span></div>
    <p>View your workflow runs and transition history on Statewright's website. Statewright handles sign-in and run data. FailSafe does not read Statewright history or enforce Statewright workflows.</p>
    <div class="cc-intcat-actions">
      <a class="cc-intcat-web-link" href="https://statewright.ai/runs" target="_blank" rel="noopener noreferrer">Open Statewright Run History</a>
      <span class="cc-intcat-web-url">https://statewright.ai/runs</span>
    </div>
  </section>`;

const SELECTORS = [
  '.cc-intcat-statewright',
  '.cc-intcat-statewright p',
  '.cc-intcat-web-link',
  '.cc-intcat-web-link:hover, .cc-intcat-web-link:focus-visible',
  '.cc-intcat-web-url',
];
const PROPERTIES = ['background', 'border', 'border-radius', 'padding', 'color', 'margin', 'font-size', 'display', 'font', 'text-decoration', 'border-color', 'user-select'];

// Anything that can reach a network, open or move a window, or run later.
const ACTIVE = /\b(WebSocket|EventSource|sendBeacon|XMLHttpRequest|Image|Worker|serviceWorker|navigator|location|history|open|postTask|scheduler|setTimeout|setInterval|requestAnimationFrame|requestIdleCallback|queueMicrotask|MutationObserver|IntersectionObserver|eval|Function|import)\b\s*[.(]/g;

suite('#652 Statewright website handoff: card source contract', () => {
  test('the card is exactly the reviewed markup and the module exports nothing else', () => {
    assert.deepEqual(Object.keys(handoff).filter((k) => k !== 'default').sort(), ['STATEWRIGHT_HANDOFF', 'STATEWRIGHT_RUNS_URL', 'STATEWRIGHT_STYLES']);
    assert.equal(handoff.STATEWRIGHT_RUNS_URL, 'https://statewright.ai/runs');
    assert.equal(handoff.STATEWRIGHT_HANDOFF, CARD, 'any change to the card, including an attribute or a word, must be reviewed here');
  });

  test('the card styles are a closed list: no generated content, hiding, overlay or remote resource', () => {
    const css: string = handoff.STATEWRIGHT_STYLES;
    const rules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((m) => ({ selector: m[1].trim(), body: m[2] }));
    assert.deepEqual(rules.map((r) => r.selector), SELECTORS, 'no pseudo-element and no selector outside the card');
    assert.equal(css.replace(/([^{}]+)\{([^{}]*)\}/g, '').trim(), '', 'nothing outside the listed rules (no @import, @font-face or comment)');
    const used = rules.flatMap((r) => r.body.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean));
    assert.deepEqual(used.filter((p) => !PROPERTIES.includes(p)), [], 'only presentational properties');
    assert.ok(!/url\(|content\s*:|expression|display\s*:\s*none|font-size\s*:\s*0[^.]/i.test(css), 'nothing that hides the text or loads a resource');
  });

  test('the handoff module contains no code: three constants and nothing that runs', () => {
    const src = read('statewright-handoff.js').replace(/\/\*[\s\S]*?\*\//, '');
    assert.equal(count(src, /^export const /gm), 3);
    assert.equal(count(src, /=>|\bfunction\b|\bclass\s+\w|\bnew\b|addEventListener|\bon[a-z]+\s*=/g), 0);
    assert.equal(count(src, ACTIVE), 0);
    assert.equal(count(src, /\$\{/g), 2, 'the only interpolation is the fixed address, twice');
    assert.equal(count(src, /\$\{STATEWRIGHT_RUNS_URL\}/g), 2);
  });
});

suite('#652 Statewright website handoff: renderer source contract', () => {
  test('the renderer mentions Statewright only to import and place the card', () => {
    const src = read('integration-catalog-renderer.js');
    assert.equal(count(src, /STATEWRIGHT_HANDOFF/g), 4, 'the import and one placement per state (loading, error, loaded)');
    assert.equal(count(src, /STATEWRIGHT_STYLES/g), 2, 'the import and the style sheet');
    const rest = src.replace(/STATEWRIGHT_HANDOFF|STATEWRIGHT_STYLES|\.\/statewright-handoff\.js/g, '');
    assert.equal(count(rest, /statewright/gi), 0, 'no other text, status line, address or identifier names Statewright');
  });

  test('the renderer has one listener, one request and nothing that acts by itself', () => {
    const src = read('integration-catalog-renderer.js');
    assert.equal(count(src, /addEventListener\(/g), 1);
    assert.equal(count(src, /btn\.addEventListener\('click', /g), 1, 'the existing Configure click');
    assert.equal(count(src, /\bon[a-z]+\s*=/g), 0, 'no inline or assigned handler');
    assert.equal(count(src, /\bfetch\(/g), 1);
    assert.equal(count(src, /fetch\('\/api\/v1\/integrations\/catalog'\)/g), 1, 'the one same-origin catalog request');
    assert.deepEqual(src.match(ACTIVE) || [], [], 'no socket, beacon, navigation, window, timer, scheduler or observer');
  });
});
