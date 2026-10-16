// #480 (plan-v608 lane B, T1-T9, T10 host rows, T12), VS Code extension host:
// the real Jira/Linear import runners against recorded HTTP fixtures, the real
// VS Code document API for the preview, and a real IntentService in a fresh
// temporary workspace. Only the modal answer, the purpose box and the plan
// picker are scripted. No live provider was contacted: the fixtures were built
// from the providers' documented response shapes.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { IntentService } from '../../../governance/IntentService';
import { SessionManager } from '../../../governance/SessionManager';
import { IntentHistoryLog } from '../../../governance/IntentHistoryLog';
import { IntegrationCredentials } from '../../../integrations/credentials/IntegrationCredentials';
import type { EndpointReader, EndpointScope } from '../../../integrations/credentials/credentialGates';
import type { ImportUi } from '../../../integrations/credentials/importUi';
import {
  HEALTH_STATE_KEY, IntegrationHealthStore, setIntegrationHealthStore,
} from '../../../integrations/catalog/integration-health';
import {
  reviewAndImport, type ImportReviewUi, type TrackerIssue,
} from '../../../integrations/tracker-import/tracker-intent-import';
import { runJiraImport } from '../../../extension/jira-command';
import { runLinearImport } from '../../../extension/linear-command';
import { vscodeReviewUi } from '../../../extension/trackerReviewUi';
import { FakeInspector, FakeSecretStore, RecordingLogger } from '../credentials/fakes';
import { jiraReplay, linearReplay } from './replay';

const JIRA_TOKEN = 'jira_tok_SECRET_9876';
const LINEAR_KEY = 'lin_api_SECRET_5555';
const EMAIL = 'me@acme.test';
const BASIC = Buffer.from(`${EMAIL}:${JIRA_TOKEN}`).toString('base64');

class RecordingImportUi implements ImportUi {
  readonly warnings: string[] = [];
  readonly errors: string[] = [];
  readonly infos: string[] = [];
  warn(m: string): PromiseLike<string | undefined> { this.warnings.push(m); return Promise.resolve(undefined); }
  moveToSecureStorage(): void { /* not used */ }
  error(m: string): void { this.errors.push(m); }
  info(m: string): void { this.infos.push(m); }
  progress<T>(_t: string, task: () => Promise<T>): PromiseLike<T> { return task(); }
}

/** Real preview document; scripted modal, purpose and plan answers. */
class ScriptedReviewUi implements ImportReviewUi {
  readonly previews: string[] = [];
  readonly messages: string[] = [];
  readonly prefills: string[] = [];
  confirms = 0;
  constructor(private readonly a: { approve?: boolean; purpose?: (prefill: string) => string | undefined; plan?: string }) {}
  async showPreview(markdown: string): Promise<void> {
    this.previews.push(markdown);
    await vscodeReviewUi().showPreview(markdown);
  }
  async confirmCreate(message: string, detail: string): Promise<boolean> {
    this.confirms++; this.messages.push(message, detail); return this.a.approve === true;
  }
  async editPurpose(initial: string): Promise<string | undefined> {
    this.prefills.push(initial); return this.a.purpose ? this.a.purpose(initial) : initial;
  }
  async pickPlanId(): Promise<string | undefined> { return this.a.plan; }
  info(m: string): void { this.messages.push(m); }
  warn(m: string): void { this.messages.push(m); }
  error(m: string): void { this.messages.push(m); }
}

class FakeEndpoints implements EndpointReader {
  endpoint(settingKey: string): { value?: string; scope: EndpointScope } {
    return settingKey === 'failsafe.integrations.jira.baseUrl'
      ? { value: 'https://acme.atlassian.net', scope: 'user' }
      : { scope: 'default' };
  }
}

function memento() {
  const data = new Map<string, unknown>();
  return { data, get: <T>(k: string) => data.get(k) as T | undefined, update: (k: string, v: unknown) => { data.set(k, v); return Promise.resolve(); } };
}

function service(root: string): IntentService {
  const s = new IntentService(root, new SessionManager(root));
  s.setGovernanceModeGetter(() => 'enforce');
  return s;
}

function untitledMarkdown(): vscode.TextDocument[] {
  return vscode.workspace.textDocuments.filter((d) => d.isUntitled && d.languageId === 'markdown');
}

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filesUnder(p) : [p];
  });
}

async function created(root: string): Promise<number> {
  const history = new IntentHistoryLog(path.join(root, '.failsafe', 'manifest'));
  return (await history.loadAllEntries()).filter((e) => e.event === 'CREATED').length;
}

