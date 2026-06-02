import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DependencyAdmissionLintModule,
  type DepAdmitIO,
} from '../../../qorlogic/substrate/DependencyAdmissionLintModule';

/**
 * B-SUBSTRATE-2 — DependencyAdmissionLintModule.run() with injected I/O.
 * No git, no network: resolveBaseRef/gitShow/fetchPublishTime/now are all fakes,
 * so the cooling-period behavior is verified deterministically (B-BIC-24 lesson).
 */

function mkWs(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-depadmit-'));
}

function writeManifest(ws: string, deps: Record<string, string>): void {
  fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ dependencies: deps }, null, 2));
}

const NOW = new Date('2026-06-02T00:00:00Z');

// Base manifest (what gitShow returns) and a publish-time table the fake registry serves.
function makeIO(baseManifest: Record<string, string>, times: Record<string, string | null>): DepAdmitIO {
  return {
    resolveBaseRef: () => 'BASEREF',
    gitShow: () => JSON.stringify({ dependencies: baseManifest }),
    fetchPublishTime: async (name, version) => {
      const iso = times[`${name}@${version}`];
      return iso ? new Date(iso) : null;
    },
    now: () => NOW,
  };
}

suite('DependencyAdmissionLintModule (B-SUBSTRATE-2)', () => {
  test('manifest not found → ok, 0 findings, explanatory note', async () => {
    const ws = mkWs();
    const m = new DependencyAdmissionLintModule(ws, { manifestRelPath: 'package.json' });
    const r = await m.run();
    assert.equal(r.ok, true);
    assert.equal(r.findings.length, 0);
    assert.match(r.summary.note ?? '', /manifest not found/);
  });

  test('no dependency changes vs base → 0 findings', async () => {
    const ws = mkWs();
    writeManifest(ws, { alpha: '1.0.0' });
    const m = new DependencyAdmissionLintModule(ws, {
      manifestRelPath: 'package.json',
      io: makeIO({ alpha: '1.0.0' }, {}),
    });
    const r = await m.run();
    assert.equal(r.findings.length, 0);
    assert.match(r.summary.note ?? '', /no dependency changes/);
  });

  test('freshly-added dep within window → one warn finding', async () => {
    const ws = mkWs();
    writeManifest(ws, { alpha: '1.0.0', fresh: '2.0.0' });
    const m = new DependencyAdmissionLintModule(ws, {
      manifestRelPath: 'package.json',
      io: makeIO({ alpha: '1.0.0' }, { 'fresh@2.0.0': '2026-05-31T00:00:00Z' }), // 2 days
    });
    const r = await m.run();
    const warns = r.findings.filter((f) => f.severity === 'warn');
    assert.equal(warns.length, 1);
    assert.equal(warns[0].rule, 'within-cooling-window');
    assert.match(warns[0].message, /fresh@2\.0\.0/);
  });

  test('within-window dep with META_LEDGER override → no warn finding', async () => {
    const ws = mkWs();
    writeManifest(ws, { fresh: '2.0.0' });
    fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(ws, 'docs', 'META_LEDGER.md'),
      '### Entry #999\n**Dependency admission override**: fresh@2.0.0; upload_age_days=2; justification=needed\n',
    );
    const m = new DependencyAdmissionLintModule(ws, {
      manifestRelPath: 'package.json',
      io: makeIO({}, { 'fresh@2.0.0': '2026-05-31T00:00:00Z' }),
    });
    const r = await m.run();
    assert.equal(r.findings.filter((f) => f.severity === 'warn').length, 0);
  });

  test('aged-out dep (older than window) → no finding', async () => {
    const ws = mkWs();
    writeManifest(ws, { old: '1.0.0' });
    const m = new DependencyAdmissionLintModule(ws, {
      manifestRelPath: 'package.json',
      io: makeIO({}, { 'old@1.0.0': '2026-04-01T00:00:00Z' }), // ~2 months
    });
    const r = await m.run();
    assert.equal(r.findings.length, 0);
  });

  test('registry returns no publish time → info finding, not a violation', async () => {
    const ws = mkWs();
    writeManifest(ws, { ghost: '0.0.1' });
    const m = new DependencyAdmissionLintModule(ws, {
      manifestRelPath: 'package.json',
      io: makeIO({}, { 'ghost@0.0.1': null }),
    });
    const r = await m.run();
    assert.equal(r.findings.filter((f) => f.severity === 'warn').length, 0);
    const infos = r.findings.filter((f) => f.severity === 'info');
    assert.equal(infos.length, 1);
    assert.equal(infos[0].rule, 'registry-query-failed');
  });
});
