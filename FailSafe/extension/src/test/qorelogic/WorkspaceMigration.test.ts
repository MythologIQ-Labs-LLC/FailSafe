// Functional tests for WorkspaceMigration static helpers (FX339).
// Note: most internal methods are private — accessed via casts to test pure logic.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceMigration } from '../../qorelogic/WorkspaceMigration';

const FAILSAFE_DEV_CONFIG = {
  organizationExclusions: [
    '.agent/', '.claude/', '.qorelogic/', '.failsafe/',
    'src/', 'qorelogic/', 'build/', 'targets/', 'PROD-Extension/',
  ],
  exclusionReason:
    'FailSafe development workspace: governance directories and extension source code must not be reorganized',
  workspaceType: 'failsafe-development',
};

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wm-'));
}

suite('WorkspaceMigration (FX339)', () => {
  let dir: string;
  setup(() => { dir = tmpRoot(); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX339 calculateHash — deterministic 64-char hex (excluding configHash + detectedAt)', () => {
    const calc = (WorkspaceMigration as any).calculateHash.bind(WorkspaceMigration);
    const h1 = calc({ a: 1, b: 2 });
    const h2 = calc({ a: 1, b: 2 });
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
    assert.match(h1, /^[0-9a-f]{64}$/);
    assert.notEqual(calc({ a: 1, b: 3 }), h1);
  });

  test('FX339 calculateHash — strips configHash + detectedAt before hashing', () => {
    const calc = (WorkspaceMigration as any).calculateHash.bind(WorkspaceMigration);
    const h1 = calc({ a: 1 });
    const h2 = calc({ a: 1, configHash: 'should-be-ignored', detectedAt: 'also-ignored' });
    assert.equal(h1, h2);
  });

  test('FX339 loadExistingConfig — missing file returns exists=false, corrupted=false', async () => {
    const load = (WorkspaceMigration as any).loadExistingConfig.bind(WorkspaceMigration);
    const r = await load(path.join(dir, 'absent.json'));
    assert.equal(r.exists, false);
    assert.equal(r.corrupted, false);
    assert.deepEqual(r.config, {});
  });

  test('FX339 loadExistingConfig — valid JSON returns parsed config', async () => {
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify({ workspaceType: 'failsafe-development', count: 42 }));
    const load = (WorkspaceMigration as any).loadExistingConfig.bind(WorkspaceMigration);
    const r = await load(file);
    assert.equal(r.exists, true);
    assert.equal(r.corrupted, false);
    assert.equal(r.config.workspaceType, 'failsafe-development');
    assert.equal(r.config.count, 42);
  });

  test('FX339 loadExistingConfig — corrupt JSON returns corrupted=true', async () => {
    const file = path.join(dir, 'corrupt.json');
    fs.writeFileSync(file, '{not-json');
    const load = (WorkspaceMigration as any).loadExistingConfig.bind(WorkspaceMigration);
    const r = await load(file);
    assert.equal(r.exists, true);
    assert.equal(r.corrupted, true);
  });

  test('FX339 validateConfigIntegrity — no configHash → trusted (true)', () => {
    const validate = (WorkspaceMigration as any).validateConfigIntegrity.bind(WorkspaceMigration);
    assert.equal(validate({ workspaceType: 'foo' }), true);
  });

  test('FX339 validateConfigIntegrity — matching hash → true', () => {
    const calc = (WorkspaceMigration as any).calculateHash.bind(WorkspaceMigration);
    const validate = (WorkspaceMigration as any).validateConfigIntegrity.bind(WorkspaceMigration);
    const cfg: Record<string, unknown> = { workspaceType: 'foo', x: 1 };
    cfg.configHash = calc(cfg);
    assert.equal(validate(cfg), true);
  });

  test('FX339 validateConfigIntegrity — tampered config → false', () => {
    const calc = (WorkspaceMigration as any).calculateHash.bind(WorkspaceMigration);
    const validate = (WorkspaceMigration as any).validateConfigIntegrity.bind(WorkspaceMigration);
    const cfg: Record<string, unknown> = { workspaceType: 'foo' };
    cfg.configHash = calc(cfg);
    cfg.workspaceType = 'tampered';
    assert.equal(validate(cfg), false);
  });

  test('FX339 checkConfigAlignment — exact FAILSAFE_DEV_CONFIG alignment → true', () => {
    const check = (WorkspaceMigration as any).checkConfigAlignment.bind(WorkspaceMigration);
    assert.equal(check(FAILSAFE_DEV_CONFIG), true);
  });

  test('FX339 checkConfigAlignment — missing/extra exclusion → false', () => {
    const check = (WorkspaceMigration as any).checkConfigAlignment.bind(WorkspaceMigration);
    const cfg = {
      ...FAILSAFE_DEV_CONFIG,
      organizationExclusions: ['.agent/'],
    };
    assert.equal(check(cfg), false);
  });

  test('FX339 checkConfigAlignment — wrong workspaceType → false', () => {
    const check = (WorkspaceMigration as any).checkConfigAlignment.bind(WorkspaceMigration);
    const cfg = {
      ...FAILSAFE_DEV_CONFIG,
      workspaceType: 'something-else',
    };
    assert.equal(check(cfg), false);
  });

  test('FX339 isProprietaryWorkspace — no indicator dirs → false', async () => {
    const detect = (WorkspaceMigration as any).isProprietaryWorkspace.bind(WorkspaceMigration);
    assert.equal(await detect(dir), false);
  });

  test('FX339 isProprietaryWorkspace — only some indicators present → false (requires ALL)', async () => {
    fs.mkdirSync(path.join(dir, 'src/Genesis/workflows'), { recursive: true });
    const detect = (WorkspaceMigration as any).isProprietaryWorkspace.bind(WorkspaceMigration);
    assert.equal(await detect(dir), false);
  });

  test('FX339 isProprietaryWorkspace — all 3 indicators present → true', async () => {
    fs.mkdirSync(path.join(dir, 'src/Genesis/workflows'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'build/transform.ps1'), '');
    fs.mkdirSync(path.join(dir, 'targets/Antigravity'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'targets/Antigravity/constraints.yml'), '');
    const detect = (WorkspaceMigration as any).isProprietaryWorkspace.bind(WorkspaceMigration);
    assert.equal(await detect(dir), true);
  });

  test('FX339 writeAlignedConfig — writes config to disk with hash + detectedAt', async () => {
    // Stub vscode.window.showInformationMessage which writeAlignedConfig calls
    const vscode = require('vscode');
    const orig = vscode.window.showInformationMessage;
    vscode.window.showInformationMessage = async () => undefined;
    try {
      const write = (WorkspaceMigration as any).writeAlignedConfig.bind(WorkspaceMigration);
      const file = path.join(dir, 'workspace-config.json');
      await write(file);
      assert.ok(fs.existsSync(file));
      const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
      assert.equal(cfg.workspaceType, 'failsafe-development');
      assert.match(cfg.configHash, /^[0-9a-f]{64}$/);
      assert.match(cfg.detectedAt, /^\d{4}-\d{2}-\d{2}T/);
    } finally {
      vscode.window.showInformationMessage = orig;
    }
  });
});

