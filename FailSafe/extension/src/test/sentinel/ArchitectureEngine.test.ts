// Functional tests for ArchitectureEngine (FX344).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ArchitectureEngine } from '../../sentinel/engines/ArchitectureEngine';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function mkfile(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

suite('ArchitectureEngine (FX344)', () => {
  let dir: string;
  setup(() => { dir = tmpDir('ae-'); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX344 analyzeWorkspace — empty workspace → score 100, no smells', async () => {
    const e = new ArchitectureEngine();
    const r = await e.analyzeWorkspace(dir);
    assert.equal(r.score, 100);
    assert.deepEqual(r.smells, []);
    assert.equal(r.metrics.languageCount, 0);
    assert.equal(r.metrics.serviceCount, 0);
  });

  test('FX344 analyzeWorkspace — clean ts-only project → no Polyglot Chaos', async () => {
    mkfile(dir, 'src/a.ts', 'export const a = 1;');
    mkfile(dir, 'src/b.ts', 'export const b = 2;');
    const e = new ArchitectureEngine();
    const r = await e.analyzeWorkspace(dir);
    assert.equal(r.metrics.languageCount, 1);
    assert.equal(r.smells.find(s => s.id === 'ARCH001'), undefined);
  });

  test('FX344 analyzeWorkspace — >3 languages → ARCH001 medium "Polyglot Chaos"', async () => {
    mkfile(dir, 'a.ts', '');
    mkfile(dir, 'b.js', '');
    mkfile(dir, 'c.py', '');
    mkfile(dir, 'd.rs', '');
    mkfile(dir, 'e.go', '');
    const e = new ArchitectureEngine();
    const r = await e.analyzeWorkspace(dir);
    assert.equal(r.metrics.languageCount, 5);
    const smell = r.smells.find(s => s.id === 'ARCH001');
    assert.ok(smell, 'should flag Polyglot Chaos');
    assert.equal(smell!.severity, 'medium');
    assert.match(smell!.description, /5 languages/);
  });

  test('FX344 analyzeWorkspace — service bloat with low contributor count → ARCH002 high', async () => {
    // Spawn 6 package.json manifests
    for (let i = 0; i < 6; i++) {
      mkfile(dir, `service-${i}/package.json`, '{}');
    }
    const e = new ArchitectureEngine({ contributors: 1, maxComplexity: 100 });
    const r = await e.analyzeWorkspace(dir);
    assert.equal(r.metrics.serviceCount, 6);
    const smell = r.smells.find(s => s.id === 'ARCH002');
    assert.ok(smell, 'should flag Service Bloat');
    assert.equal(smell!.severity, 'high');
  });

  test('FX344 analyzeWorkspace — service-to-contributor ratio ≤ 5 → no Service Bloat', async () => {
    for (let i = 0; i < 5; i++) {
      mkfile(dir, `service-${i}/package.json`, '{}');
    }
    const e = new ArchitectureEngine({ contributors: 1, maxComplexity: 100 });
    const r = await e.analyzeWorkspace(dir);
    assert.equal(r.smells.find(s => s.id === 'ARCH002'), undefined);
  });

  test('FX344 analyzeWorkspace — Framework Soup (React + Vue) → ARCH005 critical', async () => {
    mkfile(dir, 'package.json', JSON.stringify({
      dependencies: { react: '*', vue: '*' },
    }));
    const e = new ArchitectureEngine();
    const r = await e.analyzeWorkspace(dir);
    const smell = r.smells.find(s => s.id === 'ARCH005');
    assert.ok(smell, 'should flag Framework Soup');
    assert.equal(smell!.severity, 'critical');
  });

  test('FX344 analyzeWorkspace — single framework → no Framework Soup', async () => {
    mkfile(dir, 'package.json', JSON.stringify({ dependencies: { react: '*' } }));
    const e = new ArchitectureEngine();
    const r = await e.analyzeWorkspace(dir);
    assert.equal(r.smells.find(s => s.id === 'ARCH005'), undefined);
  });

  test('FX344 analyzeWorkspace — malformed package.json silently skipped', async () => {
    mkfile(dir, 'package.json', '{not-json');
    const e = new ArchitectureEngine();
    const r = await e.analyzeWorkspace(dir);
    // No crash; no Framework Soup smell
    assert.equal(r.smells.find(s => s.id === 'ARCH005'), undefined);
  });

  test('FX344 analyzeWorkspace — God Module flagged for >2000 lines', async () => {
    const huge = Array(2100).fill('// padding line content here').join('\n');
    // File needs to be >100KB for size-fast-path to trigger
    const padded = huge + '\n' + 'x'.repeat(110 * 1024);
    mkfile(dir, 'src/godmodule.ts', padded);
    const e = new ArchitectureEngine();
    const r = await e.analyzeWorkspace(dir);
    const smell = r.smells.find(s => s.id === 'ARCH004');
    assert.ok(smell, 'should flag God Module');
    assert.equal(smell!.severity, 'critical');
    assert.match(smell!.description, /2000 lines/);
  });

  test('FX344 analyzeWorkspace — score deducts per smell severity', async () => {
    // 1 critical (-20) + 1 medium (-5) = 75
    mkfile(dir, 'package.json', JSON.stringify({ dependencies: { react: '*', vue: '*' } }));
    mkfile(dir, 'a.ts', '');
    mkfile(dir, 'b.js', '');
    mkfile(dir, 'c.py', '');
    mkfile(dir, 'd.rs', '');
    const e = new ArchitectureEngine();
    const r = await e.analyzeWorkspace(dir);
    // ARCH001 (medium -5) + ARCH005 (critical -20) = 75
    assert.equal(r.score, 75);
  });

  test('FX344 analyzeWorkspace — score floors at 0', async () => {
    // Create 10 critical Framework Soups in 10 separate directories
    for (let i = 0; i < 10; i++) {
      mkfile(dir, `mod-${i}/package.json`, JSON.stringify({ dependencies: { react: '*', vue: '*' } }));
    }
    const e = new ArchitectureEngine();
    const r = await e.analyzeWorkspace(dir);
    assert.equal(r.score, 0);
  });
});