suite('tracker governed intent drafts in the extension host (#480)', function () {
  this.timeout(30000);
  let root: string;
  let health: ReturnType<typeof memento>;
  const seen: string[] = [];

  setup(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-trk-')));
    health = memento();
    setIntegrationHealthStore(new IntegrationHealthStore(health));
  });

  teardown(async () => {
    setIntegrationHealthStore(null);
    seen.push(...untitledMarkdown().map((d) => d.getText()));
    // Untitled previews are dirty; revert-and-close avoids a save prompt.
    for (const doc of untitledMarkdown()) {
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    }
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  });

  async function jira(fixtures: string[], ui: ScriptedReviewUi, o: { key?: string; enabled?: boolean; token?: boolean; svc?: IntentService } = {}) {
    const creds = new IntegrationCredentials(new FakeSecretStore(), new FakeInspector(), new RecordingLogger());
    await creds.init();
    if (o.token !== false) await creds.set('jira.apiToken', 'user', JIRA_TOKEN);
    const replay = jiraReplay(fixtures);
    const importUi = new RecordingImportUi();
    const svc = o.svc ?? service(root);
    const result = await runJiraImport(async () => o.key ?? 'PROJ-123', {
      creds, endpoints: new FakeEndpoints(), enabled: o.enabled !== false, email: EMAIL, get: replay.fn, ui: importUi,
      review: (issue: TrackerIssue) => reviewAndImport(issue, { intents: svc, ui, governanceMode: () => 'enforce' }),
      earlierImport: async (ref) => {
        const l = await svc.findCreatedByExternalRef(ref);
        return l.integrity === 'valid' && l.entries.length ? `It was imported as intent ${l.entries[0].intentId}; that intent is unchanged.` : undefined;
      },
    });
    assert.equal(replay.remaining(), 0, 'every recorded fixture was requested');
    return { result, replay, importUi };
  }

  const healthOf = (id: string) => (health.data.get(HEALTH_STATE_KEY) as Record<string, { result: string; category?: string }> | undefined)?.[id];

  test('T1 a fetched issue opens as an unsaved preview; declining saves nothing', async () => {
    const ui = new ScriptedReviewUi({ approve: false });
    const { result } = await jira(['jira-PROJ-123'], ui);
    assert.deepEqual(result, { outcome: 'previewed' });
    const docs = untitledMarkdown().filter((d) => d.getText().includes('PROJ-123'));
    assert.equal(docs.length, 1, 'one untitled preview document');
    assert.match(docs[0].getText(), /Preview — FailSafe saved nothing/);
    assert.match(docs[0].getText(), /Login fails after password reset/);
    assert.match(docs[0].getText(), /The session cookie is missing/);
    assert.equal(ui.confirms, 1);
    assert.equal(await service(root).getActiveIntent(), null, 'no intent after a restart');
    assert.equal(await created(root), 0);
    assert.equal(healthOf('jira')?.result, 'contract-verified');
  });

  test('T2 approval creates a PULSE draft with provenance that survives a restart', async () => {
    const ui = new ScriptedReviewUi({ approve: true, purpose: () => 'Fix login after password reset', plan: 'plan-1' });
    const { result } = await jira(['jira-PROJ-123'], ui);
    assert.equal(result?.outcome, 'draft_created');
    const restarted = service(root);
    const intent = await restarted.getActiveIntent();
    assert.ok(intent, 'the draft is read back by a new IntentService');
    assert.equal(intent!.id, result!.intentId);
    assert.equal(intent!.status, 'PULSE');
    assert.equal(intent!.type, 'bugfix');
    assert.equal(intent!.planId, 'plan-1');
    assert.equal(intent!.purpose, 'Fix login after password reset');
    assert.equal(intent!.metadata.externalRef, 'jira:PROJ-123');
    assert.deepEqual(intent!.metadata.tags, ['source:jira', 'label:auth', 'label:p1']);
    const lookup = await restarted.findCreatedByExternalRef('jira:PROJ-123');
    assert.equal(lookup.integrity, 'valid');
    const p = (lookup as { entries: Array<{ provenance: Record<string, unknown> }> }).entries[0].provenance;
    assert.equal(p.source, 'jira');
    assert.equal(p.url, 'https://acme.atlassian.net/browse/PROJ-123');
    assert.equal(p.sourceUpdatedAt, '2026-10-14T09:30:12.000+0000');
    assert.match(String(p.fetchedAt), /^\d{4}-\d{2}-\d{2}T/);
    assert.match(String(p.contentSha256), /^[0-9a-f]{64}$/);
    assert.deepEqual(p.mappedFields, ['purpose', 'type', 'tags', 'externalRef']);
    const chain = await new IntentHistoryLog(path.join(root, '.failsafe', 'manifest')).verifyChainIntegrity();
    assert.equal(chain.valid, true);
  });

  test('T3 a repeat import is already_imported when unchanged and stale when the issue changed; no second draft', async () => {
    const svc = service(root);
    await jira(['jira-PROJ-123'], new ScriptedReviewUi({ approve: true, plan: 'plan-1' }), { svc });
    const again = await jira(['jira-PROJ-123'], new ScriptedReviewUi({ approve: true, plan: 'plan-1' }), { svc });
    assert.equal(again.result?.outcome, 'already_imported');
    const ui = new ScriptedReviewUi({ approve: true, plan: 'plan-1' });
    const changed = await jira(['jira-PROJ-123-changed'], ui, { svc });
    assert.equal(changed.result?.outcome, 'stale');
    assert.ok(ui.messages.some((m) => /PROJ-123 changed in Jira since it was imported/.test(m)));
    assert.equal(ui.confirms, 0, 'no approval is even asked for');
    assert.equal(await created(root), 1);
  });

  test('T4 another active intent blocks the import and nothing is written', async () => {
    const svc = service(root);
    await svc.createIntent({ type: 'feature', purpose: 'Other work', scope: { files: [], modules: [], riskGrade: 'L1' }, planId: 'p', metadata: { author: 'user', tags: [] } });
    const ui = new ScriptedReviewUi({ approve: true, plan: 'plan-1' });
    const { result } = await jira(['jira-PROJ-123'], ui, { svc });
    assert.deepEqual(result, { outcome: 'blocked' });
    assert.equal(await created(root), 1, 'only the other intent');
    assert.equal((await service(root).getActiveIntent())?.purpose, 'Other work');
  });

  test('T5 429, 401 and an invalid body show the error, open no preview and record health; a 404 names the earlier import', async () => {
    const before = untitledMarkdown().length;
    const r429 = await jira(['jira-PROJ-123-429'], new ScriptedReviewUi({}));
    assert.match(r429.importUi.errors[0], /rate limit/);
    assert.equal(healthOf('jira')?.category, 'rate_limited');
    const r401 = await jira(['jira-PROJ-123-401'], new ScriptedReviewUi({}));
    assert.deepEqual(r401.result, { outcome: 'not_authorized' });
    assert.equal(healthOf('jira')?.category, 'auth');
    const bad = await jira(['jira-PROJ-123-invalid'], new ScriptedReviewUi({}));
    assert.match(bad.importUi.errors[0], /Invalid JSON from Jira/);
    assert.equal(healthOf('jira')?.category, 'contract');
    assert.equal(untitledMarkdown().length, before, 'no preview document');
    assert.equal(await created(root), 0);

    const svc = service(root);
    const first = await jira(['jira-PROJ-123'], new ScriptedReviewUi({ approve: true, plan: 'plan-1' }), { svc });
    const gone = await jira(['jira-PROJ-123-404'], new ScriptedReviewUi({}), { svc });
    assert.match(gone.importUi.errors[0], new RegExp(`imported as intent ${first.result!.intentId}; that intent is unchanged`));
    assert.equal((await service(root).getActiveIntent())?.id, first.result!.intentId);
  });

  test('T6 no description and unknown custom fields: "(no description)" and no custom-field text', async () => {
    const ui = new ScriptedReviewUi({ approve: false });
    await jira(['jira-PROJ-7-sparse'], ui, { key: 'PROJ-7' });
    assert.match(ui.previews[0], /\(no description\)/);
    assert.ok(!ui.previews[0].includes('CUSTOM-FIELD-SENTINEL'));
  });

  test('T7 disabled, and no credential: not_authorized and zero transport calls', async () => {
    const off = await jira([], new ScriptedReviewUi({}), { enabled: false });
    assert.deepEqual(off.result, { outcome: 'not_authorized' });
    assert.equal(off.replay.requests.length, 0);
    const none = await jira([], new ScriptedReviewUi({}), { token: false });
    assert.deepEqual(none.result, { outcome: 'not_authorized' });
    assert.equal(none.replay.requests.length, 0);
  });

  test('T9 Linear: approve flow with restart read-back; 401 is not_authorized; a 200 with errors is contract with no preview', async () => {
    const run = async (fixtures: Array<{ fixture: string; id: string }>, ui: ScriptedReviewUi) => {
      const creds = new IntegrationCredentials(new FakeSecretStore(), new FakeInspector(), new RecordingLogger());
      await creds.init();
      await creds.set('linear.apiKey', 'user', LINEAR_KEY);
      const replay = linearReplay(fixtures);
      const importUi = new RecordingImportUi();
      const svc = service(root);
      const result = await runLinearImport(async () => fixtures[0].id, {
        creds, enabled: true, post: replay.fn, ui: importUi,
        review: (issue) => reviewAndImport(issue, { intents: svc, ui, governanceMode: () => 'enforce' }),
      });
      assert.equal(replay.remaining(), 0);
      assert.ok(replay.requests.every((r) => r.authorization === LINEAR_KEY), 'the key rides only the Authorization header');
      return { result, importUi };
    };
    const ok = await run([{ fixture: 'linear-ENG-42', id: 'ENG-42' }], new ScriptedReviewUi({ approve: true, plan: 'plan-1' }));
    assert.equal(ok.result?.outcome, 'draft_created');
    const intent = await service(root).getActiveIntent();
    assert.equal(intent?.metadata.externalRef, 'linear:ENG-42');
    assert.equal(intent?.type, 'bugfix');
    assert.deepEqual(intent?.metadata.tags, ['source:linear', 'label:Bug', 'label:editor']);
    const denied = await run([{ fixture: 'linear-ENG-42-401', id: 'ENG-42' }], new ScriptedReviewUi({}));
    assert.deepEqual(denied.result, { outcome: 'not_authorized' });
    const before = untitledMarkdown().length;
    const errs = await run([{ fixture: 'linear-ENG-404-errors', id: 'ENG-404' }], new ScriptedReviewUi({}));
    assert.equal(errs.result, undefined);
    assert.equal(healthOf('linear')?.category, 'contract');
    assert.equal(untitledMarkdown().length, before);
  });

  test('T10 host: a broken history chain, and a torn history line, block an approved import', async () => {
    const svc = service(root);
    await svc.createIntent({ type: 'feature', purpose: 'Seed', scope: { files: [], modules: [], riskGrade: 'L1' }, planId: 'p', metadata: { author: 'user', tags: [] } });
    // Seal-free reset: drop the active intent so only the history matters.
    fs.rmSync(path.join(root, '.failsafe', 'manifest', 'active_intent.json'), { force: true });
    const historyPath = path.join(root, '.failsafe', 'manifest', 'intent_history.jsonl');
    const lines = fs.readFileSync(historyPath, 'utf8').trim().split('\n');
    const edited = JSON.parse(lines[0]);
    edited.actor = 'someone-else';
    fs.writeFileSync(historyPath, JSON.stringify(edited) + '\n');
    const ui = new ScriptedReviewUi({ approve: true, plan: 'plan-1' });
    const broken = await jira(['jira-PROJ-123'], ui, { svc: service(root) });
    assert.deepEqual(broken.result, { outcome: 'blocked' });
    assert.ok(ui.messages.some((m) => /failed its integrity check/.test(m)));
    assert.equal(await service(root).getActiveIntent(), null);

    fs.writeFileSync(historyPath, lines[0] + '\n{"intentId":"half');
    const torn = await jira(['jira-PROJ-123'], new ScriptedReviewUi({ approve: true, plan: 'plan-1' }), { svc: service(root) });
    assert.deepEqual(torn.result, { outcome: 'blocked' });
    assert.equal(await service(root).getActiveIntent(), null);
  });

  test('T12 a 260-character title is prefilled at 200 characters and the draft is readable', async () => {
    const ui = new ScriptedReviewUi({ approve: true, plan: 'plan-1' });
    const { result } = await jira(['jira-PROJ-260-long'], ui, { key: 'PROJ-260' });
    assert.equal(ui.prefills[0].length, 200);
    assert.equal(result?.outcome, 'draft_created');
    assert.equal((await service(root).getActiveIntent())?.purpose.length, 200);
    const tooLong = new ScriptedReviewUi({ approve: true, purpose: () => 'x'.repeat(201), plan: 'plan-1' });
    fs.rmSync(path.join(root, '.failsafe', 'manifest', 'active_intent.json'), { force: true });
    const refused = await jira(['jira-PROJ-260-long'], tooLong, { key: 'PROJ-260' });
    assert.equal(refused.result?.outcome, 'previewed');
  });

  // Runs last: everything the suite wrote and showed is checked for secrets.
  test('T8 no token, Basic value or API key appears in any file, preview, message or health record', async () => {
    const ui = new ScriptedReviewUi({ approve: true, plan: 'plan-1' });
    const r = await jira(['jira-PROJ-123'], ui);
    assert.ok(r.replay.requests.every((q) => q.authorization === `Basic ${BASIC}`), 'the token rides only the Authorization header');
    const failing = await jira(['jira-PROJ-123-401'], new ScriptedReviewUi({}));
    const haystacks = [
      ...filesUnder(path.join(root, '.failsafe')).map((f) => fs.readFileSync(f, 'utf8')),
      ...seen, ...untitledMarkdown().map((d) => d.getText()), ...ui.previews, ...ui.messages,
      ...r.importUi.errors, ...r.importUi.infos, ...failing.importUi.errors,
      JSON.stringify(health.data.get(HEALTH_STATE_KEY)),
    ];
    assert.ok(haystacks.length > 5);
    for (const secret of [JIRA_TOKEN, BASIC, LINEAR_KEY]) {
      assert.ok(!haystacks.some((h) => h.includes(secret)), `${secret.slice(0, 8)}… must not be stored or shown`);
    }
  });
});
