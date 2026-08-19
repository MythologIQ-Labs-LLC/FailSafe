import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Locate repo root by walking up until we find package.json with name === 'mythologiq-failsafe'.
function extensionRoot(): string {
  let cur = __dirname;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(cur, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (pkg.name === 'mythologiq-failsafe') return cur;
      } catch { /* keep walking */ }
    }
    cur = path.dirname(cur);
  }
  throw new Error('Could not locate FailSafe extension root from test dir');
}

function repoRoot(): string {
  return path.resolve(extensionRoot(), '..', '..');
}

suite('v5 documentation coherence', () => {
  test('extension package.json version is a bare semver at major >= 5', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
    assert.ok(Number(pkg.version.split('.')[0]) >= 5,
      `major must be >= 5 (the v5 reveal baseline); got ${pkg.version}`);
  });

  test('extension package.json description is not the legacy "AI governance platform" framing', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    // Negative guard against any "AI governance" framing surviving the v5 reveal.
    assert.equal(/\bAI governance\b/i.test(pkg.description), false,
      `description should not contain "AI governance"; got: ${pkg.description}`);
  });

  test('extension package.json does NOT register failsafe.openFailSafeProAbout (removed 2026-08-19)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    const commands: Array<{ command: string; title: string }> = pkg.contributes.commands;
    assert.equal(commands.some((c) => c.command === 'failsafe.openFailSafeProAbout'), false,
      'the About-Pro command must be gone from contributes.commands');
    const events: string[] = pkg.activationEvents ?? [];
    assert.equal(events.includes('onCommand:failsafe.openFailSafeProAbout'), false,
      'the About-Pro activation event must be gone');
  });

  test('extension package.json declares failsafe.qorlogic.pythonPath setting', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties;
    assert.ok(props['failsafe.qorlogic.pythonPath'], 'pythonPath setting should exist');
    assert.equal(props['failsafe.qorlogic.pythonPath'].type, 'string');
  });

  // De-Pro directive (2026-08-19, two steps): LD-12 removed Pro from both
  // READMEs; the follow-on cycle removed the live surfaces too (About command,
  // Settings card, constants, PRO_INTEGRATION doc). These guards pin ABSENCE.
  test('root README contains no FailSafe Pro references (LD-12)', () => {
    const readme = fs.readFileSync(path.join(repoRoot(), 'README.md'), 'utf8');
    assert.equal(/failsafe pro\b|failsafe-pro/i.test(readme), false,
      'root README must not reference FailSafe Pro (name or URL slug)');
  });

  test('extension README contains no FailSafe Pro references but keeps PyPI qor-logic (LD-12)', () => {
    const readme = fs.readFileSync(path.join(extensionRoot(), 'README.md'), 'utf8');
    assert.equal(/failsafe pro\b|failsafe-pro/i.test(readme), false,
      'extension README must not reference FailSafe Pro (name or URL slug)');
    assert.match(readme, /pypi\.org\/project\/qor-logic/);
  });

  test('CHANGELOG has a v5.0.0 entry mentioning qor-logic and Install QorLogic Skills', () => {
    const changelog = fs.readFileSync(path.join(repoRoot(), 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /##\s+\[5\.0\.0\]/);
    // Find the v5.0.0 section explicitly — it may not be the first if newer
    // versions (e.g., 5.1.0) have been stamped above it.
    // Bound the section at the next `## [` heading. The previous `|$`
    // alternative (with /m) matched end-of-LINE — collapsing the non-greedy
    // quantifier to just the heading row whenever 5.0.0 had any content.
    const v5Match = changelog.match(/##\s+\[5\.0\.0\][\s\S]*?(?=^##\s+\[)/m);
    assert.ok(v5Match, 'expected to find ## [5.0.0] section');
    const v5Section = v5Match[0];
    assert.match(v5Section, /qor-logic/i);
    assert.match(v5Section, /Install QorLogic Skills/);
  });

  test('shared/constants.ts is deleted (Pro URLs removed 2026-08-19)', () => {
    assert.equal(fs.existsSync(path.join(extensionRoot(), 'src', 'shared', 'constants.ts')), false,
      'the Pro-URL constants module must not exist');
  });

  test('v5 docs exist at expected paths (PRO_INTEGRATION archived 2026-08-19)', () => {
    const docsDir = path.join(extensionRoot(), 'docs', 'v5');
    assert.equal(fs.existsSync(path.join(docsDir, 'PRO_INTEGRATION.md')), false,
      'PRO_INTEGRATION.md must be archived out of the public docs tree');
    assert.ok(fs.existsSync(path.join(docsDir, 'QORLOGIC_SKILL_INGESTION.md')));
  });
});
