/**
 * FX940 — `.qorlogic/config.json` declares the repository layout and attribution policy.
 *
 * Renumbered from FX935 on 2026-09-04: PR #445 had claimed FX935 first (2026-08-24) and the
 * older claim wins. See META_LEDGER Entry #605.
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

const INSTALL_MANIFEST = path.join(REPO_ROOT, '.claude', '.qorlogic-installed.json');

/**
 * True once `qor-logic install --host claude --scope repo` has run here.
 *
 * `.claude/` is out-of-tier per docs/GOVERNANCE_INDEX.md — "Tool config +
 * runtime state", explicitly NOT governance — so its contents are deliberately
 * untracked and a clean clone has none of them. Assertions about what is ON
 * DISK under a declared root are therefore only meaningful post-install; the
 * declaration itself is asserted unconditionally below.
 */
function isInstalled() {
  return fs.existsSync(INSTALL_MANIFEST);
}

function countSkillManifests(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return 0;
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => fs.existsSync(path.join(dir, e.name, 'SKILL.md'))).length;
}

describe('FX940 .qorlogic/config.json', () => {
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
    if (!isInstalled()) return;   // clean clone: nothing installed yet

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
    if (!isInstalled()) return;   // clean clone: nothing installed yet

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

  it('declares roots matching where qor-logic actually installs, per the install manifest', () => {
    // `.claude/` is out-of-tier per docs/GOVERNANCE_INDEX.md: "Tool config +
    // runtime state", NOT governance. Its contents are qor-logic-installed
    // artifacts reproduced by `qor-logic install --host claude --scope repo`,
    // and are deliberately untracked. So the declared roots must NOT be checked
    // against the filesystem or against git — a clean clone legitimately has
    // neither. The manifest is the authority on where the installer puts things,
    // and it is what this asserts the config agrees with.
    const manifestPath = path.join(REPO_ROOT, '.claude', '.qorlogic-installed.json');
    if (!fs.existsSync(manifestPath)) {
      // Clean clone before `qor-logic install` — nothing to cross-check against.
      return;
    }
    const files = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files || [];
    const rel = files.map((f) =>
      path.relative(REPO_ROOT, f.path).split(path.sep).join('/')
    );
    const cfg = readConfig();

    for (const key of ['skills_root', 'agents_root']) {
      const declared = cfg.layout[key];
      const installedUnder = rel.filter((p) => p.startsWith(declared + '/')).length;
      assert.ok(
        installedUnder > 0,
        `layout.${key} "${declared}" matches no path the installer wrote — ` +
          'the config points somewhere qor-logic does not install to'
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

  it('gives every permanent_skips declaration a justification of at least 50 characters', () => {
    // Upstream `permanent_skips._MIN_JUSTIFICATION` is 50, and a shorter one
    // RAISES at emission — after the skip event has already been built. Catching
    // it here means a malformed declaration can never reach a seal.
    const declared = readConfig().permanent_skips || {};
    assert.ok(
      Object.keys(declared).length > 0,
      'no permanent_skips declared; the emit-declare-close chain has nothing to close'
    );
    for (const [gate, justification] of Object.entries(declared)) {
      assert.equal(typeof justification, 'string', `permanent_skips.${gate} must be a string`);
      assert.ok(
        justification.length >= 50,
        `permanent_skips.${gate} justification is ${justification.length} chars; ` +
          'upstream requires >= 50 and raises at emission time'
      );
    }
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

  it('declares a ledger_anchor with an integer entry and a real justification', () => {
    // #233 Scope D. The anchor is file-sourced data that reaches a python
    // invocation, so a non-integer here is both unusable and an injection
    // surface; and a declaration without a reason is an anchor nobody can
    // review. Caught at config level, before the runner has to defend itself.
    const declared = readConfig().ledger_anchor;
    assert.ok(declared && typeof declared === 'object',
      'ledger_anchor must be declared; without it the verifier auto-detects a ' +
      'boundary that tolerates the entire ledger history');
    assert.ok(Number.isInteger(declared.entry),
      `ledger_anchor.entry must be an integer, got ${JSON.stringify(declared.entry)}`);
    assert.equal(typeof declared.reason, 'string');
    assert.ok(declared.reason.length >= 50,
      `ledger_anchor.reason is ${declared.reason.length} chars; an anchor that ` +
      'silently shrinks the verified surface needs a recorded why');
  });
});
