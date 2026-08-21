// Functional tests for the Devin Desktop ACP registry primitive (GH #172 Part 2).
// Pure path/merge logic + temp-dir fs for install/uninstall (no live Devin, no SDK).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { devinRegistryPath, devinPlatformKey, DEVIN_PLATFORM_KEYS } from '../../../../integrations/acp/registry/DevinRegistryPaths';
import {
  parseRegistry, buildFailSafeAgent, upsertAgent,
  installFailSafeAgent, uninstallFailSafeAgent, FAILSAFE_AGENT_ID, DevinRegistry,
} from '../../../../integrations/acp/registry/DevinRegistryWriter';
import { checkFailSafeEntry } from '../../../../integrations/acp/registry/DevinRegistryGuard';

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-devin-reg-')); }
const AGENT = buildFailSafeAgent({ proxyCmd: 'node', proxyArgs: ['/x/acp-proxy.js', '--', 'real-agent'] });

suite('integrations/acp/registry DevinRegistry', () => {
  test('devinRegistryPath resolves stable + next channels', () => {
    assert.equal(devinRegistryPath('stable', '/home/u'), path.join('/home/u', '.windsurf', 'acp', 'registry.json'));
    assert.equal(devinRegistryPath('next', '/home/u'), path.join('/home/u', '.windsurf-next', 'acp', 'registry.json'));
  });

  test('devinPlatformKey maps node platform/arch → Devin composite keys (null when unsupported)', () => {
    assert.equal(devinPlatformKey('darwin', 'arm64'), 'darwin-aarch64');
    assert.equal(devinPlatformKey('linux', 'x64'), 'linux-x86_64');
    assert.equal(devinPlatformKey('win32', 'arm64'), 'windows-aarch64');
    assert.equal(devinPlatformKey('freebsd', 'x64'), null);
    assert.equal(devinPlatformKey('linux', 'mips'), null);
  });

  test('buildFailSafeAgent populates all six platforms pointing at the proxy', () => {
    assert.deepEqual(Object.keys(AGENT.distribution.binary).sort(), [...DEVIN_PLATFORM_KEYS].sort());
    assert.equal(AGENT.distribution.binary['linux-x86_64'].cmd, 'node');
    assert.deepEqual(AGENT.distribution.binary['linux-x86_64'].args, ['/x/acp-proxy.js', '--', 'real-agent']);
    assert.equal(AGENT.distribution.binary['darwin-aarch64'].archive, '');
  });

  test('parseRegistry tolerates missing + malformed input (fresh skeleton)', () => {
    assert.deepEqual(parseRegistry(null), { version: '1.0.0', agents: [], extensions: [] });
    assert.deepEqual(parseRegistry('{ not json'), { version: '1.0.0', agents: [], extensions: [] });
    const ok = parseRegistry(JSON.stringify({ version: '2.0.0', agents: [{ id: 'a' }], extensions: [{}] }));
    assert.equal(ok.version, '2.0.0');
    assert.equal(ok.agents.length, 1);
  });

  test('upsertAgent PRESERVES other agents + extensions (merge-not-clobber)', () => {
    const reg: DevinRegistry = { version: '1.0.0', agents: [{ id: 'other' } as never], extensions: [{ id: 'ext' }] };
    const merged = upsertAgent(reg, AGENT);
    assert.ok(merged.agents.some((a) => a.id === 'other'), 'other agent preserved');
    assert.ok(merged.agents.some((a) => a.id === FAILSAFE_AGENT_ID), 'failsafe agent added');
    assert.deepEqual(merged.extensions, [{ id: 'ext' }], 'extensions preserved');
  });

  test('upsertAgent replaces (not duplicates) an existing FailSafe entry', () => {
    const once = upsertAgent({ version: '1.0.0', agents: [], extensions: [] }, AGENT);
    const twice = upsertAgent(once, AGENT);
    assert.equal(twice.agents.filter((a) => a.id === FAILSAFE_AGENT_ID).length, 1);
  });

  test('install → uninstall round-trip on disk, preserving a co-resident agent', () => {
    const dir = tmp();
    try {
      const file = path.join(dir, 'registry.json');
      // seed a registry with an unrelated agent
      fs.writeFileSync(file, JSON.stringify({ version: '1.0.0', agents: [{ id: 'devin', name: 'Devin' }], extensions: [] }), 'utf8');
      installFailSafeAgent(file, AGENT);
      let reg = parseRegistry(fs.readFileSync(file, 'utf8'));
      assert.ok(reg.agents.some((a) => a.id === 'devin'), 'co-resident agent survives install');
      assert.ok(reg.agents.some((a) => a.id === FAILSAFE_AGENT_ID), 'failsafe installed');
      assert.equal(checkFailSafeEntry(reg, AGENT).status, 'intact');

      uninstallFailSafeAgent(file);
      reg = parseRegistry(fs.readFileSync(file, 'utf8'));
      assert.ok(reg.agents.some((a) => a.id === 'devin'), 'co-resident agent survives uninstall');
      assert.ok(!reg.agents.some((a) => a.id === FAILSAFE_AGENT_ID), 'failsafe removed');
      assert.equal(checkFailSafeEntry(reg, AGENT).status, 'missing');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('install creates the registry (+ parent dirs) when absent', () => {
    const dir = tmp();
    try {
      const file = path.join(dir, 'acp', 'registry.json');
      installFailSafeAgent(file, AGENT);
      assert.ok(fs.existsSync(file));
      assert.equal(parseRegistry(fs.readFileSync(file, 'utf8')).agents[0].id, FAILSAFE_AGENT_ID);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('guard reports intact when the live entry matches', () => {
    const reg: DevinRegistry = { version: '1.0.0', agents: [AGENT], extensions: [] };
    assert.equal(checkFailSafeEntry(reg, AGENT).status, 'intact');
  });

  test('guard detects tampering — cmd rewritten back to the raw agent (bypass attack)', () => {
    // Clone the FailSafe entry but rewrite one platform's cmd to the raw agent.
    const hijacked = JSON.parse(JSON.stringify(AGENT)) as typeof AGENT;
    hijacked.distribution.binary['linux-x86_64'] = { archive: '', cmd: 'real-agent', args: [] };
    const reg: DevinRegistry = { version: '1.0.0', agents: [hijacked], extensions: [] };
    const res = checkFailSafeEntry(reg, AGENT);
    assert.equal(res.status, 'tampered');
    assert.deepEqual(res.driftedPlatforms, ['linux-x86_64']);
  });

  test('guard detects tampering — archive changed with cmd/args left alone (Devin-managed download swap)', () => {
    // FX898 review: archive was never compared, even though the module's own
    // header comment says a non-empty archive changes what Devin launches.
    const hijacked = JSON.parse(JSON.stringify(AGENT)) as typeof AGENT;
    hijacked.distribution.binary['darwin-aarch64'].archive = 'https://attacker.example/payload.tar.gz';
    const reg: DevinRegistry = { version: '1.0.0', agents: [hijacked], extensions: [] };
    const res = checkFailSafeEntry(reg, AGENT);
    assert.equal(res.status, 'tampered');
    assert.deepEqual(res.driftedPlatforms, ['darwin-aarch64']);
  });

  test('guard detects tampering — a live-only platform key not present in the expected entry', () => {
    // FX898 review: only expected platforms were examined, so an attacker adding
    // a brand-new platform key was invisible to the guard.
    const hijacked = JSON.parse(JSON.stringify(AGENT)) as typeof AGENT;
    (hijacked.distribution.binary as Record<string, unknown>)['freebsd-x86_64'] = {
      archive: '', cmd: 'sneaky', args: [],
    };
    const reg: DevinRegistry = { version: '1.0.0', agents: [hijacked], extensions: [] };
    const res = checkFailSafeEntry(reg, AGENT);
    assert.equal(res.status, 'tampered');
    assert.deepEqual(res.driftedPlatforms, ['freebsd-x86_64']);
  });
});
