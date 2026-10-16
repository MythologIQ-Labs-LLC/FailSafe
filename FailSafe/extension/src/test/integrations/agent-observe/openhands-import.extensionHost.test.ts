// #477 (plan-v608 lane B, O1, O3, O5, O6, O11, O13), VS Code extension host:
// the OpenHands import command logic end to end (scripted file picker and
// confirmation), the real AgentTimelineService fed by the evidence reader,
// and the real Agent Timeline webview panel.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EventBus } from '../../../shared/EventBus';
import { AgentTimelineService, type TimelineEntry } from '../../../sentinel/AgentTimelineService';
import { AgentTimelinePanel } from '../../../genesis/panels/AgentTimelinePanel';
import { EVIDENCE_KEY_ID, EvidenceKeyHolder, type SecretsLike } from '../../../integrations/agent-observe/openhands-signing';
import { OpenHandsEvidenceReader } from '../../../integrations/agent-observe/openhands-evidence';
import { evidencePath } from '../../../integrations/agent-observe/openhands-import';
import { HEALTH_STATE_KEY, IntegrationHealthStore, setIntegrationHealthStore } from '../../../integrations/catalog/integration-health';
import { MAX_EXPORT_BYTES, runOpenHandsImport, type OpenHandsImportUi } from '../../../extension/openhands-import-command';

class Secrets {
  stored: string | undefined;
  private readonly ls = new Set<(e: { key: string }) => void>();
  context(): SecretsLike {
    return {
      get: async () => this.stored,
      store: async (_k, v) => { this.stored = v; this.ls.forEach((l) => l({ key: EVIDENCE_KEY_ID })); },
      onDidChange: (l) => { this.ls.add(l); return { dispose: () => this.ls.delete(l) }; },
    };
  }
}

class ScriptedUi implements OpenHandsImportUi {
  readonly infos: string[] = []; readonly warns: string[] = []; readonly errors: string[] = [];
  confirms = 0;
  constructor(private readonly file: string | undefined, private readonly approve = true) {}
  async pickFile() { return this.file; }
  async confirm() { this.confirms++; return this.approve; }
  info(m: string) { this.infos.push(m); }
  warn(m: string) { this.warns.push(m); }
  error(m: string) { this.errors.push(m); }
}

const SDK = (id: string, tool = 'execute_bash') => ({ id, timestamp: '2026-10-10T10:00:00Z', source: 'agent', action: { kind: 'ExecuteBashAction' }, tool_name: tool });

