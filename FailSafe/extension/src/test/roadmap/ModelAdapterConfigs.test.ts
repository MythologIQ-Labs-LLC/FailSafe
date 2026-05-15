// Functional tests for BUILTIN_ADAPTER_CONFIGS (FX371 + FX372).

import { strict as assert } from 'assert';
import { BUILTIN_ADAPTER_CONFIGS } from '../../roadmap/services/ModelAdapterConfigs';

suite('BUILTIN_ADAPTER_CONFIGS (FX371 + FX372)', () => {
  test('FX371 — kilocode adapter present with .kilocode/workflows/ output', () => {
    const cfg = BUILTIN_ADAPTER_CONFIGS.kilocode;
    assert.ok(cfg);
    assert.equal(cfg.modelId, 'kilocode');
    assert.equal(cfg.outputDir, '.kilocode/workflows/');
    assert.equal(cfg.format, 'markdown');
  });

  test('FX371 — kilocode conventions: kebab, yaml-frontmatter, no subagents/hooks', () => {
    const cfg = BUILTIN_ADAPTER_CONFIGS.kilocode;
    assert.equal(cfg.conventions.fileNaming, 'kebab');
    assert.equal(cfg.conventions.metadataFormat, 'yaml-frontmatter');
    assert.equal(cfg.conventions.supportsSubagents, false);
    assert.equal(cfg.conventions.supportsHooks, false);
    assert.equal(cfg.conventions.maxPromptLength, 8000);
  });

  test('FX372 — gemini adapter present with .gemini/skills/ output + xml-inline metadata', () => {
    const cfg = BUILTIN_ADAPTER_CONFIGS.gemini;
    assert.ok(cfg);
    assert.equal(cfg.modelId, 'gemini');
    assert.equal(cfg.outputDir, '.gemini/skills/');
    assert.equal(cfg.conventions.metadataFormat, 'xml-inline');
    assert.equal(cfg.conventions.maxPromptLength, 100000);
  });

  test('FX372 — gemini does NOT support subagents or hooks (limited adapter)', () => {
    const cfg = BUILTIN_ADAPTER_CONFIGS.gemini;
    assert.equal(cfg.conventions.supportsSubagents, false);
    assert.equal(cfg.conventions.supportsHooks, false);
  });

  test('FX371+FX372 — all 7 expected adapters present (claude/codex/gemini/copilot/cursor/windsurf/kilocode)', () => {
    const expected = ['claude', 'codex', 'gemini', 'copilot', 'cursor', 'windsurf', 'kilocode'];
    for (const id of expected) {
      assert.ok(BUILTIN_ADAPTER_CONFIGS[id], `expected adapter ${id} to be present`);
      assert.equal(BUILTIN_ADAPTER_CONFIGS[id].modelId, id);
    }
  });

  test('FX371+FX372 — claude is the only adapter supporting both subagents and hooks', () => {
    const supportingBoth = Object.entries(BUILTIN_ADAPTER_CONFIGS)
      .filter(([_, c]) => c.conventions.supportsSubagents && c.conventions.supportsHooks)
      .map(([id]) => id);
    assert.deepEqual(supportingBoth, ['claude']);
  });

  test('FX371+FX372 — every adapter uses kebab naming (cross-platform safety)', () => {
    for (const [id, cfg] of Object.entries(BUILTIN_ADAPTER_CONFIGS)) {
      assert.equal(cfg.conventions.fileNaming, 'kebab', `${id} should use kebab naming`);
    }
  });

  test('FX371+FX372 — every outputDir is unique (no scaffold-path collision)', () => {
    const outputs = Object.values(BUILTIN_ADAPTER_CONFIGS).map(c => c.outputDir);
    const uniq = new Set(outputs);
    assert.equal(uniq.size, outputs.length, 'outputDir collision detected');
  });

  test('FX371+FX372 — outputDirs are relative paths starting with "."', () => {
    for (const [id, cfg] of Object.entries(BUILTIN_ADAPTER_CONFIGS)) {
      assert.ok(cfg.outputDir.startsWith('.'), `${id} outputDir should start with "."`);
      assert.ok(cfg.outputDir.endsWith('/'), `${id} outputDir should end with "/"`);
    }
  });
});
