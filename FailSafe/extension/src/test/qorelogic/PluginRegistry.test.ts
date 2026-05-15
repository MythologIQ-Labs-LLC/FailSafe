// Functional tests for PluginRegistry (FX334), AgentRevocation (FX327), AgentsMarkdownGenerator (FX337).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PluginRegistry } from '../../qorelogic/PluginRegistry';
import { AgentRevocation } from '../../qorelogic/trust/AgentRevocation';
import { AgentsMarkdownGenerator } from '../../qorelogic/AgentsMarkdownGenerator';

function makePlugin(id: string, name = id): any {
  return { getManifest: () => ({ id, name }) };
}

suite('PluginRegistry (FX334)', () => {
  test('FX334 register — returns plugin id from manifest', () => {
    const r = new PluginRegistry();
    const id = r.register({ plugin: makePlugin('plugin-a') });
    assert.equal(id, 'plugin-a');
  });

  test('FX334 get — returns registered plugin or undefined', () => {
    const r = new PluginRegistry();
    const p = makePlugin('plugin-a');
    r.register({ plugin: p });
    assert.equal(r.get('plugin-a'), p);
    assert.equal(r.get('not-found'), undefined);
  });

  test('FX334 unregister — removes plugin from registry', () => {
    const r = new PluginRegistry();
    r.register({ plugin: makePlugin('plugin-a') });
    r.unregister('plugin-a');
    assert.equal(r.get('plugin-a'), undefined);
  });

  test('FX334 getAll — returns all registered plugins', () => {
    const r = new PluginRegistry();
    r.register({ plugin: makePlugin('a') });
    r.register({ plugin: makePlugin('b') });
    const all = r.getAll();
    assert.equal(all.length, 2);
  });

  test('FX334 getSorted — sorts by priority ascending', () => {
    const r = new PluginRegistry();
    r.register({ plugin: makePlugin('c'), priority: 30 });
    r.register({ plugin: makePlugin('a'), priority: 10 });
    r.register({ plugin: makePlugin('b'), priority: 20 });
    const sorted = r.getSorted();
    assert.deepEqual(sorted.map(p => p.getManifest().id), ['a', 'b', 'c']);
  });

  test('FX334 getSorted — default priority is 100', () => {
    const r = new PluginRegistry();
    r.register({ plugin: makePlugin('default') }); // 100
    r.register({ plugin: makePlugin('first'), priority: 1 });
    const sorted = r.getSorted();
    assert.deepEqual(sorted.map(p => p.getManifest().id), ['first', 'default']);
  });

  test('FX334 register — re-register same id replaces previous entry', () => {
    const r = new PluginRegistry();
    const p1 = makePlugin('a', 'first');
    const p2 = makePlugin('a', 'second');
    r.register({ plugin: p1 });
    r.register({ plugin: p2 });
    assert.equal(r.get('a'), p2);
    assert.equal(r.getAll().length, 1);
  });
});

suite('AgentRevocation (FX327)', () => {
  test('FX327 revoke — calls updateTrust(violation) + quarantineAgent + ledger append', async () => {
    const trustCalls: any[] = [];
    const quarCalls: any[] = [];
    const ledgerCalls: any[] = [];
    const trust: any = {
      updateTrust: async (did: string, outcome: string) => trustCalls.push({ did, outcome }),
      quarantineAgent: async (did: string, reason: string) => quarCalls.push({ did, reason }),
    };
    const ledger: any = { appendEntry: async (e: any) => { ledgerCalls.push(e); } };
    const r = new AgentRevocation(trust, ledger);
    await r.revoke('did:t:agent-x', 'misbehavior');
    assert.deepEqual(trustCalls, [{ did: 'did:t:agent-x', outcome: 'violation' }]);
    assert.deepEqual(quarCalls, [{ did: 'did:t:agent-x', reason: 'misbehavior' }]);
    assert.equal(ledgerCalls.length, 1);
    assert.equal(ledgerCalls[0].eventType, 'QUARANTINE_START');
    assert.equal(ledgerCalls[0].payload.reason, 'misbehavior');
    assert.equal(ledgerCalls[0].payload.revokedByGovernor, true);
  });

  test('FX327 revoke — sanitizes special characters from reason', async () => {
    const ledgerCalls: any[] = [];
    const trust: any = { updateTrust: async () => {}, quarantineAgent: async () => {} };
    const ledger: any = { appendEntry: async (e: any) => { ledgerCalls.push(e); } };
    const r = new AgentRevocation(trust, ledger);
    await r.revoke('did:t:x', 'evil <script>$$ injection');
    // <, >, $, $ removed; word chars + . , ; : ! ? ( ) - and spaces kept
    assert.equal(ledgerCalls[0].payload.reason, 'evil script injection');
  });

  test('FX327 revoke — truncates reasons over 2000 chars', async () => {
    const ledgerCalls: any[] = [];
    const trust: any = { updateTrust: async () => {}, quarantineAgent: async () => {} };
    const ledger: any = { appendEntry: async (e: any) => { ledgerCalls.push(e); } };
    const r = new AgentRevocation(trust, ledger);
    await r.revoke('did:t:x', 'A'.repeat(3000));
    assert.equal(ledgerCalls[0].payload.reason.length, 2000);
  });
});

