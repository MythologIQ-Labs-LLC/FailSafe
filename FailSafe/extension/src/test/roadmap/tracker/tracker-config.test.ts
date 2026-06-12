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

  test('buildTaxonomyDirective on an empty config is honest-empty, still a valid directive', () => {
    const md = buildTaxonomyDirective({ programs: [], verticals: [], agents: [] }, { at: '2026-06-12T00:00:00.000Z' });
    assert.ok(md.includes('no programs declared'));
    assert.ok(md.includes('MUST consult'));
  });
});
