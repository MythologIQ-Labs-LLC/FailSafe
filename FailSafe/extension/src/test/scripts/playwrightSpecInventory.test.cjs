/**
 * Regression tests for playwright-spec-inventory.cjs (v5.1.0 lift Phase 1).
 *
 * Runs standalone: node --test src/test/scripts/playwrightSpecInventory.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const inventory = require(path.resolve(
  __dirname, '..', '..', '..', 'scripts', 'lib', 'playwright-spec-inventory.cjs',
));

function mkTempRepo(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeBrowserVerification(repoRoot, specPaths) {
  const dir = path.join(repoRoot, '.failsafe', 'governance');
  fs.mkdirSync(dir, { recursive: true });
  const rows = specPaths.map((p) =>
    `- [ ] Surface (\`${p}\`) — last run: <ts>, result: <r>`,
  ).join('\n');
  const body = [
    '# FailSafe v5.1.0 — Browser Verification Evidence',
    '',
    '**Active**: yes',
    '',
    '## Playwright-covered pages',
    '',
    rows,
    '',
    '## Screenshot-covered pages (Playwright cannot reach)',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'BROWSER_VERIFICATION.md'), body, 'utf8');
}

function writeUiSpec(repoRoot, relPath) {
  const full = path.join(repoRoot, 'FailSafe', 'extension', 'src', 'test', 'ui', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, '// stub spec\n', 'utf8');
}

describe('playwright-spec-inventory loadRequiredSpecs', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-inventory-required-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('returns empty Set when BROWSER_VERIFICATION.md absent', () => {
    const result = inventory.loadRequiredSpecs(tmp);
    assert.equal(result.size, 0);
  });

  it('parses spec paths from `## Playwright-covered pages` section', () => {
    writeBrowserVerification(tmp, [
      'src/test/ui/monitor.spec.ts',
      'src/test/ui/command-center-overview.spec.ts',
      'src/test/ui/command-center-settings.spec.ts',
    ]);
    const result = inventory.loadRequiredSpecs(tmp);
    assert.equal(result.size, 3);
    assert.ok(result.has('src/test/ui/monitor.spec.ts'));
    assert.ok(result.has('src/test/ui/command-center-overview.spec.ts'));
    assert.ok(result.has('src/test/ui/command-center-settings.spec.ts'));
  });

  it('strips leading FailSafe/extension/ from cited paths so disk + required anchor match', () => {
    writeBrowserVerification(tmp, ['FailSafe/extension/src/test/ui/monitor.spec.ts']);
    const result = inventory.loadRequiredSpecs(tmp);
    assert.ok(result.has('src/test/ui/monitor.spec.ts'));
    assert.ok(!result.has('FailSafe/extension/src/test/ui/monitor.spec.ts'));
  });

  it('does NOT pick up spec paths from sections after Playwright-covered', () => {
    writeBrowserVerification(tmp, ['src/test/ui/monitor.spec.ts']);
    // Append a section that mentions a spec path; the parser must stop at next `## `.
    const file = path.join(tmp, '.failsafe', 'governance', 'BROWSER_VERIFICATION.md');
    fs.appendFileSync(file, '\n### Decoy\n- `src/test/ui/decoy.spec.ts`\n', 'utf8');
    const result = inventory.loadRequiredSpecs(tmp);
    assert.ok(result.has('src/test/ui/monitor.spec.ts'));
    assert.ok(!result.has('src/test/ui/decoy.spec.ts'));
  });
});

describe('playwright-spec-inventory loadDiskSpecs', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-inventory-disk-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('returns empty Set when spec dir absent', () => {
    const result = inventory.loadDiskSpecs(tmp);
    assert.equal(result.size, 0);
  });

  it('globs all *.spec.ts entries; ignores other files', () => {
    writeUiSpec(tmp, 'monitor.spec.ts');
    writeUiSpec(tmp, 'command-center-overview.spec.ts');
    // Non-spec sibling — must be ignored.
    const sibling = path.join(tmp, 'FailSafe', 'extension', 'src', 'test', 'ui', 'helpers.ts');
    fs.writeFileSync(sibling, '// helper\n', 'utf8');
    const result = inventory.loadDiskSpecs(tmp);
    assert.equal(result.size, 2);
    assert.ok(result.has('src/test/ui/monitor.spec.ts'));
    assert.ok(result.has('src/test/ui/command-center-overview.spec.ts'));
    assert.ok(!result.has('src/test/ui/helpers.ts'));
  });
});

describe('playwright-spec-inventory compareInventory', () => {
  it('all-aligned → missing=[] extra=[]', () => {
    const required = new Set(['a.spec.ts', 'b.spec.ts']);
    const disk = new Set(['a.spec.ts', 'b.spec.ts']);
    assert.deepEqual(inventory.compareInventory(required, disk), { missing: [], extra: [] });
  });

  it('required spec not on disk → missing contains it', () => {
    const required = new Set(['a.spec.ts', 'b.spec.ts']);
    const disk = new Set(['a.spec.ts']);
    assert.deepEqual(inventory.compareInventory(required, disk), {
      missing: ['b.spec.ts'], extra: [],
    });
  });

  it('disk spec not in required → extra contains it (informational)', () => {
    const required = new Set(['a.spec.ts']);
    const disk = new Set(['a.spec.ts', 'bonus.spec.ts']);
    assert.deepEqual(inventory.compareInventory(required, disk), {
      missing: [], extra: ['bonus.spec.ts'],
    });
  });

  it('both classes simultaneously', () => {
    const required = new Set(['a.spec.ts', 'b.spec.ts', 'c.spec.ts']);
    const disk = new Set(['a.spec.ts', 'd.spec.ts']);
    assert.deepEqual(inventory.compareInventory(required, disk), {
      missing: ['b.spec.ts', 'c.spec.ts'], extra: ['d.spec.ts'],
    });
  });
});

describe('playwright-spec-inventory end-to-end against temp repo', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-inventory-e2e-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('fully-aligned repo → empty delta', () => {
    const specs = ['monitor.spec.ts', 'command-center-overview.spec.ts'];
    writeBrowserVerification(tmp, specs.map((s) => `src/test/ui/${s}`));
    for (const s of specs) writeUiSpec(tmp, s);
    const required = inventory.loadRequiredSpecs(tmp);
    const disk = inventory.loadDiskSpecs(tmp);
    const delta = inventory.compareInventory(required, disk);
    assert.deepEqual(delta.missing, []);
  });

  it('rename a required spec → missing reports the renamed-away path', () => {
    writeBrowserVerification(tmp, [
      'src/test/ui/monitor.spec.ts',
      'src/test/ui/command-center-overview.spec.ts',
    ]);
    writeUiSpec(tmp, 'monitor.spec.ts');
    writeUiSpec(tmp, 'renamed-overview.spec.ts'); // not the required name
    const delta = inventory.compareInventory(
      inventory.loadRequiredSpecs(tmp),
      inventory.loadDiskSpecs(tmp),
    );
    assert.deepEqual(delta.missing, ['src/test/ui/command-center-overview.spec.ts']);
    assert.deepEqual(delta.extra, ['src/test/ui/renamed-overview.spec.ts']);
  });
});