suite('AgentsMarkdownGenerator (FX337)', () => {
  function makeRegistry(landscape: any, governed = new Set<string>()): any {
    return {
      detectAll: async () => landscape,
      hasGovernance: (system: any) => governed.has(system.getManifest().id),
    };
  }

  test('FX337 generate — empty landscape produces minimal markdown', async () => {
    const reg = makeRegistry({
      registeredSystems: [], activeTerminals: [],
      agentTeams: { enabled: false, settingsPath: '/p' },
    });
    const g = new AgentsMarkdownGenerator(reg);
    const md = await g.generate();
    assert.match(md, /# Agents/);
    assert.match(md, /## Registered Systems/);
    assert.match(md, /No agent terminals detected/);
    assert.match(md, /Status: Disabled/);
  });

  test('FX337 generate — registered system with governance shows "Yes"', async () => {
    const sys = { getManifest: () => ({ id: 'sys-1', name: 'System One' }) };
    const reg = makeRegistry({
      registeredSystems: [sys], activeTerminals: [],
      agentTeams: { enabled: false, settingsPath: '/p' },
    }, new Set(['sys-1']));
    const g = new AgentsMarkdownGenerator(reg);
    const md = await g.generate();
    assert.match(md, /\| System One \| sys-1 \| Yes \|/);
  });

  test('FX337 generate — registered system without governance shows "No"', async () => {
    const sys = { getManifest: () => ({ id: 'sys-2', name: 'System Two' }) };
    const reg = makeRegistry({
      registeredSystems: [sys], activeTerminals: [],
      agentTeams: { enabled: false, settingsPath: '/p' },
    });
    const g = new AgentsMarkdownGenerator(reg);
    const md = await g.generate();
    assert.match(md, /\| System Two \| sys-2 \| No \|/);
  });

  test('FX337 generate — active terminals rendered in table', async () => {
    const reg = makeRegistry({
      registeredSystems: [],
      activeTerminals: [{ name: 'term-1', agentType: 'claude-code' }, { name: 'term-2', agentType: 'codex' }],
      agentTeams: { enabled: true, settingsPath: '/path' },
    });
    const g = new AgentsMarkdownGenerator(reg);
    const md = await g.generate();
    assert.match(md, /\| term-1 \| claude-code \|/);
    assert.match(md, /\| term-2 \| codex \|/);
    assert.match(md, /Status: Enabled/);
    assert.match(md, /Settings: \/path/);
  });

  test('FX337 write — writes AGENTS.md to workspace root', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amg-'));
    try {
      const reg = makeRegistry({
        registeredSystems: [], activeTerminals: [],
        agentTeams: { enabled: false, settingsPath: '/p' },
      });
      const g = new AgentsMarkdownGenerator(reg);
      await g.write(dir);
      const out = path.join(dir, 'AGENTS.md');
      assert.ok(fs.existsSync(out));
      assert.match(fs.readFileSync(out, 'utf-8'), /# Agents/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
