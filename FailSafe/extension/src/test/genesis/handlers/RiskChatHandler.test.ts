// Functional tests for RiskChatHandler (FX419 — plan Phase 4).
// Tests the pure draft/confirm functions; participant routing is covered
// by FailSafeChatParticipant.test.ts.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { draftRisk, confirmRisk } from '../../../genesis/chat/handlers/RiskChatHandler';
import { RiskManager } from '../../../qorelogic/risk/RiskManager';

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rch-'));
}

suite('RiskChatHandler (FX419 — chat /risk handler)', () => {
  let dir: string;
  setup(() => { dir = makeWorkspace(); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX419 draftRisk produces a structured draft from prompt text', () => {
    const draft = draftRisk('XSS vulnerability in the upload route — user input not sanitized');
    assert.ok(draft.title.length > 0);
    assert.equal(draft.category, 'security');
    // No createRisk side-effect — only drafting.
    const mgr = new RiskManager(dir, 'test-project');
    assert.equal(mgr.getAllRisks().length, 0);
  });

  test('FX419 draftRisk infers severity from keywords', () => {
    assert.equal(draftRisk('critical production down — auth bypass').severity, 'critical');
    assert.equal(draftRisk('high priority — major impact').severity, 'high');
    assert.equal(draftRisk('minor cosmetic issue').severity, 'low');
    assert.equal(draftRisk('something happens').severity, 'medium');
  });

  test('FX419 draftRisk infers category from keywords', () => {
    assert.equal(draftRisk('SQL injection attack vector').category, 'security');
    assert.equal(draftRisk('slow query causing latency').category, 'performance');
    assert.equal(draftRisk('dependency package version mismatch').category, 'dependency');
    assert.equal(draftRisk('GDPR compliance gap on data export').category, 'compliance');
    assert.equal(draftRisk('refactor needed').category, 'technical-debt');
  });

  test('FX419 draftRisk truncates very long prompts into a title', () => {
    const long = 'x'.repeat(200);
    const draft = draftRisk(long);
    assert.ok(draft.title.length <= 80);
    assert.equal(draft.description, long); // full description preserved
  });

  test('FX419 confirmRisk calls RiskManager.createRisk with source=mcp', () => {
    const mgr = new RiskManager(dir, 'test-project');
    const draft = draftRisk('XSS in upload route');
    const risk = confirmRisk(draft, 'claude-code-chat', mgr);
    assert.equal(risk.source, 'mcp');
    assert.equal(risk.sourceAgent, 'claude-code-chat');
    assert.equal(mgr.getAllRisks().length, 1);
  });

  test('FX419 confirmRisk preserves drafted severity/category', () => {
    const mgr = new RiskManager(dir, 'test-project');
    const draft = draftRisk('critical SQL injection');
    const risk = confirmRisk(draft, 'claude-code-chat', mgr);
    assert.equal(risk.severity, 'critical');
    assert.equal(risk.category, 'security');
  });
});
