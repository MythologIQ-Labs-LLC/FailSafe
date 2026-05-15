import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// We test the package.json command contribution + the source registration site.
// Direct invocation of vscode.commands requires the extension host runtime; the
// existing v5-coherence pattern reads package.json directly, so we follow it.

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

function readSource(rel: string): string {
  return fs.readFileSync(path.join(extensionRoot(), rel), 'utf8');
}

suite('failsafe.openFailSafeProAbout command', () => {
  test('package.json registers failsafe.openFailSafeProAbout', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    const commands: Array<{ command: string; title: string }> = pkg.contributes.commands;
    const found = commands.find((c) => c.command === 'failsafe.openFailSafeProAbout');
    assert.ok(found, 'failsafe.openFailSafeProAbout command should be registered in contributes.commands');
    assert.match(found!.title, /About FailSafe Pro/);
  });

  test('package.json does NOT register the legacy openFailSafeProDownload command', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    const commands: Array<{ command: string; title: string }> = pkg.contributes.commands;
    const legacy = commands.find((c) => c.command === 'failsafe.openFailSafeProDownload');
    assert.equal(legacy, undefined, 'legacy command name must not exist');
  });

  test('activation events include failsafe.openFailSafeProAbout', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), 'package.json'), 'utf8'));
    const events: string[] = pkg.activationEvents;
    assert.ok(events.includes('onCommand:failsafe.openFailSafeProAbout'));
    assert.equal(events.includes('onCommand:failsafe.openFailSafeProDownload'), false);
  });

  test('commands.ts registers the About command and points to the About URL constant', () => {
    const src = readSource('src/extension/commands.ts');
    assert.match(src, /registerCommand\(\s*["']failsafe\.openFailSafeProAbout["']/);
    assert.match(src, /FAILSAFE_PRO_ABOUT_URL/);
    // Legacy must be gone from the source.
    assert.equal(/registerCommand\(\s*["']failsafe\.openFailSafeProDownload["']/.test(src), false);
  });

  test('Settings webview (settings.js) opens the About command, not the download URL', () => {
    const src = readSource('src/roadmap/ui/modules/settings.js');
    assert.match(src, /failsafe\.openFailSafeProAbout|FAILSAFE_PRO_ABOUT_URL|products\/failsafe-pro/);
    // No direct anchor to the download URL from the Settings card.
    const downloadRefs = (src.match(/products\/failsafe-download/g) || []).length;
    assert.equal(downloadRefs, 0,
      'Settings card must not link directly to the download URL; learn page hosts the Download button');
  });
});
