// Phase 4 visual verification probe — mounts the Learn tab via jsdom and
// dumps the rendered HTML for each sub-view state. Run from extension dir:
//   node ./scripts/learn-tab-probe.cjs
// Outputs a markdown report to stdout suitable for visual inspection.

const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="learn" class="active"></div></body></html>`, {
  url: 'http://localhost:9999',
});
global.window = dom.window;
global.document = dom.window.document;
global.sessionStorage = dom.window.sessionStorage;
global.localStorage = dom.window.localStorage;
global.HTMLElement = dom.window.HTMLElement;
global.CustomEvent = dom.window.CustomEvent;

const { LearnRenderer } = require('../out/roadmap/ui/modules/learn.js');

const hub = {
  activePlan: { phases: [] },
  recentCheckpoints: [],
  unattributedFileActivity: [],
  education: { enabled: true, proficiency: 'beginner' },
};

const renderer = new LearnRenderer('learn');
renderer.render(hub);

function dump(label) {
  const learn = dom.window.document.getElementById('learn');
  console.log(`\n## ${label}\n`);
  console.log('```html');
  console.log((learn && learn.innerHTML) || '(empty)');
  console.log('```\n');
}

dump('READ sub-view (default active)');

// Click Glossary pill.
const glossaryPill = dom.window.document.querySelector('.cc-pill[data-key="glossary"]');
if (glossaryPill) glossaryPill.click();
dump('GLOSSARY sub-view (after Glossary pill click)');

// Disabled education.
renderer.render({ education: { enabled: false } });
dump('DISABLED education (Learn container cleared)');

// Re-enable + trigger fire (file activity, no plan).
renderer.render({
  activePlan: null,
  unattributedFileActivity: [
    { eventId: 'e1', timestamp: '2026-05-24T10:00:00Z', type: 'change', artifactPath: 'src/x.ts' },
  ],
  education: { enabled: true, proficiency: 'beginner' },
});
dump('READ sub-view with relevant-now trigger fired (scope-before-prompt should sort first)');

// Stats.
console.log('## Render stats\n');
const learnEl = dom.window.document.getElementById('learn');
console.log(`- inner HTML length: ${learnEl ? learnEl.innerHTML.length : 0} chars`);
console.log(`- card count: ${dom.window.document.querySelectorAll('article.cc-learn-essay-card').length}`);
console.log(`- pill count: ${dom.window.document.querySelectorAll('.cc-pill').length}`);
console.log(`- jump anchors: ${dom.window.document.querySelectorAll('a.cc-learn-essay-jump-anchor').length}`);
console.log(`- copy buttons: ${dom.window.document.querySelectorAll('[data-acceptance-copy]').length}`);
console.log(`- aria-live regions: ${dom.window.document.querySelectorAll('[aria-live]').length}`);
