// FX891 — TrackerConfigRoute: GET derives from programs.yaml, POST is a governed
// local write (config + directive), remote requests are short-circuited.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import { setupTrackerConfigRoutes } from '../../roadmap/routes/TrackerConfigRoute';
import { CONSOLE_VERTICALS } from '../../roadmap/tracker/governance-projection';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp } from './helpers/routeTestHarness';

function tmpWs(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fx891-'));
}

function makeDeps(workspaceRoot: string, remote = false): ApiRouteDeps {
  return {
    workspaceRoot,
    rejectIfRemote: (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
      if (remote) { res.status(403).json({ error: 'remote' }); return true; }
      return false;
    },
    broadcast: () => { /* noop */ },
  } as unknown as ApiRouteDeps;
}

suite('FX891 TrackerConfigRoute', () => {
  let harness: RouteHarness;
  let ws: string;
  teardown(async () => {
    if (harness) await harness.stop();
    if (ws) { try { fs.rmSync(ws, { recursive: true, force: true }); } catch { /* best effort */ } }
  });

  test('GET /config with no config but a programs.yaml → source:derived + non-empty agents', async () => {
    ws = tmpWs();
    fs.mkdirSync(path.join(ws, 'docs', 'roadmap'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'docs', 'roadmap', 'programs.yaml'),
      'programs:\n  - {key: ci, name: CI, accent: "#0f0"}\n'
      + 'verticals:\n  - {key: ci, name: CI, accent: "#0f0"}\n'
      + 'phases:\n  - {prog: ci, key: A, rc: v1.0, w: 100, title: a}\n', 'utf-8');
    const app = makeApp();
    setupTrackerConfigRoutes(app, makeDeps(ws));
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'GET', path: '/api/v1/tracker/config' });
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'derived');
    assert.ok(res.body.config.agents.length >= 1, 'agents proposed from programs (FX887)');
    assert.equal(res.body.config.programs[0].key, 'ci');
  });

  test('POST /config writes tracker-config.yaml + the governed directive; returns written paths', async () => {
    ws = tmpWs();
    const app = makeApp();
    setupTrackerConfigRoutes(app, makeDeps(ws));
    harness = new RouteHarness(app);
    await harness.start();
    const body = { programs: [{ key: 'core', name: 'Core', accent: '#0f0' }], verticals: [], agents: [] };
    const res = await harness.request({ method: 'POST', path: '/api/v1/tracker/config', body });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.written.includes('docs/roadmap/tracker-config.yaml'));
    assert.ok(res.body.written.includes('.failsafe/governance/tracker-taxonomy.directive.md'));
    const cfg = fs.readFileSync(path.join(ws, 'docs', 'roadmap', 'tracker-config.yaml'), 'utf-8');
    assert.ok(cfg.includes('core'), 'posted program persisted to the config file');
    const directive = fs.readFileSync(path.join(ws, '.failsafe', 'governance', 'tracker-taxonomy.directive.md'), 'utf-8');
    assert.ok(directive.includes('`core`'), 'directive lists the declared program');
    assert.ok(directive.includes('MUST consult'), 'directive carries the must-consult clause');
  });

  test('POST /config from a remote request is short-circuited — NO file written', async () => {
    ws = tmpWs();
    const app = makeApp();
    setupTrackerConfigRoutes(app, makeDeps(ws, true));
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/v1/tracker/config', body: { programs: [{ key: 'x', name: 'X' }] } });
    assert.equal(res.status, 403);
    assert.ok(!fs.existsSync(path.join(ws, 'docs', 'roadmap', 'tracker-config.yaml')), 'no config written for a remote request');
  });
});

// #548 (T5) — GET/POST also report Console taxonomy drift; the source is decided first
// (by the config file's existence) and drift/lint can never move it to 'derived'; GET
// never writes the operator's file.
const CORRECT_PROGRAMS = 'verticals:\n' + CONSOLE_VERTICALS.map((v) =>
  `  - key: ${v.key}\n    name: ${v.name}\n    functionality:\n`
  + v.subviews.map((s) => `      - "**${s.label}** text"\n`).join('')).join('');

function configMissingShadowGenome(): string {
  return CORRECT_PROGRAMS.replace('      - "**Shadow Genome** text"\n', '');
}

