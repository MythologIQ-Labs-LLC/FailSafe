// Functional tests for the ACP governed-proxy install helpers (GH #172 Part 2):
// the governed-twin builder + registry discovery + wrappable-agent listing.
// Pure (no fs, no vscode) → headless; fs.existsSync is injected.

import { strict as assert } from 'assert';
import * as path from 'path';
import { buildGovernedTwin, FAILSAFE_AGENT_ID, type DevinAgent, type DevinRegistry } from '../../../../integrations/acp/registry/DevinRegistryWriter';
import { resolveDevinRegistries, listWrappableAgents, wrappableAgentsFromText } from '../../../../integrations/acp/registry/AcpInstall';

const SOURCE: DevinAgent = {
  id: 'gemini', name: 'Gemini',
  version: '1.0.0',
  distribution: { binary: {
    'linux-x86_64': { archive: '', cmd: 'gemini', args: ['acp'] },
    'darwin-aarch64': { archive: '', cmd: 'gemini', args: ['acp'] },
  } },
};

suite('integrations/acp/registry buildGovernedTwin', () => {
  test('wraps each source platform binary with the proxy + verbatim tail', () => {
    const twin = buildGovernedTwin(SOURCE, { nodePath: '/usr/bin/node', proxyJsPath: '/ext/dist/acp-proxy.js', workspaceRoot: '/repo' });
    assert.deepEqual(Object.keys(twin.distribution.binary).sort(), ['darwin-aarch64', 'linux-x86_64']);
    assert.deepEqual(twin.distribution.binary['linux-x86_64'], {
      archive: '',
      cmd: '/usr/bin/node',
      args: ['/ext/dist/acp-proxy.js', '--workspace', '/repo', '--', 'gemini', 'acp'],
    });
  });

  test('twin id defaults to the FailSafe id (so install upserts/replaces, never duplicates)', () => {
    assert.equal(buildGovernedTwin(SOURCE, { nodePath: 'node', proxyJsPath: 'p', workspaceRoot: '/w' }).id, FAILSAFE_AGENT_ID);
  });

  test('the `--` separator isolates the wrapped command (no proxy/agent flag bleed)', () => {
    const twin = buildGovernedTwin(SOURCE, { nodePath: 'node', proxyJsPath: 'p.js', workspaceRoot: '/w' });
    const args = twin.distribution.binary['linux-x86_64'].args;
    const sep = args.indexOf('--');
    assert.ok(sep > 0 && args.slice(sep + 1).join(' ') === 'gemini acp', 'tail after `--` is exactly the source command');
  });
});

suite('integrations/acp/registry resolveDevinRegistries', () => {
  test('returns only channels whose registry file exists', () => {
    const home = '/home/u';
    const stable = path.join(home, '.windsurf', 'acp', 'registry.json');
    const found = resolveDevinRegistries(home, (p) => p === stable);
    assert.equal(found.length, 1);
    assert.equal(found[0].channel, 'stable');
    assert.equal(found[0].path, stable);
  });

  test('returns empty when no registry exists', () => {
    assert.deepEqual(resolveDevinRegistries('/home/u', () => false), []);
  });

  test('finds both channels when both exist', () => {
    assert.equal(resolveDevinRegistries('/home/u', () => true).length, 2);
  });
});

suite('integrations/acp/registry listWrappableAgents', () => {
  const reg: DevinRegistry = {
    version: '1.0.0',
    agents: [
      SOURCE,
      { id: FAILSAFE_AGENT_ID, name: 'FailSafe (governed)', version: '1', distribution: { binary: { 'linux-x86_64': { archive: '', cmd: 'node', args: [] } } } },
      { id: 'binaryless', name: 'No Binary', version: '1', distribution: { binary: {} } },
    ],
    extensions: [],
  };

  test('excludes the FailSafe twin (never wrap ourselves) and binary-less agents', () => {
    const wrappable = listWrappableAgents(reg);
    assert.deepEqual(wrappable.map((a) => a.id), ['gemini']);
  });

  test('wrappableAgentsFromText parses + filters in one step; malformed → []', () => {
    assert.deepEqual(wrappableAgentsFromText(JSON.stringify(reg)).map((a) => a.id), ['gemini']);
    assert.deepEqual(wrappableAgentsFromText('{ broken'), []);
  });
});
