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

const STYLES = `
.cc-intcat-statewright { background:linear-gradient(180deg,#182332,#111a25); border:1px solid #425168; border-radius:10px; padding:14px; }
.cc-intcat-statewright p { color:#a9b8cb; margin:0 0 10px; font-size:.88rem; }
.cc-intcat-web-link { display:inline-block; background:#141a22; color:#f1efe7; border:1px solid #5fb0d8; border-radius:8px; padding:7px 14px; font:inherit; text-decoration:none; }
.cc-intcat-web-link:hover, .cc-intcat-web-link:focus-visible { border-color:#9fdcff; color:#fff; text-decoration:underline; }
.cc-intcat-web-url { color:#7f8aa0; font-size:.8rem; user-select:all; }
`;

// Anything that can reach a network, open or move a window, or run later.
const ACTIVE = /\b(WebSocket|EventSource|sendBeacon|XMLHttpRequest|Image|Worker|serviceWorker|navigator|location|history|open|postTask|scheduler|setTimeout|setInterval|requestAnimationFrame|requestIdleCallback|queueMicrotask|MutationObserver|IntersectionObserver|eval|Function|import)\b\s*[.(]/g;

suite('#652 Statewright website handoff: card source contract', () => {
  test('the card is exactly the reviewed markup and the module exports nothing else', () => {
    assert.deepEqual(Object.keys(handoff).filter((k) => k !== 'default').sort(), ['STATEWRIGHT_HANDOFF', 'STATEWRIGHT_RUNS_URL', 'STATEWRIGHT_STYLES']);
    assert.equal(handoff.STATEWRIGHT_RUNS_URL, 'https://statewright.ai/runs');
    assert.equal(handoff.STATEWRIGHT_HANDOFF, CARD, 'any change to the card, including an attribute or a word, must be reviewed here');
  });

  test('the card styles are exactly the reviewed rules, values included', () => {
    assert.equal(handoff.STATEWRIGHT_STYLES, STYLES, 'any change to a selector, property or value (size, colour, spacing) must be reviewed here');
    assert.ok(!/::|content\s*:|url\(|@/.test(STYLES), 'the reviewed rules hold no generated content, remote resource or at-rule');
  });

  test('the handoff module is its header comment and three constants, with no other statement', () => {
    const code = read('statewright-handoff.js').replace(/^\/\*[\s\S]*?\*\//, '').trim();
    const placeholder = '$' + '{STATEWRIGHT_RUNS_URL}';
    const expected = [
      "export const STATEWRIGHT_RUNS_URL = 'https://statewright.ai/runs';",
      'export const STATEWRIGHT_STYLES = `' + STYLES + '`;',
      'export const STATEWRIGHT_HANDOFF = `' + CARD.split('https://statewright.ai/runs').join(placeholder) + '`;',
    ].join('\n\n');
    assert.equal(code, expected, 'nothing runs when the module is imported');
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
