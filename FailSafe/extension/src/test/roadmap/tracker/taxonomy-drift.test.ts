// #548 — Console taxonomy drift. The tracked docs/roadmap/programs.yaml must list,
// for every Console vertical, exactly its sub-view labels in Console order (T1, T1b);
// a planted-mismatch fixture proves the comparison catches a missing label, an extra
// label and the wrong order (T2); the function is total (T3); and the shipped
// Component Help page describes the real Console tabs (T11).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { CONSOLE_VERTICALS } from '../../../roadmap/tracker/governance-projection';
import { computeTaxonomyDrift, functionalityLabel, NOT_A_TEXT_LABEL } from '../../../roadmap/tracker/taxonomy-drift';
import { resolveTestRepoPath } from './test-repo-root';

/** One manifest functionality line: a single bold label, then a description. */
const MANIFEST_LINE = /^\*\*[^*]+\*\* [^*]+$/;

function loadVerticals(...segments: string[]): unknown[] {
  const doc = yaml.load(fs.readFileSync(resolveTestRepoPath(...segments), 'utf-8')) as { verticals?: unknown[] };
  return doc.verticals ?? [];
}

/** The corrected seven verticals, each declaring exactly its Console sub-views. */
function consoleExact(): Array<{ key: string; functionality: string[] }> {
  return CONSOLE_VERTICALS.map((v) => ({ key: v.key, functionality: v.subviews.map((s) => `**${s.label}** text`) }));
}

