// Functional tests for the failsafe.create_risk MCP tool handler (FX416).
// Tests the pure handler (no MCP transport), against a real RiskManager.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleCreateRisk, CreateRiskInput } from '../../mcp/tools/createRiskTool';
import { RiskManager } from '../../qorelogic/risk/RiskManager';

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'crt-'));
}

function validInput(overrides: Partial<CreateRiskInput> = {}): CreateRiskInput {
  return {
    title: 'XSS in upload route',
    description: 'User input is not sanitized before render',
    severity: 'high',
    category: 'security',
    impact: 'Stored XSS on victim browser',
    mitigation: 'Sanitize via DOMPurify; reject HTML on server',
    sourceAgent: 'claude-code',
    ...overrides,
  };
}

suite('createRiskTool (FX416 — MCP tool handler)', () => {
  let dir: string;
  setup(() => { dir = makeWorkspace(); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX416 valid payload creates a risk with source=mcp', () => {
    const mgr = new RiskManager(dir, 'test-project');
    const result = handleCreateRisk(validInput(), mgr);
    assert.equal(result.ok, true);
    assert.ok(result.id, 'expected a risk id in the result');
    assert.equal(result.source, 'mcp');
    assert.equal(result.sourceAgent, 'claude-code');
    assert.equal(mgr.getAllRisks().length, 1);
    assert.equal(mgr.getAllRisks()[0].source, 'mcp');
  });

  test('FX416 invalid severity rejected with field-specific error', () => {
    const mgr = new RiskManager(dir, 'test-project');
    const result = handleCreateRisk(
      validInput({ severity: 'urgent' as any }),
      mgr,
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid-enum-value');
    assert.equal(result.field, 'severity');
    assert.equal(mgr.getAllRisks().length, 0, 'no risk should be persisted');
  });

  test('FX416 invalid category rejected', () => {
    const mgr = new RiskManager(dir, 'test-project');
    const result = handleCreateRisk(
      validInput({ category: 'made-up' as any }),
      mgr,
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid-enum-value');
    assert.equal(result.field, 'category');
    assert.equal(mgr.getAllRisks().length, 0);
  });

  test('FX416 missing sourceAgent rejected', () => {
    const mgr = new RiskManager(dir, 'test-project');
    const result = handleCreateRisk(
      validInput({ sourceAgent: '' }),
      mgr,
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, 'missing-source-agent');
    assert.equal(mgr.getAllRisks().length, 0);
  });

  test('FX416 source is forced to mcp even when input attempts to override', () => {
    const mgr = new RiskManager(dir, 'test-project');
    // Caller tries to label as 'manual'; the tool must overwrite to 'mcp'.
    const sneaky = { ...validInput(), source: 'manual' } as any;
    const result = handleCreateRisk(sneaky, mgr);
    assert.equal(result.ok, true);
    assert.equal(mgr.getAllRisks()[0].source, 'mcp');
  });
});
