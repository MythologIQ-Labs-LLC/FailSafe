import { strict as assert } from 'assert';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { runMcpPolicyScan } from '../../../extension/agent-observe-command';
import {
  parseMcpPolicyConfig, flagMcpRisks, auditMcpConfig,
} from '../../../integrations/agent-observe/mcp-policy-audit';
import {
  isOpenHandsVersionSupported, mapOpenHandsEvent, observeOpenHandsRun, planToolPolicyChange,
} from '../../../integrations/agent-observe/openhands-observer';

// ---- #106 Cline/Roo/Kilo MCP policy audit -------------------------------

const SAFE_CONFIG = JSON.stringify({
  mcpServers: { fs: { command: '/usr/local/bin/mcp-fs', args: ['--root', '.'], alwaysAllow: ['read_file'] } },
});
const RISKY_CONFIG = JSON.stringify({
  mcpServers: {
    sh: { command: 'bash', alwaysAllow: ['*'], env: { OPENAI_API_KEY: 'sk-TOPSECRET' } },
    remote: { type: 'sse', url: 'https://hooks.evil.example.com/sse?token=SECRETTOKEN' },
    fsx: { command: 'mcp-fs', autoApprove: ['read_file', 'write_file'] },
  },
});

suite('mcp-policy-audit (#106)', () => {
  test('parse redacts secrets: env VALUES dropped (keys kept), URL → host only, command → basename', () => {
    const p = parseMcpPolicyConfig(JSON.parse(RISKY_CONFIG));
    const sh = p.servers.find((s) => s.name === 'sh')!;
    assert.deepEqual(sh.envKeys, ['OPENAI_API_KEY']);
    assert.equal(sh.command, 'bash');
    const remote = p.servers.find((s) => s.name === 'remote')!;
    assert.equal(remote.transport, 'remote');
    assert.equal(remote.urlHost, 'hooks.evil.example.com'); // no token, no path
    // The secret token + api key must not survive anywhere in the parsed policy.
    const s = JSON.stringify(p);
    assert.ok(!s.includes('sk-TOPSECRET'), 'env value redacted');
    assert.ok(!s.includes('SECRETTOKEN'), 'url token redacted');
  });

  test('parse reads both alwaysAllow and autoApprove field variants', () => {
    const p = parseMcpPolicyConfig(JSON.parse(RISKY_CONFIG));
    assert.deepEqual(p.servers.find((s) => s.name === 'sh')!.autoApprove, ['*']);
    assert.deepEqual(p.servers.find((s) => s.name === 'fsx')!.autoApprove, ['read_file', 'write_file']);
  });

  test('safe config → no high-severity flags', () => {
    const risks = auditMcpConfig('cline', SAFE_CONFIG);
    assert.equal(risks.some((r) => r.severity === 'high'), false);
  });

  test('risky config → wildcard (high) + shell-capable (high) + remote (warn)', () => {
    const risks = auditMcpConfig('cline', RISKY_CONFIG);
    const byFlag = (f: string) => risks.find((r) => (r.provenance.flag as string) === f && (r.provenance.server as string) === 'sh' || (r.provenance.flag as string) === f && (r.provenance.server as string) === 'remote');
    assert.ok(risks.some((r) => r.provenance.flag === 'wildcard-auto-approve' && r.severity === 'high'));
    assert.ok(risks.some((r) => r.provenance.flag === 'shell-capable' && r.severity === 'high'));
    assert.ok(risks.some((r) => r.provenance.flag === 'remote-mcp' && r.severity === 'warn'));
    void byFlag;
    // keyed-idempotent ids
    assert.equal(new Set(risks.map((r) => r.id)).size, risks.length);
  });

  test('missing / empty / invalid config → no risks (works when agent absent)', () => {
    assert.deepEqual(auditMcpConfig('roo', '{}'), []);
    assert.deepEqual(auditMcpConfig('kilo', 'not json'), []);
    assert.deepEqual(flagMcpRisks({ servers: [], globalAutoApprove: [] }, 'cline'), []);
  });

  test('global wildcard auto-approve flagged high', () => {
    const risks = auditMcpConfig('kilo', JSON.stringify({ alwaysAllow: ['*'], mcpServers: {} }));
    assert.ok(risks.some((r) => r.provenance.flag === 'wildcard-auto-approve' && r.provenance.scope === 'global' && r.severity === 'high'));
  });
});

// ---- #105 OpenHands observer --------------------------------------------

