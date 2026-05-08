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

const PRO_ABOUT_URL = 'https://mythologiq.studio/products/failsafe-pro';
const PRO_DOWNLOAD_URL = 'https://mythologiq.studio/products/failsafe-download';

suite('v5 documentation coherence', () => {
  test('extension package.json version matches /^5\\.\\d+\\.\\d+$/', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    assert.match(pkg.version, /^5\.\d+\.\d+$/);
  });

  test('extension package.json description is not the legacy "AI governance platform" framing', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    // Negative guard against any "AI governance" framing surviving the v5 reveal.
    assert.equal(/\bAI governance\b/i.test(pkg.description), false,
      `description should not contain "AI governance"; got: ${pkg.description}`);
  });

  test('extension package.json registers failsafe.openFailSafeProAbout command', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    const commands: Array<{ command: string; title: string }> = pkg.contributes.commands;
    const found = commands.find((c) => c.command === 'failsafe.openFailSafeProAbout');
    assert.ok(found, 'failsafe.openFailSafeProAbout command should be registered');
    assert.match(found!.title, /About FailSafe Pro/);
  });

  test('extension package.json declares failsafe.qorlogic.pythonPath setting', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties;
    assert.ok(props['failsafe.qorlogic.pythonPath'], 'pythonPath setting should exist');
    assert.equal(props['failsafe.qorlogic.pythonPath'].type, 'string');
  });

  test('root README links to the Pro about URL at least once', () => {
    const readme = fs.readFileSync(path.join(repoRoot(), 'README.md'), 'utf8');
    const matches = readme.match(/https:\/\/mythologiq\.studio\/products\/failsafe-pro\b/g) || [];
    assert.ok(matches.length >= 1, 'root README should link to Pro about URL');
  });

  test('root README has FailSafe / FailSafe Pro section', () => {
    const readme = fs.readFileSync(path.join(repoRoot(), 'README.md'), 'utf8');
    assert.match(readme, /##\s+FailSafe and FailSafe Pro/);
  });

  test('extension README mentions FailSafe Pro and PyPI qor-logic', () => {
    const readme = fs.readFileSync(path.join(extensionRoot(), 'README.md'), 'utf8');
    assert.match(readme, /FailSafe Pro/);
    assert.match(readme, /pypi\.org\/project\/qor-logic/);
  });

  test('CHANGELOG has a v5.0.0 entry mentioning qor-logic and Install QorLogic Skills', () => {
    const changelog = fs.readFileSync(path.join(repoRoot(), 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /##\s+\[5\.0\.0\]/);
    // Find the v5.0.0 section explicitly — it may not be the first if newer
    // versions (e.g., 5.1.0) have been stamped above it.
    const v5Match = changelog.match(/##\s+\[5\.0\.0\][\s\S]*?(?=^##\s+\[|\Z)/m);
    assert.ok(v5Match, 'expected to find ## [5.0.0] section');
    const v5Section = v5Match[0];
    assert.match(v5Section, /qor-logic/i);
    assert.match(v5Section, /Install QorLogic Skills/);
  });

  test('shared/constants.ts contains both ABOUT and DOWNLOAD URL constants', () => {
    const constants = fs.readFileSync(
      path.join(extensionRoot(), 'src', 'shared', 'constants.ts'), 'utf8',
    );
    assert.ok(constants.includes(PRO_ABOUT_URL), `constants.ts should contain ${PRO_ABOUT_URL}`);
    assert.ok(constants.includes(PRO_DOWNLOAD_URL), `constants.ts should contain ${PRO_DOWNLOAD_URL}`);
  });

  test('v5 docs exist at expected paths', () => {
    const docsDir = path.join(extensionRoot(), 'docs', 'v5');
    assert.ok(fs.existsSync(path.join(docsDir, 'PRO_INTEGRATION.md')));
    assert.ok(fs.existsSync(path.join(docsDir, 'QORLOGIC_SKILL_INGESTION.md')));
  });
});
