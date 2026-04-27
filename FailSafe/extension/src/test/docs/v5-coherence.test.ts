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

const PRO_URL = 'https://mythologiq.studio/products/failsafe-download';

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

  test('extension package.json registers failsafe.openFailSafeProDownload command', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    const commands: Array<{ command: string; title: string }> = pkg.contributes.commands;
    const found = commands.find((c) => c.command === 'failsafe.openFailSafeProDownload');
    assert.ok(found, 'failsafe.openFailSafeProDownload command should be registered');
    assert.match(found!.title, /About FailSafe Pro/);
  });

  test('extension package.json declares failsafe.qorlogic.pythonPath setting', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties;
    assert.ok(props['failsafe.qorlogic.pythonPath'], 'pythonPath setting should exist');
    assert.equal(props['failsafe.qorlogic.pythonPath'].type, 'string');
  });

  test('root README links to canonical Pro URL exactly once', () => {
    const readme = fs.readFileSync(path.join(repoRoot(), 'README.md'), 'utf8');
    const matches = readme.match(/https:\/\/mythologiq\.studio\/products\/failsafe-download/g) || [];
    assert.ok(matches.length >= 1, 'root README should link to Pro download URL');
    assert.equal(matches.length, 1, `root README should link Pro URL exactly once (found ${matches.length})`);
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
    const v5Section = changelog.split(/##\s+\[/)[1] || '';
    assert.match(v5Section, /qor-logic/i);
    assert.match(v5Section, /Install QorLogic Skills/);
  });

  test('shared/constants.ts FAILSAFE_PRO_DOWNLOAD_URL matches docs URL', () => {
    const constants = fs.readFileSync(
      path.join(extensionRoot(), 'src', 'shared', 'constants.ts'), 'utf8',
    );
    assert.ok(constants.includes(PRO_URL), `constants.ts should contain ${PRO_URL}`);
  });

  test('v5 docs exist at expected paths', () => {
    const docsDir = path.join(extensionRoot(), 'docs', 'v5');
    assert.ok(fs.existsSync(path.join(docsDir, 'PRO_INTEGRATION.md')));
    assert.ok(fs.existsSync(path.join(docsDir, 'QORLOGIC_SKILL_INGESTION.md')));
  });
});
