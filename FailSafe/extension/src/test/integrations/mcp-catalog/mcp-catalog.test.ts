import { strict as assert } from 'assert';
import { MCP_CATALOG, assessCatalog } from '../../../integrations/mcp-catalog/mcp-catalog';
import { mergeMcpConfig, buildMcpServerEntry } from '../../../integrations/mcp-catalog/mcp-installer';

const NOW = new Date('2026-06-02T00:00:00Z');

suite('mcp-catalog + installer (B-INT-13/14)', () => {
  test('catalog has Context7 + Mermaid with verified npx install commands', () => {
    const ids = MCP_CATALOG.map((e) => e.id).sort();
    assert.deepEqual(ids, ['context7', 'mermaid']);
    const c7 = MCP_CATALOG.find((e) => e.id === 'context7')!;
    assert.deepEqual(c7.install.args, ['-y', '@upstash/context7-mcp']);
    const mer = MCP_CATALOG.find((e) => e.id === 'mermaid')!;
    assert.deepEqual(mer.install.args, ['-y', 'mcp-mermaid']);
  });

  test('assessCatalog risk-rates each entry (both low: publisher+repo+stdio, no dangerous tools)', () => {
    const a = assessCatalog(NOW);
    assert.equal(a.length, 2);
    for (const { assessment } of a) {
      assert.equal(assessment.level, 'low');
      // only unknown-recency (no publish date) — never a high signal.
      assert.ok(!assessment.signals.some((s) => s.severity === 'high'));
    }
  });

  test('buildMcpServerEntry yields the .mcp.json command/args shape', () => {
    const c7 = MCP_CATALOG.find((e) => e.id === 'context7')!;
    assert.deepEqual(buildMcpServerEntry(c7), { command: 'npx', args: ['-y', '@upstash/context7-mcp'] });
  });

  test('mergeMcpConfig: empty → adds under mcpServers (added=true, valid JSON)', () => {
    const c7 = MCP_CATALOG.find((e) => e.id === 'context7')!;
    const { text, added } = mergeMcpConfig('', c7);
    assert.equal(added, true);
    const parsed = JSON.parse(text);
    assert.deepEqual(parsed.mcpServers.context7, { command: 'npx', args: ['-y', '@upstash/context7-mcp'] });
  });

  test('mergeMcpConfig: preserves an existing unrelated server', () => {
    const existing = JSON.stringify({ mcpServers: { other: { command: 'foo' } } });
    const mer = MCP_CATALOG.find((e) => e.id === 'mermaid')!;
    const { text, added } = mergeMcpConfig(existing, mer);
    assert.equal(added, true);
    const parsed = JSON.parse(text);
    assert.deepEqual(parsed.mcpServers.other, { command: 'foo' });
    assert.ok(parsed.mcpServers.mermaid);
  });

  test('mergeMcpConfig: re-install updates the same key (added=false, idempotent)', () => {
    const c7 = MCP_CATALOG.find((e) => e.id === 'context7')!;
    const once = mergeMcpConfig('', c7);
    const twice = mergeMcpConfig(once.text, c7);
    assert.equal(twice.added, false);
    assert.equal(Object.keys(JSON.parse(twice.text).mcpServers).length, 1);
  });

  test('mergeMcpConfig: malformed existing text → starts fresh (no throw)', () => {
    const c7 = MCP_CATALOG.find((e) => e.id === 'context7')!;
    const { text } = mergeMcpConfig('{ not json', c7);
    assert.ok(JSON.parse(text).mcpServers.context7);
  });
});
