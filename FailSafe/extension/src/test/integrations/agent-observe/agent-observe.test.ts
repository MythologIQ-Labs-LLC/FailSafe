import { strict as assert } from 'assert';
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

  test('mapOpenHandsEvent maps action/observation + risk hint; null on unrecognized', () => {
    const run = mapOpenHandsEvent({ action: 'run', args: { command: 'rm -rf /' }, timestamp: '2026-06-04T00:00:00Z' });
    assert.equal(run?.kind, 'action');
    assert.equal(run?.verb, 'run');
    assert.equal(run?.riskHint, 'high');
    assert.equal(run?.tool, 'rm -rf /');
    const read = mapOpenHandsEvent({ observation: 'read', args: { path: 'a.ts' } }, 3);
    assert.equal(read?.kind, 'observation');
    assert.equal(read?.riskHint, 'info');
    assert.equal(read?.id, 'openhands:3');
    assert.equal(mapOpenHandsEvent({ foo: 'bar' }), null);
    assert.equal(mapOpenHandsEvent(null), null);
  });

  test('observeOpenHandsRun: unsupported version degrades gracefully (no records)', () => {
    const r = observeOpenHandsRun([{ action: 'run' }], '2.5.0');
    assert.equal(r.supported, false);
    assert.match(r.degraded ?? '', /unsupported|outside the supported/i);
    assert.equal(r.records.length, 0);
  });

  test('observeOpenHandsRun: supported version maps recognizable events only', () => {
    const r = observeOpenHandsRun([{ action: 'edit', args: { path: 'x.ts' } }, { noise: true }, { observation: 'read' }], '0.30.0');
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
