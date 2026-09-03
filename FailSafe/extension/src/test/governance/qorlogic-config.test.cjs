/**
 * FX935 — `.qorlogic/config.json` declares the repository layout and attribution policy.
 *
 * Why this suite exists (GAP-GATE-01, RESEARCH_BRIEF_qor169-alignment-2026-09-03.md):
 * `skill_size_budget_lint` is an ABORT-class seal control that defaults to
 * `--skills-root qor/skills`. That path does not exist in this repo — skills live at
 * `.claude/skills/`. The control therefore scanned ZERO files and exited 0, and the same
 * unresolved root hard-ABORTed `seal_artifacts --check`.
 *
 * The load-bearing assertion below is `skills_root resolves to a directory containing at
 * least one SKILL.md`. A test that merely asserted the key's presence would have passed
 * against the broken implicit default too; this one would not.
 *
 * Runs standalone: node --test src/test/governance/qorlogic-config.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// src/test/governance -> src/test -> src -> extension -> FailSafe -> <repo root>
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const CONFIG_PATH = path.join(REPO_ROOT, '.qorlogic', 'config.json');

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function countSkillManifests(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return 0;
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => fs.existsSync(path.join(dir, e.name, 'SKILL.md'))).length;
}

describe('FX935 .qorlogic/config.json', () => {
  it('declares attribution.model_coauthor false, the sanctioned no-AI-co-author exemption', () => {
    const cfg = readConfig();
    assert.equal(
      cfg.attribution.model_coauthor,
      false,
      'seal_trailer_check requires a Co-Authored-By line unless this is declared false'
    );
  });

  it('declares a layout.skills_root that RESOLVES to a directory holding SKILL.md files', () => {
    const cfg = readConfig();
    const declared = cfg.layout.skills_root;
    assert.equal(typeof declared, 'string', 'skills_root must be a declared path, not null');

    const resolved = path.join(REPO_ROOT, declared);
    assert.ok(
      fs.existsSync(resolved),
      `declared layout.skills_root "${declared}" does not exist at ${resolved}`
    );

    const found = countSkillManifests(resolved);
    assert.ok(
      found > 0,
      `declared layout.skills_root "${declared}" contains no SKILL.md; ` +
        'this is the assertion that fails against the upstream qor/skills default'
    );
  });

  it('declares a layout.agents_root that RESOLVES to a directory holding agent .md files', () => {
    const cfg = readConfig();
    const declared = cfg.layout.agents_root;
    assert.equal(typeof declared, 'string', 'agents_root must be a declared path, not null');

    const resolved = path.join(REPO_ROOT, declared);
    assert.ok(
      fs.existsSync(resolved),
      `declared layout.agents_root "${declared}" does not exist at ${resolved}`
    );

    const agentDocs = fs
      .readdirSync(resolved, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'));
    assert.ok(
      agentDocs.length > 0,
      `declared layout.agents_root "${declared}" contains no .md files; ` +
        'seal_artifacts --check fails on an agents root that does not resolve'
    );
  });

  it('declares roots that are TRACKED, not merely present on this machine', () => {
    // CI caught what a local run could not: `.gitignore:10` ignores `.claude/`
    // wholesale, so a declared root can exist on the author's disk and be absent
    // from a fresh clone. `fs.existsSync` is satisfied either way; `git ls-files`
    // is not. This assertion is what makes the defect reproducible locally.
    const { spawnSync } = require('child_process');
    const cfg = readConfig();

    for (const key of ['skills_root', 'agents_root']) {
      const declared = cfg.layout[key];
      const res = spawnSync('git', ['ls-files', '--', declared], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      const tracked = (res.stdout || '').trim().split('\n').filter(Boolean).length;
      assert.ok(
        tracked > 0,
        `layout.${key} "${declared}" resolves on disk but git tracks 0 files under it — ` +
          'a fresh clone would not have it, and the gate that reads it would resolve nothing'
      );
    }
  });

  it('does NOT resolve to the upstream qor/skills default, which is absent here', () => {
    const upstreamDefault = path.join(REPO_ROOT, 'qor', 'skills');
    assert.equal(
      countSkillManifests(upstreamDefault),
      0,
      'qor/skills now holds SKILL.md files; the premise of GAP-GATE-01 has changed and ' +
        'this suite needs re-deriving'
    );

    const cfg = readConfig();
    assert.notEqual(
      path.normalize(cfg.layout.skills_root),
      path.normalize(path.join('qor', 'skills')),
      'declaring the broken default defeats the purpose of the declaration'
    );
  });

  it('omits layout.glossary_path, because the upstream default already resolves', () => {
    const cfg = readConfig();
    assert.equal(
      Object.prototype.hasOwnProperty.call(cfg.layout, 'glossary_path'),
      false,
      'glossary_path is not declared; declaring it would be dead config'
    );
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, 'qor', 'references', 'glossary.md')),
      'the undeclared default target is gone — declare layout.glossary_path now'
    );
  });
});
