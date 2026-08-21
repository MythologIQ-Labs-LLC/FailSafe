// Functional tests for the ACP registry drift-check (FailSafe#398).

import { strict as assert } from 'assert';
import { buildFailSafeAgent } from '../../../../integrations/acp/registry/DevinRegistryWriter';
import { checkInstalledEntryDrift } from '../../../../integrations/acp/registry/DevinRegistryDriftCheck';

const AGENT = buildFailSafeAgent({ proxyCmd: 'node', proxyArgs: ['/x/acp-proxy.js', '--', 'real-agent'] });

suite('integrations/acp/registry DevinRegistryDriftCheck', () => {
  test('returns null when nothing was previously installed (no false "missing" alarm)', () => {
    assert.equal(checkInstalledEntryDrift(null, undefined), null);
    assert.equal(checkInstalledEntryDrift(JSON.stringify({ version: '1.0.0', agents: [], extensions: [] }), undefined), null);
  });

  test('reports intact when the live registry still matches the installed entry', () => {
    const text = JSON.stringify({ version: '1.0.0', agents: [AGENT], extensions: [] });
    assert.deepEqual(checkInstalledEntryDrift(text, AGENT), { status: 'intact', driftedPlatforms: [] });
  });

  test('reports missing when the registry file is gone entirely', () => {
    assert.deepEqual(checkInstalledEntryDrift(null, AGENT), { status: 'missing', driftedPlatforms: [] });
  });

  test('reports missing when the FailSafe entry was removed but the file remains', () => {
    const text = JSON.stringify({ version: '1.0.0', agents: [{ id: 'other-agent' }], extensions: [] });
    assert.deepEqual(checkInstalledEntryDrift(text, AGENT), { status: 'missing', driftedPlatforms: [] });
  });

  test('reports tampered when the entry was rewritten back to the raw agent (bypass attack)', () => {
    const hijacked = JSON.parse(JSON.stringify(AGENT)) as typeof AGENT;
    hijacked.distribution.binary['linux-x86_64'] = { archive: '', cmd: 'real-agent', args: [] };
    const text = JSON.stringify({ version: '1.0.0', agents: [hijacked], extensions: [] });
    const result = checkInstalledEntryDrift(text, AGENT);
    assert.equal(result?.status, 'tampered');
    assert.deepEqual(result?.driftedPlatforms, ['linux-x86_64']);
  });

  test('unrelated registry edits (a co-resident agent changing) do not create a false alarm', () => {
    const text = JSON.stringify({
      version: '1.0.0',
      agents: [AGENT, { id: 'unrelated-agent', name: 'renamed', distribution: { binary: {} } }],
      extensions: [],
    });
    assert.deepEqual(checkInstalledEntryDrift(text, AGENT), { status: 'intact', driftedPlatforms: [] });
  });

  test('reports malformed (distinct from missing) when the registry file exists but is not valid JSON', () => {
    // FX898 review: parseRegistry's parse-tolerant fallback used to make a
    // corrupt registry.json indistinguishable from a cleanly-removed entry.
    const result = checkInstalledEntryDrift('{ this is not json', AGENT);
    assert.deepEqual(result, { status: 'malformed', driftedPlatforms: [] });
  });

  test('an existing-but-empty (0-byte / truncated) file is malformed, not silently "missing"', () => {
    assert.deepEqual(checkInstalledEntryDrift('', AGENT), { status: 'malformed', driftedPlatforms: [] });
  });
});