suite('OpenHands import command and timelines in the extension host (#477)', function () {
  this.timeout(30000);
  const roots: string[] = [];
  let health: Map<string, unknown>;
  const ws = () => { const r = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-ohx-'))); roots.push(r); return r; };
  const exportFile = (root: string, body: unknown) => { const f = path.join(root, `run-${roots.length}-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify(body)); return f; };
  const healthOf = () => (health.get(HEALTH_STATE_KEY) as Record<string, { result: string; category?: string }> | undefined)?.openhands;

  setup(() => {
    health = new Map();
    setIntegrationHealthStore(new IntegrationHealthStore({ get: <T>(k: string) => health.get(k) as T, update: (k, v) => { health.set(k, v); return Promise.resolve(); } }));
  });
  teardown(() => setIntegrationHealthStore(null));
  suiteTeardown(() => { AgentTimelinePanel.currentPanel?.['panel'].dispose(); for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 3 }); });

  async function run(root: string, file: string | undefined, o: { approve?: boolean; keys?: EvidenceKeyHolder; settingVersion?: string } = {}) {
    const ui = new ScriptedUi(file, o.approve ?? true);
    const keys = o.keys ?? new EvidenceKeyHolder(new Secrets().context());
    const outcome = await runOpenHandsImport({ workspaceRoot: root, enabled: true, settingVersion: o.settingVersion, ui, keys });
    return { ui, outcome, keys };
  }

  test('O1 two SDK events, approved: two signed records, one transparency summary, two imported timeline entries', async () => {
    const root = ws();
    const file = exportFile(root, { version: '1.0.0', events: [SDK('e1'), SDK('e2', 'str_replace_editor')] });
    const { ui, outcome, keys } = await run(root, file);
    assert.equal(outcome?.kind, 'imported');
    assert.equal(ui.confirms, 1);
    assert.match(ui.infos[0], /saved 2 event\(s\), skipped 0 duplicate\(s\)\. Not live interception\./);
    assert.equal(fs.readFileSync(evidencePath(root), 'utf8').trim().split('\n').length, 2);
    const transparency = fs.readFileSync(path.join(root, '.failsafe', 'logs', 'transparency.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(transparency.length, 1);
    assert.match(transparency[0].summary, /OpenHands historical import: 2 event\(s\) from run-.*\.json \(sha256 [0-9a-f]{12}\), not live enforcement/);
    const service = new AgentTimelineService(new EventBus());
    const reader = new OpenHandsEvidenceReader(keys, () => [{ fsPath: root, name: 'proj' }]);
    service.setImportedEntriesProvider(() => reader.read().entries);
    const entries = service.getEntries();
    assert.equal(entries.length, 2);
    assert.ok(entries.every((e) => e.category === 'imported' && /historical import/.test(e.title) && /not live enforcement/.test(e.detail)));
    assert.ok(entries.every((e) => new RegExp(transparency[0].sourceSha256.slice(0, 12)).test(e.detail)));
    assert.deepEqual(service.getEntries({ categories: ['verdict'] }), []);
    assert.equal(healthOf()?.result, 'contract-verified');
    service.dispose();
  });

  test('O3 invalid JSON and an unsupported major write nothing and record contract and unsupported_version', async () => {
    const root = ws();
    const bad = path.join(root, 'bad.json');
    fs.writeFileSync(bad, '{ not json');
    assert.equal((await run(root, bad)).outcome?.kind, 'unreadable');
    assert.equal(healthOf()?.category, 'contract');
    const v2 = exportFile(root, { version: '2.0.0', events: [SDK('x')] });
    const r = await run(root, v2);
    assert.equal(r.outcome?.kind, 'unsupported-version');
    assert.equal(r.ui.confirms, 0);
    assert.equal(healthOf()?.category, 'unsupported_version');
    assert.equal(fs.existsSync(evidencePath(root)), false);
  });

  test('a version only from the setting imports as connected, not contract-verified', async () => {
    const root = ws();
    const file = exportFile(root, [SDK('s1')]);
    const r = await run(root, file, { settingVersion: '1.2.0' });
    assert.equal(r.outcome?.kind, 'imported');
    assert.equal(healthOf()?.result, 'connected');
  });

  test('O5 workspace switch: one provider over two folders labels each entry with its folder', async () => {
    const r1 = ws(); const r2 = ws();
    const secrets = new Secrets();
    const keys = new EvidenceKeyHolder(secrets.context());
    await run(r1, exportFile(r1, { version: '1.0.0', events: [SDK('one')] }), { keys });
    await run(r2, exportFile(r2, { version: '1.0.0', events: [SDK('two')] }), { keys });
    const reader = new OpenHandsEvidenceReader(keys, () => [{ fsPath: r1, name: 'first' }, { fsPath: r2, name: 'second' }]);
    const entries = reader.read().entries;
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((e) => / in (\w+);/.exec(e.detail)?.[1]).sort(), ['first', 'second']);
  });

  test('O6 more than 10,000 events, and a file over 20 MB (refused without reading), write nothing', async () => {
    const root = ws();
    const many = exportFile(root, { version: '1.0.0', events: Array.from({ length: 10_001 }, (_, i) => SDK(`m${i}`)) });
    const r = await run(root, many);
    assert.equal(r.outcome?.kind, 'refused');
    assert.match(r.ui.warns[0], /10001 events; the limit is 10000/);
    let reads = 0;
    const big = await runOpenHandsImport({
      workspaceRoot: root, enabled: true, ui: new ScriptedUi(path.join(root, 'huge.json')), keys: r.keys,
      fsx: { statSync: () => ({ size: MAX_EXPORT_BYTES + 1 }), readFileSync: () => { reads++; return Buffer.from('[]'); } },
    });
    assert.equal(big?.kind, 'refused');
    assert.equal(reads, 0, 'the file was never read');
    assert.equal(fs.existsSync(evidencePath(root)), false);
  });

  test('O11 dismissing the confirmation writes nothing and records no health', async () => {
    const root = ws();
    const r = await run(root, exportFile(root, { version: '1.0.0', events: [SDK('d1')] }), { approve: false });
    assert.equal(r.outcome?.kind, 'dismissed');
    assert.equal(fs.existsSync(evidencePath(root)), false);
    assert.equal(healthOf(), undefined);
  });

  test('O13 the Agent Timeline panel escapes an out-of-set severity and offers no Open file for imported entries', async () => {
    const service = new AgentTimelineService(new EventBus());
    const hostile = {
      id: 'imp-1', timestamp: '2026-10-10T10:00:00.000Z', category: 'imported', title: 'OpenHands (historical import): action execute_bash',
      detail: 'd', icon: 'archive', severity: 'x" onclick="alert(1)',
    } as unknown as TimelineEntry;
    service.setImportedEntriesProvider(() => [hostile]);
    const ext = vscode.extensions.all.find((e) => e.id.toLowerCase().endsWith('failsafe'))?.extensionUri ?? vscode.Uri.file(os.tmpdir());
    AgentTimelinePanel.currentPanel?.['panel'].dispose();
    const panel = AgentTimelinePanel.createOrShow(ext, new EventBus(), service);
    const html = (panel as unknown as { panel: vscode.WebviewPanel }).panel.webview.html;
    assert.match(html, /OpenHands \(historical import\): action execute_bash/);
    assert.ok(!html.includes('x" onclick="alert(1)'), 'raw severity rendered');
    assert.ok(html.includes('severity-x&quot; onclick=&quot;alert(1)'));
    assert.ok(!html.includes('class="file-link"'), 'no Open file action for an imported entry');
    (panel as unknown as { panel: vscode.WebviewPanel }).panel.dispose();
    service.dispose();
  });
});