suite('openhands-observer (#105)', () => {
  test('version support gate (pre-2.0 supported; garbage/undefined unsupported)', () => {
    assert.equal(isOpenHandsVersionSupported('0.20.1'), true);
    assert.equal(isOpenHandsVersionSupported('1.2.0'), true);
    assert.equal(isOpenHandsVersionSupported('2.0.0'), false);
    assert.equal(isOpenHandsVersionSupported('garbage'), false);
    assert.equal(isOpenHandsVersionSupported(undefined), false);
  });

  test('mapOpenHandsEvent: real SDK shape — OBJECT action/observation + tool_name verb', () => {
    // ActionEvent: object `action` + string `tool_name` (the real schema).
    const run = mapOpenHandsEvent({ id: 'e1', timestamp: '2026-06-04T00:00:00Z', source: 'agent', action: { kind: 'ExecuteBashAction' }, tool_name: 'execute_bash' });
    assert.equal(run?.kind, 'action');
    assert.equal(run?.verb, 'execute_bash');   // verb comes from tool_name, NOT the object
    assert.equal(run?.tool, 'execute_bash');
    assert.equal(run?.riskHint, 'high');        // execute/bash → high
    assert.equal(run?.id, 'e1');
    // ObservationEvent: object `observation` + tool_name.
    const edit = mapOpenHandsEvent({ source: 'environment', observation: { kind: 'FileEditObservation' }, tool_name: 'str_replace_editor' }, 3);
    assert.equal(edit?.kind, 'observation');
    assert.equal(edit?.verb, 'str_replace_editor');
    assert.equal(edit?.riskHint, 'warn');       // editor → warn
    assert.equal(edit?.id, 'openhands:3');
    assert.equal(mapOpenHandsEvent({ foo: 'bar' }), null);
    assert.equal(mapOpenHandsEvent(null), null);
  });

  test('mapOpenHandsEvent: tolerates a flattened export (string action/observation)', () => {
    const r = mapOpenHandsEvent({ action: 'read', id: 'x' });
    assert.equal(r?.kind, 'action');
    assert.equal(r?.verb, 'read');
    assert.equal(r?.riskHint, 'info');
  });

  test('observeOpenHandsRun: unsupported version degrades gracefully (no records)', () => {
    const r = observeOpenHandsRun([{ action: { kind: 'ExecuteBashAction' }, tool_name: 'execute_bash' }], '2.5.0');
    assert.equal(r.supported, false);
    assert.match(r.degraded ?? '', /unsupported|outside the supported/i);
    assert.equal(r.records.length, 0);
  });

  test('observeOpenHandsRun: supported version maps recognizable SDK events only', () => {
    const r = observeOpenHandsRun([
      { observation: { kind: 'FileEditObservation' }, tool_name: 'str_replace_editor' },
      { noise: true },
      { action: { kind: 'MessageAction' }, tool_name: 'finish' },
    ], '0.30.0');
    assert.equal(r.supported, true);
    assert.equal(r.records.length, 2);
    assert.equal(r.records[0].riskHint, 'warn');
    // non-array tolerated
    assert.deepEqual(observeOpenHandsRun(null, '0.30.0').records, []);
  });

  test('tool-policy change starts a new conversation — never mutates an active run', () => {
    const plan = planToolPolicyChange();
    assert.equal(plan.action, 'new-conversation');
    assert.equal(plan.mutatesActiveRun, false);
  });
});


// ---- #241 named candidate (FX910): resilient risk-upsert loop ------------

suite('runMcpPolicyScan sink resilience (FX910/#241)', () => {
  // Injected reader: only the shared project config exists, carrying the
  // 3-server RISKY_CONFIG (multiple risks so a mid-stream throw is meaningful).
  const readRisky = (file: string): string => {
    if (path.basename(file) === '.mcp.json') return RISKY_CONFIG;
    throw new Error('ENOENT');
  };

  test('T3: healthy sink parity — counters match direct auditMcpConfig output, failed=0', () => {
    const direct = auditMcpConfig('project', RISKY_CONFIG);
    const seen: unknown[] = [];
    const r = runMcpPolicyScan('/ws', (risk: Record<string, unknown>) => { seen.push(risk); }, readRisky);
    assert.equal(r.scanned, 1);
    assert.equal(r.total, direct.length);
    assert.equal(r.high, direct.filter((x) => x.severity === 'high').length);
    assert.equal(r.failed, 0);
    assert.equal(seen.length, direct.length);
  });

  test('T1: a sink that throws on the SECOND risk keeps scanning; failed counted, total only successes', () => {
    const direct = auditMcpConfig('project', RISKY_CONFIG);
    assert.ok(direct.length >= 3, 'fixture must yield several risks');
    let calls = 0;
    const r = runMcpPolicyScan('/ws', () => {
      calls++;
      if (calls === 2) throw new Error('ledger write refused');
    }, readRisky);
    assert.equal(calls, direct.length, 'every risk is still offered to the sink');
    assert.equal(r.failed, 1);
    assert.equal(r.total, direct.length - 1);
  });

  test('T2: an all-throwing sink never escapes the scan; total=0, failed=all', () => {
    const direct = auditMcpConfig('project', RISKY_CONFIG);
    const r = runMcpPolicyScan('/ws', () => { throw new Error('db gone'); }, readRisky);
    assert.equal(r.total, 0);
    assert.equal(r.failed, direct.length);
    assert.equal(r.scanned, 1);
  });
});
