// #548 (T10): the Console tracker and the Taxonomy config route in the real extension host.
//
// Runs only in the `architecture-index` vscode-test configuration, whose workspace is a fresh
// temp git repository. Activates FailSafe, finds this extension host's live Console server in
// the server registry (read-only: the JSON file is read directly, because readRegistry()
// rewrites it), copies the repository's tracked docs/roadmap/programs.yaml into the workspace,
// and checks over HTTP that:
//   - GET /api/v1/tracker serves that manifest, whose vertical functionality labels are exactly
//     the Console sub-views (CONSOLE_VERTICALS);
//   - GET /api/v1/tracker/config derives from it with no drift;
//   - a drifting tracker-config.yaml is reported (governance missing Shadow Genome) and the
//     file is byte-identical afterwards.
// suiteTeardown removes every file and folder this suite created, whichever suite runs first.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CONSOLE_VERTICALS } from '../../roadmap/tracker/governance-projection';
import { functionalityLabel } from '../../roadmap/tracker/taxonomy-drift';
import { resolveTestRepoPath } from '../roadmap/tracker/test-repo-root';

const sameDir = (a: string, b: string): boolean => {
  const norm = (p: string) => {
    let r = path.resolve(p);
    try { r = fs.realpathSync.native(r); } catch { /* keep resolved */ }
    return r.toLowerCase();
  };
  return norm(a) === norm(b);
};

/** This extension host's Console port, from ~/.failsafe/servers.json (read-only). */
async function consolePort(root: string): Promise<number> {
  const registry = path.join(os.homedir(), '.failsafe', 'servers.json');
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const doc = JSON.parse(fs.readFileSync(registry, 'utf-8')) as { servers?: Array<{ port: number; pid: number; workspacePath: string }> };
      const hit = (doc.servers ?? []).filter((s) => s.pid === process.pid).find((s) => sameDir(s.workspacePath, root));
      if (hit) return hit.port;
    } catch { /* not written yet */ }
    if (Date.now() > deadline) throw new Error(`no Console server registered for pid ${process.pid} and ${root}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

function getJson(port: number, urlPath: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: 30000 }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 0, body: JSON.parse(data) }); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout on ${urlPath}`)));
    req.on('error', reject);
  });
}

suite('#548 Console taxonomy (extension host, temp git workspace)', () => {
  let root = '';
  let port = 0;
  const created: string[] = [];

  suiteSetup(async function () {
    this.timeout(120000);
    root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    assert.ok(root && fs.existsSync(path.join(root, '.git')), `workspace ${root} is the temp git repository`);
    const ext = vscode.extensions.getExtension('MythologIQ.mythologiq-failsafe');
    if (!ext) throw new Error('Extension not found in test host');
    if (!ext.isActive) await ext.activate();
    port = await consolePort(root);
    const roadmap = path.join(root, 'docs', 'roadmap');
    for (const dir of [path.join(root, 'docs'), roadmap]) {
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir); created.unshift(dir); }
    }
    const programs = path.join(roadmap, 'programs.yaml');
    assert.equal(fs.existsSync(programs), false, 'the temp workspace has no programs.yaml of its own');
    fs.copyFileSync(resolveTestRepoPath('docs', 'roadmap', 'programs.yaml'), programs);
    created.unshift(programs);
  });

  suiteTeardown(() => {
    for (const p of created) {
      try {
        if (fs.statSync(p).isDirectory()) { if (fs.readdirSync(p).length === 0) fs.rmdirSync(p); } else fs.rmSync(p, { force: true });
      } catch { /* already gone */ }
    }
  });

  test('the Console tracker shows each vertical\'s Console sub-views as its functionality', async () => {
    const res = await getJson(port, '/api/v1/tracker');
    assert.equal(res.status, 200);
    assert.equal(res.body.manifestSource, 'operator');
    for (const v of CONSOLE_VERTICALS) {
      const shown = (res.body.verticals as Array<{ key: string; functionality?: unknown[] }>).find((x) => x.key === v.key);
      assert.ok(shown, `${v.key} is shown`);
      assert.deepEqual((shown.functionality ?? []).map(functionalityLabel), v.subviews.map((s) => s.label), `${v.key} functionality`);
    }
  });

  test('the Taxonomy config derives from it with no drift', async () => {
    const res = await getJson(port, '/api/v1/tracker/config');
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'derived');
    assert.deepEqual([res.body.drift?.applies, res.body.drift?.drifted], [true, 0]);
  });

  test('a drifting tracker-config.yaml is reported and left byte-identical', async () => {
    const cfg = path.join(root, 'docs', 'roadmap', 'tracker-config.yaml');
    const programs = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'programs.yaml'), 'utf-8');
    const text = programs.replace(/^\s*- "\*\*Shadow Genome\*\*[^\n]*\n/m, '');
    assert.notEqual(text, programs, 'the Shadow Genome line was removed');
    fs.writeFileSync(cfg, text, 'utf-8');
    created.unshift(cfg);
    const before = fs.readFileSync(cfg);
    const res = await getJson(port, '/api/v1/tracker/config');
    assert.equal(res.body.source, 'config');
    const gov = (res.body.drift?.verticals ?? []).find((v: { key: string }) => v.key === 'governance');
    assert.deepEqual(gov?.missing, ['Shadow Genome']);
    assert.ok(fs.readFileSync(cfg).equals(before), 'GET never rewrites the operator file');
  });
});
