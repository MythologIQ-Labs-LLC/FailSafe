// #474 (plan-v608 lane B, C1, C2, C4): every catalog adapter passes the
// contract of each capability it claims, plus status evidence; a false claim
// fails. Runs in the VS Code extension host against recorded fixtures.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { INTEGRATION_CATALOG } from '../../../integrations/catalog/integration-catalog';
import { checkConformance, type Harness, type Harnesses } from './contracts';
import { cleanupHarnesses, HARNESSES } from './harnesses';

const okStatus: Harness = { 'status-evidence': async () => ({ success: ['connected'], failure: ['failing', 'http'] }) };

suite('integration capability conformance (#474)', function () {
  this.timeout(180000);
  suiteTeardown(() => cleanupHarnesses());

  test('C1 every catalog adapter passes every claimed contract; 25 pairs are checked', async () => {
    const { violations, checked } = await checkConformance(INTEGRATION_CATALOG, HARNESSES);
    assert.deepEqual(violations, []);
    const claimed = INTEGRATION_CATALOG.reduce((n, d) => n + d.capabilities.length + 1, 0);
    assert.equal(claimed, 25, '14 capability pairs plus 11 status-evidence pairs');
    assert.equal(checked, 25);
  });

  test('C2 a claim the adapter does not honour, a claim with no harness, a non-idempotent ingest and an unclaimed harness each fail', async () => {
    const synthetic: Harnesses = {
      'writes-unasked': { ...okStatus, 'intent-draft': async () => ({ afterDecline: 1, afterApprove: 2, externalRef: 'x:1', restartedRef: 'x:1', expectedRef: 'x:1', afterRepeat: 2 }) },
      'no-harness': { ...okStatus },
      'not-idempotent': {
        ...okStatus,
        'risk-ingest': async () => ({ records: [{ id: 'a', title: 't', severity: 'high', source: 's' }], secondIds: ['b'], throwingSinkThrew: false, throwingSinkFailed: 1 }),
      },
      'claims-nothing': { ...okStatus, notify: async () => ({ okResult: { ok: true }, failResult: { ok: false }, threw: false }) },
    };
    const catalog = [
      { id: 'writes-unasked', capabilities: ['intent-draft'] as const },
      { id: 'no-harness', capabilities: ['notify'] as const },
      { id: 'not-idempotent', capabilities: ['risk-ingest'] as const },
      { id: 'claims-nothing', capabilities: [] as const },
    ];
    const { violations } = await checkConformance(catalog, synthetic);
    const by = (id: string) => violations.filter((v) => v.adapter === id).map((v) => `${v.kind}:${v.capability}:${v.detail}`);
    assert.deepEqual(by('writes-unasked'), [
      'contract:intent-draft:an intent was created without approval',
      'contract:intent-draft:approval created 2 intents, not 1',
      'contract:intent-draft:a repeat import left 2 intents',
    ]);
    assert.deepEqual(by('no-harness'), ['missing-harness:notify:no-harness claims notify but has no harness']);
    assert.deepEqual(by('not-idempotent'), ['contract:risk-ingest:a re-run produced different ids (not idempotent)']);
    assert.deepEqual(by('claims-nothing'), ['unclaimed-harness:notify:a harness exists for notify, which claims-nothing does not claim']);
  });
});

// ---- C4: wiring of the recorder in other lanes' handlers -------------------------

// out/test/integrations/conformance -> extension root
const SRC = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'extension');

function source(file: string): string {
  return fs.readFileSync(path.join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** The call must follow the anchor and precede the first `return` after the anchor. */
function placedBeforeFirstReturn(text: string, anchor: string, call: string): string | undefined {
  const a = text.indexOf(anchor);
  if (a < 0) return `anchor not found: ${anchor}`;
  const c = text.indexOf(call, a);
  if (c < 0) return `recorder call not found after the anchor: ${call}`;
  const ret = /\breturn\b/g;
  ret.lastIndex = a + anchor.length;
  const r = ret.exec(text);
  return r && r.index < c ? `the recorder call comes after the first return following ${anchor}` : undefined;
}

suite('integration status-evidence wiring in other lanes\' handlers (#474 C4, source)', () => {
  const rows: Array<[string, string, string]> = [
    ['sentry-command.ts', 'const outcome = await vscode.window.withProgress(', "recordIntegrationHealth('sentry', ...healthFromSentryImport(outcome));"],
    ['sarif-command.ts', 'const result = importSarifText(', "recordIntegrationHealth('sarif', ...healthFromSarifImport(result));"],
    ['sarif-command.ts', 'text = fs.readFileSync(file', "recordIntegrationHealth('sarif', ...healthFromSarifImport({ unreadable: true }));"],
    ['github-checks-command.ts', 'const result = await vscode.window.withProgress(', "recordIntegrationHealth('github-checks', ...healthFromGitHubPublish(result));"],
    ['agent-observe-command.ts', 'const r = runMcpPolicyScan(', "recordIntegrationHealth('agent-audit', ...healthFromMcpScan(r));"],
  ];
  for (const [file, anchor, call] of rows) {
    test(`${file} [after ${anchor.trim().slice(0, 40)}]: the recorder call sits before the first return`, () => {
      assert.equal(placedBeforeFirstReturn(source(file), anchor, call), undefined);
    });
  }

  test('agent-cli-command.ts: the recorder call is the first statement of handleOutcome', () => {
    const text = source('agent-cli-command.ts');
    const sig = 'export async function handleOutcome(';
    const a = text.indexOf(sig);
    assert.ok(a >= 0, 'handleOutcome exists');
    const brace = text.indexOf('{', text.indexOf('Promise<void>', a));
    const first = text.slice(brace + 1).trimStart();
    assert.ok(first.startsWith('recordIntegrationHealth(agent, ...healthFromAgentRun(out));'), first.slice(0, 80));
  });

  test('the check fails when a call sits below an early return (self-test)', () => {
    const fake = 'const result = importSarifText(x);\n if (a) { return; }\n recordIntegrationHealth(\'sarif\', ...healthFromSarifImport(result));';
    assert.match(placedBeforeFirstReturn(fake, 'const result = importSarifText(', "recordIntegrationHealth('sarif', ...healthFromSarifImport(result));") ?? '', /after the first return/);
  });
});