// FX435 — .failsafe/ seeding produces observable migration output.
// FEATURE_INDEX claim: "Workspace seeding (.failsafe/)" must create the
// .failsafe/ tree, write workspace-config.json with sha256 configHash + ISO
// detectedAt, and add a .failsafe/ entry to .gitignore.
// Exercises private repairConfig() (the entrypoint reached from checkAndRepair)
// end-to-end against a temp-dir fixture; asserts on fs side-effects, not state.
// Acceptance: the temp dir starts empty, so a silent no-op cannot pre-create
// the config file or .gitignore line — both assertions would fail.
suite('WorkspaceMigration FX435 — .failsafe/ seeding observable output', () => {
  let dir: string;
  let vscodeMod: any;
  let origWarning: any;
  let origInfo: any;

  setup(() => {
    dir = tmpRoot();
    vscodeMod = require('vscode');
    origWarning = vscodeMod.window.showWarningMessage;
    origInfo = vscodeMod.window.showInformationMessage;
    // Stub prompt: pretend operator chose the alignment action (first option).
    vscodeMod.window.showWarningMessage = async (_m: string, ...a: string[]) => a[0];
    vscodeMod.window.showInformationMessage = async () => undefined;
  });

  teardown(() => {
    if (vscodeMod) {
      vscodeMod.window.showWarningMessage = origWarning;
      vscodeMod.window.showInformationMessage = origInfo;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('FX435 repairConfig seeds .failsafe/workspace-config.json with hash + detectedAt', async () => {
    const configFile = path.join(dir, '.failsafe', 'workspace-config.json');
    assert.equal(fs.existsSync(configFile), false, 'precondition: config absent');

    const repair = (WorkspaceMigration as any).repairConfig.bind(WorkspaceMigration);
    await repair(dir);

    assert.ok(fs.existsSync(path.join(dir, '.failsafe')), '.failsafe/ must exist');
    assert.ok(fs.existsSync(configFile), 'workspace-config.json must be written');
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

    // Fields produced specifically by writeAlignedConfig — prove end-to-end run.
    assert.equal(cfg.workspaceType, 'failsafe-development');
    assert.ok(Array.isArray(cfg.organizationExclusions));
    assert.ok(cfg.organizationExclusions.includes('.failsafe/'));
    assert.ok(cfg.organizationExclusions.includes('.claude/'));
    assert.match(cfg.configHash, /^[0-9a-f]{64}$/, 'configHash must be sha256 hex');
    assert.match(cfg.detectedAt, /^\d{4}-\d{2}-\d{2}T/, 'detectedAt must be ISO');

    // Cross-check: persisted hash validates against payload (not a placeholder).
    const validate = (WorkspaceMigration as any).validateConfigIntegrity.bind(WorkspaceMigration);
    assert.equal(validate(cfg), true, 'persisted configHash must validate');
  });

  test('FX435 repairConfig adds .failsafe/ entry to workspace .gitignore', async () => {
    const gitignore = path.join(dir, '.gitignore');
    assert.equal(fs.existsSync(gitignore), false, 'precondition: .gitignore absent');

    const repair = (WorkspaceMigration as any).repairConfig.bind(WorkspaceMigration);
    await repair(dir);

    assert.ok(fs.existsSync(gitignore), '.gitignore must be created');
    const contents = fs.readFileSync(gitignore, 'utf-8');
    assert.match(contents, /(^|\r?\n)\.failsafe\/\s*(\r?\n|$)/,
      '.gitignore must contain a .failsafe/ exclusion line');
  });

  test('FX435 repairConfig is idempotent — second seed leaves aligned config intact', async () => {
    const repair = (WorkspaceMigration as any).repairConfig.bind(WorkspaceMigration);
    const configFile = path.join(dir, '.failsafe', 'workspace-config.json');

    await repair(dir);
    const first = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

    // Second seed: aligned config must NOT be rewritten (no prompt path taken).
    await repair(dir);
    const second = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

    assert.equal(second.configHash, first.configHash, 'hash unchanged on re-seed');
    assert.equal(second.detectedAt, first.detectedAt, 'detectedAt unchanged on re-seed');
  });
});
