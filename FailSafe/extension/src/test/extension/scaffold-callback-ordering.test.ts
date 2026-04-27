import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Regression guard for the bug where `consoleServer.setScaffoldCallback(...)`
// ran AFTER `await consoleServer.start()`, leaving the route deps with a null
// scaffoldCallback captured at startup. Symptom: POST /api/actions/scaffold-skills
// returned 501 "Scaffold not available" even after the install handler was
// constructed and registered.
//
// The fix is structural: setScaffoldCallback must run before start().

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

function indexOfFirst(haystack: string, pattern: RegExp): number {
  const match = pattern.exec(haystack);
  return match ? match.index : -1;
}

suite('bootstrapServers: scaffold callback ordering (regression for #48 fix)', () => {
  test('setScaffoldCallback appears before consoleServer.start() in bootstrapServers.ts', () => {
    const src = readSource('src/extension/bootstrapServers.ts');
    const setIdx = indexOfFirst(src, /\bconsoleServer\.setScaffoldCallback\(/);
    const startIdx = indexOfFirst(src, /\bawait\s+consoleServer\.start\(\)/);
    assert.ok(setIdx >= 0, 'expected consoleServer.setScaffoldCallback(...) call');
    assert.ok(startIdx >= 0, 'expected await consoleServer.start() call');
    assert.ok(
      setIdx < startIdx,
      'setScaffoldCallback must run BEFORE start() — otherwise the route deps capture a null callback and /api/actions/scaffold-skills returns 501',
    );
  });

  test('createInstallSkillsHandler is constructed in bootstrapServers (route wiring)', () => {
    const src = readSource('src/extension/bootstrapServers.ts');
    assert.match(src, /createInstallSkillsHandler\(/);
  });

  test('install handler is wired with onProgress + onComplete broadcast callbacks', () => {
    const src = readSource('src/extension/bootstrapServers.ts');
    assert.match(src, /onProgress[\s\S]*broadcastEvent[\s\S]*skills\.install\.progress/);
    assert.match(src, /onComplete[\s\S]*broadcastEvent[\s\S]*skills\.install\.complete/);
    assert.match(src, /hub\.refresh/);
  });
});
