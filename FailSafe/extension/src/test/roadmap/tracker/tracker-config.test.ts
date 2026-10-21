// FX891 — tracker-config (operator taxonomy model). Pure: yaml round-trip,
// manifest-derived seed (+ proposed agents), and the governed directive markdown.

import { strict as assert } from 'assert';
import {
  parseTrackerConfig, serializeTrackerConfig, deriveConfigFromManifest,
  buildTaxonomyDirective, lintConfig, type TrackerConfig,
} from '../../../roadmap/tracker/tracker-config';
import type { TrackerManifest } from '../../../roadmap/tracker/tracker-model';

const CFG: TrackerConfig = {
  programs: [{ key: 'core', name: 'Core', accent: '#0f0' }],
  verticals: [{ key: 'core', name: 'Core', accent: '#0f0' }],
  agents: [{ key: 'core', name: 'Core', program: 'core', vertical: 'core', patterns: ['core'], evidence: ['v1.0'] }],
};

suite('FX891 tracker-config', () => {
  test('parse/serialize round-trip preserves programs/verticals/agents', () => {
    const round = parseTrackerConfig(serializeTrackerConfig(CFG));
    assert.deepEqual(round.programs, CFG.programs);
    assert.deepEqual(round.verticals, CFG.verticals);
    assert.deepEqual(round.agents, CFG.agents);
  });

  test('parse tolerates junk → empty config', () => {
    assert.deepEqual(parseTrackerConfig(': not : yaml :'), { programs: [], verticals: [], agents: [] });
    assert.deepEqual(parseTrackerConfig('42'), { programs: [], verticals: [], agents: [] });
  });

  test('deriveConfigFromManifest carries programs/verticals + proposes agents when none', () => {
    const manifest: TrackerManifest = {
      programs: [{ key: 'ci', name: 'CI', accent: '#0f0' }, { key: 'rt', name: 'Runtime', accent: '#f00' }],
      verticals: [{ key: 'ci', name: 'CI', accent: '#0f0' }],
      phases: [{ prog: 'ci', key: 'A', rc: 'v1.0', w: 100, title: 'a' }],
    };
    const cfg = deriveConfigFromManifest(manifest);
    assert.deepEqual(cfg.programs, manifest.programs);
    assert.equal(cfg.agents.length, 2, 'one proposed agent per program (FX887)');
    const ci = cfg.agents.find((a) => a.program === 'ci')!;
    assert.equal(ci.vertical, 'ci', 'vertical set when a parallel vertical exists');
    assert.deepEqual(ci.evidence, ['v1.0'], 'evidence from the program phase rcs');
  });

  test('deriveConfigFromManifest keeps existing agents verbatim (no overwrite)', () => {
    const cfg = deriveConfigFromManifest({ programs: [{ key: 'x', name: 'X', accent: '#0f0' }], agents: [{ key: 'mine', name: 'M' }] });
    assert.deepEqual(cfg.agents, [{ key: 'mine', name: 'M' }]);
  });

  test('lintConfig flags an orphan vertical + an unresolved agent (FX887 checks fire on a phase-less config)', () => {
    const bad: TrackerConfig = {
      programs: [{ key: 'core', name: 'Core', accent: '#0f0' }],
      verticals: [{ key: 'orphan', name: 'O', accent: '#0f0' }],
      agents: [{ key: 'a', name: 'A', program: 'ghost' }],
    };
    const lint = lintConfig(bad);
    assert.ok(lint.some((f) => f.code === 'vertical-unknown-program'), 'orphan vertical warned');
    assert.ok(lint.some((f) => f.code === 'agent-unknown-program'), 'unresolved agent program warned');
    assert.ok(!lint.some((f) => f.severity === 'abort'), 'taxonomy findings are advisory (warn)');
  });

  test('buildTaxonomyDirective contains the taxonomy keys + the MUST-CONSULT clause', () => {
    const md = buildTaxonomyDirective(CFG, { at: '2026-06-12T00:00:00.000Z' });
    assert.ok(md.includes('MUST consult'), 'directive carries the must-consult clause');
    assert.ok(md.includes('docs/roadmap/tracker-config.yaml'), 'names the source-of-truth file');
    assert.ok(md.includes('`core`'), 'lists the declared program/vertical/agent key');
    assert.ok(md.includes('**Active**: yes'), 'PUBLISH_BLOCK-shape metadata');
  });

  test('#548 T6: the directive says the file is local, and that the Console owns vertical sub-views', () => {
    const md = buildTaxonomyDirective(CFG, { at: '2026-10-19T00:00:00.000Z' });
    assert.ok(!md.includes('(tracked)'), 'the file is not tracked');
    assert.ok(md.includes('not in the repository'), 'says the file is local');
    assert.ok(md.includes('CONSOLE_VERTICALS'), 'names the authority for vertical sub-views');
    assert.ok(!serializeTrackerConfig(CFG).includes('OPERATOR source of truth'), 'the banner no longer claims sole authority');
  });

  test('buildTaxonomyDirective on an empty config is honest-empty, still a valid directive', () => {
    const md = buildTaxonomyDirective({ programs: [], verticals: [], agents: [] }, { at: '2026-06-12T00:00:00.000Z' });
    assert.ok(md.includes('no programs declared'));
    assert.ok(md.includes('MUST consult'));
  });
  // B311/B312 lane (plan-b311-b312 LD10): the directive records intent; the Console navigation and
  // programs.yaml hold the authority; disagreements are reported as drift. Line wrapping is free, so
  // the text is compared with whitespace runs collapsed.
  test('the directive records intended taxonomy, names the authorities, and reports drift', () => {
    const md = buildTaxonomyDirective(CFG, { at: '2026-10-20T00:00:00.000Z' });
    const flat = md.replace(/\s+/g, ' ');
    assert.ok(!md.includes('Source of truth'), 'no source-of-truth claim');
    assert.ok(!md.includes('**Enforcement**'), 'the Enforcement lines are replaced by Authority');
    assert.ok(!flat.includes('align programs/verticals/agents to'), 'no align-to clause');
    assert.ok(!flat.includes('drift bug to surface'), 'the old divergence sentence is gone');
    assert.ok(flat.includes('**Records**: intended tracker taxonomy and mappings, in `docs/roadmap/tracker-config.yaml` (local file; `docs/` is gitignored, so it is not in the repository)'));
    assert.ok(flat.includes("**Authority**: the Console's implemented navigation (`CONSOLE_VERTICALS`) defines the actual tabs and sub-views; `docs/roadmap/programs.yaml` governs programs and phases. Workspace › Taxonomy reports drift, and CI checks the tracked programs.yaml. This file is not checked in CI."));
    assert.ok(flat.includes('Any cycle that plans tracker or feature-scope work MUST consult `docs/roadmap/tracker-config.yaml` and compare its intended programs, verticals and agents with the Console navigation and `docs/roadmap/programs.yaml`. Report disagreements as drift; do not silently reconcile them.'));
  });
});