suite('#548 Console taxonomy drift', () => {
  test('T1: the tracked programs.yaml lists exactly each Console vertical\'s sub-views, in order, as bold labels', () => {
    const verticals = loadVerticals('docs', 'roadmap', 'programs.yaml');
    const drift = computeTaxonomyDrift(verticals);
    assert.equal(drift.applies, true);
    assert.equal(drift.matched, CONSOLE_VERTICALS.length, 'every Console vertical is declared');
    const drifted = drift.verticals.filter((v) => !v.declared || v.missing.length || v.extra.length || v.outOfOrder);
    assert.deepEqual(drifted, [], `${drift.drifted} drifted: ${JSON.stringify(drifted)}`);
    assert.deepEqual(drift.unmatched, []);
    for (const row of verticals as Array<{ key: string; functionality?: unknown[] }>) {
      for (const line of row.functionality ?? []) {
        assert.match(String(line), MANIFEST_LINE, `${row.key}: "${String(line)}" is not one **Label** plus a description`);
      }
    }
  });

  test('T1b: the manifest line rule rejects a second bold segment, a missing description and a missing label', () => {
    assert.doesNotMatch('**Agent Governance** installer · **SARIF** ingest', MANIFEST_LINE);
    assert.doesNotMatch('**Audit Log**', MANIFEST_LINE);
    assert.doesNotMatch('Audit Log stream', MANIFEST_LINE);
    assert.match('**Audit Log** real-time stream', MANIFEST_LINE);
  });

  test('T2: the planted fixture reports exactly its missing, extra and out-of-order faults', () => {
    const drift = computeTaxonomyDrift(loadVerticals('FailSafe', 'extension', 'src', 'test', 'fixtures', 'taxonomy-drift', 'console-mismatch.yaml'));
    const by = (k: string) => drift.verticals.find((v) => v.key === k)!;
    assert.equal(drift.applies, true);
    assert.deepEqual(by('governance').missing, ['Shadow Genome']);
    assert.deepEqual(by('governance').extra, []);
    assert.deepEqual(by('workspace').extra, ['Roadmap']);
    assert.deepEqual(by('workspace').missing, []);
    assert.equal(by('agents').outOfOrder, true);
    assert.deepEqual([by('agents').missing, by('agents').extra], [[], []]);
    for (const k of ['monitor', 'learn', 'integrations', 'config']) {
      assert.deepEqual(by(k), { ...by(k), declared: true, missing: [], extra: [], outOfOrder: false }, `${k} is clean`);
    }
    assert.equal(by('governance').outOfOrder, false);
    assert.equal(by('workspace').outOfOrder, false);
    assert.equal(drift.drifted, 3);
  });

  test('T3: an undeclared vertical is all missing; unmatched and repeated keys are listed', () => {
    const rows: unknown[] = consoleExact().filter((v) => v.key !== 'learn');
    rows.push({ key: 'roadmap', functionality: [] }, { key: 'agents', functionality: [] });
    const drift = computeTaxonomyDrift(rows);
    const learn = drift.verticals.find((v) => v.key === 'learn')!;
    assert.deepEqual(learn, { key: 'learn', name: 'Learn', declared: false, missing: ['Learn'], extra: [], outOfOrder: false });
    assert.deepEqual(drift.unmatched, ['roadmap', 'agents (repeated)']);
    assert.equal(drift.drifted, 1, 'the first agents row is compared; the repeat is only listed');
  });

  test('T3: labels — bold, bare, non-text, repeated and unterminated', () => {
    assert.equal(functionalityLabel('**Audit Log** stream'), 'Audit Log');
    assert.equal(functionalityLabel('  Audit Log  '), 'Audit Log', 'a bare label compares as itself');
    assert.equal(functionalityLabel(7), NOT_A_TEXT_LABEL);
    assert.equal(functionalityLabel(''), NOT_A_TEXT_LABEL);
    assert.equal(functionalityLabel('**Audit Log stream'), '**Audit Log stream', 'unterminated bold is the whole line');
    const rows = consoleExact();
    rows.find((v) => v.key === 'governance')!.functionality = ['Audit Log', '**Risks** x', '**Risks** again', 'Compliance', '**Shadow Genome'];
    const gov = computeTaxonomyDrift(rows).verticals.find((v) => v.key === 'governance')!;
    assert.deepEqual(gov.extra, ['Risks', '**Shadow Genome']);
    assert.deepEqual(gov.missing, ['Shadow Genome']);
    assert.equal(gov.outOfOrder, false);
  });

  test('T3: the comparison applies only when a majority of Console keys are declared', () => {
    for (const input of [[{ key: 'ci', functionality: [] }, { key: 'rt' }], [], null, 'x', {}]) {
      const d = computeTaxonomyDrift(input);
      assert.deepEqual([d.applies, d.matched, d.verticals, d.drifted], [false, 0, [], 0], JSON.stringify(input));
    }
    const exact = consoleExact();
    const three = computeTaxonomyDrift(exact.slice(0, 3));
    assert.deepEqual([three.applies, three.matched, three.verticals.length], [false, 3, 0]);
    const four = computeTaxonomyDrift(exact.slice(0, 4));
    assert.deepEqual([four.applies, four.matched, four.drifted], [true, 4, 3]);
  });

  test('T3: never throws on malformed rows, scalars and odd keys', () => {
    const rows: unknown[] = [
      null, 'x', 42, [], { key: null }, { name: 'no key' },
      { key: 'governance', functionality: 'Audit Log' },
      { key: 'monitor', functionality: null },
      { key: 7, functionality: [null, {}, 3] },
      { key: '__proto__', functionality: ['**x** y'] },
      { key: 'constructor' },
      { key: { toString: 1 }, functionality: ['**Overview** x'] }, // N3: String() would throw; the row has no key
      { key: true, functionality: [] },
      ...consoleExact().filter((v) => !['governance', 'monitor'].includes(v.key)),
    ];
    const d = computeTaxonomyDrift(rows);
    assert.equal(d.applies, true);
    assert.deepEqual(d.unmatched, ['7', '__proto__', 'constructor', 'true']);
    const gov = d.verticals.find((v) => v.key === 'governance')!;
    assert.deepEqual([gov.declared, gov.missing.length, gov.extra], [true, 4, []], 'scalar functionality counts as []');
    const mon = d.verticals.find((v) => v.key === 'monitor')!;
    assert.deepEqual([mon.declared, mon.missing], [true, ['Overview']]);
    assert.equal(d.drifted, 2);
  });

  test('T11: Component Help describes the real Console tabs and their sub-views', () => {
    const html = fs.readFileSync(resolveTestRepoPath('FailSafe', 'extension', 'src', 'roadmap', 'ui', 'command-center.html'), 'utf-8');
    const tabText = new Map([...html.matchAll(/data-target="(\w+)"[\s\S]*?<\/div>\s*([^<\n]+?)\s*<\/button>/g)].map((m) => [m[1], m[2]]));
    const help = fs.readFileSync(resolveTestRepoPath('FailSafe', 'extension', 'docs', 'COMPONENT_HELP.md'), 'utf-8');
    const start = help.indexOf('## Console Tabs');
    assert.ok(start >= 0, 'COMPONENT_HELP has a "## Console Tabs" section');
    const end = help.indexOf('\n## ', start + 1);
    const section = help.slice(start, end < 0 ? undefined : end);
    const headings = [...section.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
    const expected = CONSOLE_VERTICALS.map((v) => tabText.get(v.tab));
    assert.equal(expected.length, CONSOLE_VERTICALS.length);
    assert.deepEqual(headings, expected, 'one ### per Console tab, in Console order, named as the tab button');
    for (const v of CONSOLE_VERTICALS.filter((x) => x.subviews.length > 1)) {
      const h = section.indexOf(`### ${tabText.get(v.tab)}`);
      const next = section.indexOf('\n### ', h + 1);
      const body = section.slice(h, next < 0 ? undefined : next);
      for (const s of v.subviews) assert.ok(body.includes(`**${s.label}**`), `${v.name} section names **${s.label}**`);
    }
    assert.ok(help.includes(`Console includes ${CONSOLE_VERTICALS.length} tabs`), 'the Claim Map states the real tab count');
  });
});
