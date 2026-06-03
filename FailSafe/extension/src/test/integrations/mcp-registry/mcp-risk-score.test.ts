import { strict as assert } from 'assert';
import { scoreMcpServer, sanitizeField, McpServerMeta } from '../../../integrations/mcp-registry/mcp-risk-score';

const NOW = new Date('2026-06-02T00:00:00Z');
const score = (m: McpServerMeta) => scoreMcpServer(m, { now: NOW });

suite('mcp-risk-score (B-INT-9 #108)', () => {
  test('a fully-described stdio server is low risk', () => {
    const r = score({
      name: 'bicameral', publisher: 'MythologIQ', repositoryUrl: 'https://github.com/x/bicameral',
      transports: ['stdio'], publishedAt: '2026-05-20T00:00:00Z', tools: [{ name: 'history' }, { name: 'search' }],
    });
    assert.equal(r.level, 'low');
    assert.equal(r.signals.length, 0);
  });

  test('unknown publisher + missing repository each flag med', () => {
    const r = score({ name: 'x', transports: ['stdio'], publishedAt: '2026-05-20T00:00:00Z' });
    assert.ok(r.signals.some((s) => s.id === 'unknown-publisher' && s.severity === 'med'));
    assert.ok(r.signals.some((s) => s.id === 'missing-repository' && s.severity === 'med'));
    assert.equal(r.level, 'med'); // score 4 → med
  });

  test('remote transport flags med', () => {
    const r = score({ name: 'x', publisher: 'p', repositoryUrl: 'r', transports: ['streamable-http'], publishedAt: '2026-05-20T00:00:00Z' });
    assert.ok(r.signals.some((s) => s.id === 'remote-transport'));
  });

  test('exec/mutating tool names flag high (and force high level)', () => {
    const r = score({
      name: 'x', publisher: 'p', repositoryUrl: 'r', transports: ['stdio'], publishedAt: '2026-05-20T00:00:00Z',
      tools: ['read_file', 'delete_project', 'run_command'],
    });
    const broad = r.signals.find((s) => s.id === 'broad-tool-names');
    assert.equal(broad?.severity, 'high');
    assert.match(broad!.detail, /delete_project/);
    assert.match(broad!.detail, /run_command/);
    assert.equal(r.level, 'high'); // any high signal → high
  });

  test('stale version (older than threshold) flags low; missing date flags unknown-recency', () => {
    const stale = score({ name: 'x', publisher: 'p', repositoryUrl: 'r', transports: ['stdio'], publishedAt: '2024-01-01T00:00:00Z' });
    assert.ok(stale.signals.some((s) => s.id === 'stale-version' && s.severity === 'low'));
    const noDate = score({ name: 'x', publisher: 'p', repositoryUrl: 'r', transports: ['stdio'] });
    assert.ok(noDate.signals.some((s) => s.id === 'unknown-recency'));
  });

  test('worst case (no publisher/repo + remote + dangerous tool + stale) → high, multiple signals', () => {
    const r = score({ name: 'x', transports: ['http'], publishedAt: '2023-01-01T00:00:00Z', tools: ['shell_exec'] });
    assert.equal(r.level, 'high');
    assert.ok(r.score >= 6);
    assert.deepEqual(
      r.signals.map((s) => s.id).sort(),
      ['broad-tool-names', 'missing-repository', 'remote-transport', 'stale-version', 'unknown-publisher'],
    );
  });

  test('sanitizeField escapes HTML and neutralizes active URI schemes (stored-XSS guard)', () => {
    assert.equal(sanitizeField('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
    assert.equal(sanitizeField('javascript:alert(1)'), 'blocked:alert(1)');
    assert.equal(sanitizeField('Tom & "Jerry"'), 'Tom &amp; &quot;Jerry&quot;');
  });
});