function writeRoadmap(ws: string, name: string, text: string): string {
  const p = path.join(ws, 'docs', 'roadmap', name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf-8');
  return p;
}

suite('#548 TrackerConfigRoute taxonomy drift', () => {
  let harness: RouteHarness | undefined;
  let ws: string;
  async function start(remote = false): Promise<void> {
    const app = makeApp();
    setupTrackerConfigRoutes(app, makeDeps(ws, remote));
    harness = new RouteHarness(app);
    await harness.start();
  }
  const get = () => harness!.request({ method: 'GET', path: '/api/v1/tracker/config' });
  setup(() => { ws = tmpWs(); });
  teardown(async () => {
    if (harness) await harness.stop();
    harness = undefined;
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('T5a: a config missing Shadow Genome answers source config and names the gap', async () => {
    writeRoadmap(ws, 'tracker-config.yaml', configMissingShadowGenome());
    await start();
    const res = await get();
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'config');
    assert.equal(res.body.drift.applies, true);
    assert.equal(res.body.drift.drifted, 1);
    const gov = res.body.drift.verticals.find((v: { key: string }) => v.key === 'governance');
    assert.deepEqual(gov.missing, ['Shadow Genome']);
  });

  test('T5b: a corrected programs.yaml alone answers derived with no drift', async () => {
    writeRoadmap(ws, 'programs.yaml', CORRECT_PROGRAMS);
    await start();
    const res = await get();
    assert.equal(res.body.source, 'derived');
    assert.deepEqual([res.body.drift.applies, res.body.drift.drifted], [true, 0]);
  });

  test('T5c: neither file answers empty, and the comparison does not apply', async () => {
    await start();
    const res = await get();
    assert.equal(res.body.source, 'empty');
    assert.deepEqual([res.body.drift.applies, res.body.drift.matched], [false, 0]);
  });

  test('T5d: GET leaves the config byte- and mtime-identical and writes no directive', async () => {
    const cfg = writeRoadmap(ws, 'tracker-config.yaml', '# operator comment\n' + configMissingShadowGenome());
    const past = new Date(Date.now() - 3_600_000);
    fs.utimesSync(cfg, past, past);
    const before = fs.readFileSync(cfg);
    const mtime = fs.statSync(cfg).mtimeMs;
    await start();
    await get();
    await get();
    assert.ok(fs.readFileSync(cfg).equals(before), 'config bytes unchanged');
    assert.equal(fs.statSync(cfg).mtimeMs, mtime, 'config mtime unchanged');
    assert.ok(!fs.existsSync(path.join(ws, '.failsafe', 'governance', 'tracker-taxonomy.directive.md')), 'no directive written');
  });

  test('T5e: malformed rows (null vertical, scalar functionality, odd key, empty agents) still answer source config', async () => {
    writeRoadmap(ws, 'programs.yaml', CORRECT_PROGRAMS);
    writeRoadmap(ws, 'tracker-config.yaml', 'verticals:\n  - null\n  - key: governance\n    functionality: "Audit Log"\n  - key: {toString: 1}\nagents:\n');
    await start();
    const res = await get();
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'config', 'never falls back to programs.yaml');
    assert.equal(res.body.lint, undefined, 'the throwing lint is left out, not fatal');
    assert.ok(res.body.drift, 'drift is present');
    assert.equal(res.body.drift.matched, 1);
  });

  test('T5f: a config path that cannot be read answers 500, never derived', async () => {
    writeRoadmap(ws, 'programs.yaml', CORRECT_PROGRAMS);
    fs.mkdirSync(path.join(ws, 'docs', 'roadmap', 'tracker-config.yaml'));
    await start();
    const res = await get();
    assert.equal(res.status, 500);
    assert.match(String(res.body.error), /exists but could not be read/);
    assert.equal(res.body.source, undefined);
    assert.equal(res.body.config, undefined);
  });

  test('T5f2 (B305): a config that does not parse as a taxonomy answers 500, never an empty config', async () => {
    writeRoadmap(ws, 'programs.yaml', CORRECT_PROGRAMS);
    // N2: a programs/verticals/agents value that is neither a list nor empty is not a taxonomy either.
    for (const text of ['verticals: [unclosed\n', 'just a sentence\n', '- a\n- list\n', 'agents: nope\n', 'programs: 3\n', 'verticals:\n  a: 1\n']) {
      writeRoadmap(ws, 'tracker-config.yaml', text);
      if (!harness) await start();
      const res = await get();
      assert.equal(res.status, 500, JSON.stringify(text));
      assert.match(String(res.body.error), /exists but could not be parsed/);
      assert.equal(res.body.config, undefined);
    }
  });

  test('T5g: the POST answer carries the drift of what it saved', async () => {
    await start();
    const body = yaml.load(configMissingShadowGenome()) as Record<string, unknown>;
    const res = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { programs: [], agents: [], ...body } });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    const gov = res.body.drift.verticals.find((v: { key: string }) => v.key === 'governance');
    assert.deepEqual(gov.missing, ['Shadow Genome']);
  });

  test('T5f3 (N4): docs/roadmap that is a regular file answers 500, never derived or empty', async () => {
    fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'docs', 'roadmap'), 'not a folder', 'utf-8');
    await start();
    const res = await get();
    assert.equal(res.status, 500);
    assert.match(String(res.body.error), /docs\/roadmap is not a folder/);
    const post = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { programs: [], verticals: [], agents: [], fingerprint: null } });
    assert.equal(post.status, 500);
    assert.equal(fs.readFileSync(path.join(ws, 'docs', 'roadmap'), 'utf-8'), 'not a folder');
  });

  test('T5f4 (N1): a link at the config path answers 500 on GET and POST and is never followed', async () => {
    const target = path.join(ws, 'elsewhere');
    const cfg = path.join(ws, 'docs', 'roadmap', 'tracker-config.yaml');
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    // Windows creates a directory junction without admin rights; a file symlink needs them.
    if (process.platform === 'win32') fs.mkdirSync(target); else fs.writeFileSync(target, configMissingShadowGenome(), 'utf-8');
    fs.symlinkSync(target, cfg, process.platform === 'win32' ? 'junction' : 'file');
    try {
      await start();
      const res = await get();
      assert.equal(res.status, 500);
      assert.match(String(res.body.error), /symbolic link/);
      const post = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { programs: [], verticals: [], agents: [], fingerprint: null } });
      assert.equal(post.status, 500);
      assert.ok(fs.lstatSync(cfg).isSymbolicLink(), 'the link is left in place');
      if (process.platform !== 'win32') assert.equal(fs.readFileSync(target, 'utf-8'), configMissingShadowGenome(), 'the target is untouched');
      else assert.deepEqual(fs.readdirSync(target), [], 'nothing written into the junction target');
    } finally { fs.unlinkSync(cfg); }
  });

  test('T5i (B1): GET, then an edit on disk, then Save answers 409 and leaves the file byte-identical', async () => {
    const cfg = writeRoadmap(ws, 'tracker-config.yaml', configMissingShadowGenome());
    await start();
    const loaded = await get();
    assert.match(String(loaded.body.fingerprint), /^[0-9a-f]{64}$/);
    fs.appendFileSync(cfg, '# edited elsewhere\n');
    const edited = fs.readFileSync(cfg);
    const res = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { ...loaded.body.config, fingerprint: loaded.body.fingerprint } });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'changed-on-disk');
    assert.ok(fs.readFileSync(cfg).equals(edited), 'the newer file is kept');
    assert.ok(!fs.existsSync(path.join(ws, '.failsafe', 'governance', 'tracker-taxonomy.directive.md')), 'no directive written');
  });

  test('T5j (B1): absent at GET then created -> 409; present at GET then deleted -> 409', async () => {
    writeRoadmap(ws, 'programs.yaml', CORRECT_PROGRAMS);
    await start();
    const derived = await get();
    assert.deepEqual([derived.body.source, derived.body.fingerprint], ['derived', null]);
    const cfg = writeRoadmap(ws, 'tracker-config.yaml', '# created elsewhere\n');
    const created = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { ...derived.body.config, fingerprint: null } });
    assert.equal(created.status, 409);
    assert.equal(fs.readFileSync(cfg, 'utf-8'), '# created elsewhere\n');
    const loaded = await get();
    fs.rmSync(cfg);
    const deleted = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { ...loaded.body.config, fingerprint: loaded.body.fingerprint } });
    assert.equal(deleted.status, 409);
    assert.equal(fs.existsSync(cfg), false, 'a deleted file is not recreated');
  });

  test('T5k (B1): a matching fingerprint saves and returns the new one; a stale or malformed one does not', async () => {
    const cfg = writeRoadmap(ws, 'tracker-config.yaml', configMissingShadowGenome());
    await start();
    const loaded = await get();
    const first = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { ...loaded.body.config, fingerprint: loaded.body.fingerprint } });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const sha = crypto.createHash('sha256').update(fs.readFileSync(cfg)).digest('hex');
    assert.equal(first.body.fingerprint, sha, 'the answer names the bytes now on disk');
    const second = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { ...loaded.body.config, fingerprint: first.body.fingerprint } });
    assert.equal(second.status, 200);
    const stale = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { ...loaded.body.config, fingerprint: loaded.body.fingerprint } });
    assert.equal(stale.status, 409, 'the first fingerprint is stale after a save');
    for (const bad of [42, 'abc', { x: 1 }]) {
      const r = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { programs: [], verticals: [], agents: [], fingerprint: bad } });
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
  });

  test('T5l (B1): a POST with no fingerprint field over a present file answers 409', async () => {
    const cfg = writeRoadmap(ws, 'tracker-config.yaml', configMissingShadowGenome());
    const before = fs.readFileSync(cfg);
    await start();
    const res = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { programs: [], verticals: [], agents: [] } });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'changed-on-disk');
    assert.ok(fs.readFileSync(cfg).equals(before));
  });

  test('T5m (N4, POSIX only): a docs/roadmap that is a self-link (ELOOP) answers 500', async function () {
    if (process.platform === 'win32') { this.skip(); return; } // a self-symlink needs admin rights on Windows; Linux CI runs this row
    fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
    fs.symlinkSync('roadmap', path.join(ws, 'docs', 'roadmap'));
    try {
      await start();
      const res = await get();
      assert.equal(res.status, 500);
      const post = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { programs: [], verticals: [], agents: [], fingerprint: null } });
      assert.equal(post.status, 500);
    } finally { fs.unlinkSync(path.join(ws, 'docs', 'roadmap')); }
  });

  test('T5n (N-d): a file that appears between the check and the write is not overwritten (exclusive create, 409)', async () => {
    const cfg = path.join(ws, 'docs', 'roadmap', 'tracker-config.yaml');
    writeRoadmap(ws, 'tracker-config.yaml', '# appeared during the save\n');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const realFs = require('fs') as typeof fs;
    const original = realFs.lstatSync;
    let hidden = false;
    // The check sees no file once (as if it were created just after); the write must then fail.
    (realFs as { lstatSync: unknown }).lstatSync = ((p: fs.PathLike, ...rest: unknown[]) => {
      if (!hidden && path.resolve(String(p)) === path.resolve(cfg)) {
        hidden = true;
        throw Object.assign(new Error('ENOENT (test)'), { code: 'ENOENT' });
      }
      return (original as (...a: unknown[]) => fs.Stats)(p, ...rest);
    }) as typeof fs.lstatSync;
    try {
      await start();
      const res = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { programs: [], verticals: [], agents: [], fingerprint: null } });
      assert.equal(hidden, true, 'the check ran against the hidden file');
      assert.equal(res.status, 409);
      assert.equal(res.body.error, 'changed-on-disk');
    } finally { (realFs as { lstatSync: unknown }).lstatSync = original; }
    assert.equal(fs.readFileSync(cfg, 'utf-8'), '# appeared during the save\n');
  });

  test('T5o (N-e): a failed directive write still returns the new fingerprint, which the next Save uses', async () => {
    const cfg = writeRoadmap(ws, 'tracker-config.yaml', configMissingShadowGenome());
    fs.mkdirSync(path.join(ws, '.failsafe', 'governance', 'tracker-taxonomy.directive.md'), { recursive: true });
    await start();
    const loaded = await get();
    const res = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { ...loaded.body.config, fingerprint: loaded.body.fingerprint } });
    assert.equal(res.status, 500);
    assert.equal(res.body.error, 'directive-write-failed');
    assert.equal(res.body.fingerprint, crypto.createHash('sha256').update(fs.readFileSync(cfg)).digest('hex'), 'the fingerprint names the file now on disk');
    const next = await harness!.request({ method: 'POST', path: '/api/v1/tracker/config', body: { ...loaded.body.config, fingerprint: res.body.fingerprint } });
    assert.notEqual(next.status, 409, 'no false changed-on-disk after a partial save');
    assert.equal(next.body.error, 'directive-write-failed');
  });

  test('T5h (regression pin, not a falsifier): a remote GET answers 403 with no config and no drift', async () => {
    writeRoadmap(ws, 'tracker-config.yaml', configMissingShadowGenome());
    await start(true);
    const res = await get();
    assert.equal(res.status, 403);
    assert.equal(res.body.config, undefined);
    assert.equal(res.body.drift, undefined);
  });
});
