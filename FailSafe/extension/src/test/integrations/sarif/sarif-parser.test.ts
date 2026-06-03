import { strict as assert } from 'assert';
import { parseSarif } from '../../../integrations/sarif/sarif-parser';
import { sarifFindingsToRisks } from '../../../integrations/sarif/sarif-to-risk';

/** Minimal Semgrep-CE-shaped SARIF 2.1.0 fixture. */
function fixture(results: unknown[]): string {
  return JSON.stringify({
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'semgrep', version: '1.2.3', rules: [{ id: 'rule.default-note', defaultConfiguration: { level: 'note' } }] } },
      results,
    }],
  });
}

suite('sarif-parser (B-INT-9 #99)', () => {
  test('parses a well-formed result: ruleId/severity/file/region/tool', () => {
    const r = parseSarif(fixture([{
      ruleId: 'js.no-eval', level: 'error', message: { text: 'eval is dangerous' },
      locations: [{ physicalLocation: { artifactLocation: { uri: 'src/a.js' }, region: { startLine: 12, startColumn: 3 } } }],
    }]));
    assert.equal(r.errors.length, 0);
    assert.equal(r.findings.length, 1);
    const f = r.findings[0];
    assert.equal(f.ruleId, 'js.no-eval');
    assert.equal(f.severity, 'high'); // error -> high
    assert.equal(f.file, 'src/a.js');
    assert.equal(f.startLine, 12);
    assert.equal(f.tool, 'semgrep');
    assert.equal(f.toolVersion, '1.2.3');
  });

  test('level map: error→high, warning→warn, note/none→info; missing level → rule default', () => {
    const r = parseSarif(fixture([
      { ruleId: 'r.warn', level: 'warning', message: { text: 'w' }, locations: [] },
      { ruleId: 'r.note', level: 'note', message: { text: 'n' }, locations: [] },
      { ruleId: 'rule.default-note', message: { text: 'uses rule default' }, locations: [] }, // no level → note (info)
    ]));
    assert.equal(r.findings.find((f) => f.ruleId === 'r.warn')?.severity, 'warn');
    assert.equal(r.findings.find((f) => f.ruleId === 'r.note')?.severity, 'info');
    assert.equal(r.findings.find((f) => f.ruleId === 'rule.default-note')?.severity, 'info');
  });

  test('tolerates a missing region (file/line null), still emits a finding', () => {
    const r = parseSarif(fixture([{ ruleId: 'r.x', level: 'warning', message: { text: 'no loc' } }]));
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].file, null);
    assert.equal(r.findings[0].startLine, null);
  });

  test('skips a result with no ruleId (records an error, keeps the rest)', () => {
    const r = parseSarif(fixture([
      { level: 'error', message: { text: 'no rule' }, locations: [] },
      { ruleId: 'r.ok', level: 'warning', message: { text: 'ok' }, locations: [] },
    ]));
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].ruleId, 'r.ok');
    assert.ok(r.errors.some((e) => /missing ruleId/.test(e)));
  });

  test('rejects malformed JSON / wrong version / missing runs (errors, no throw)', () => {
    assert.match(parseSarif('{not json').errors[0], /malformed JSON/);
    assert.match(parseSarif(JSON.stringify({ version: '1.0.0', runs: [] })).errors[0], /unsupported SARIF version/);
    assert.match(parseSarif(JSON.stringify({ version: '2.1.0' })).errors[0], /no runs/);
  });

  test('dedupKey is stable + identical for duplicate results; sarifFindingsToRisks dedups', () => {
    const dup = { ruleId: 'r.dup', level: 'warning', message: { text: 'd' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'a.js' }, region: { startLine: 5, startColumn: 1 } } }] };
    const r = parseSarif(fixture([dup, dup]));
    assert.equal(r.findings.length, 2);
    assert.equal(r.findings[0].dedupKey, r.findings[1].dedupKey);
    const risks = sarifFindingsToRisks(r.findings);
    assert.equal(risks.length, 1); // deduped by id
    assert.equal(risks[0].id, `sarif:${r.findings[0].dedupKey}`);
    assert.equal(risks[0].source, 'sarif');
    assert.equal(risks[0].status, 'open');
  });
});
