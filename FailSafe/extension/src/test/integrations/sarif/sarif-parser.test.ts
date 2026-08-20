import { strict as assert } from 'assert';
import { parseSarif } from '../../../integrations/sarif/sarif-parser';
import { sarifFindingsToRisks, importSarifText } from '../../../integrations/sarif/sarif-to-risk';

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

  test('importSarifText: parses → upserts deduped risks via injected sink, returns counts', () => {
    const dup = { ruleId: 'r.d', level: 'warning', message: { text: 'd' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'a.js' }, region: { startLine: 5, startColumn: 1 } } }] };
    const upserted: Array<Record<string, unknown>> = [];
    const res = importSarifText(fixture([dup, dup, { ruleId: 'r.o', level: 'error', message: { text: 'o' }, locations: [] }]), (r) => upserted.push(r));
    assert.equal(res.findings, 3);
    assert.equal(res.risks, 2);        // r.d deduped
    assert.equal(upserted.length, 2);
    assert.equal(res.errors.length, 0);
  });

  test('importSarifText: malformed input → 0 findings/risks + errors, no upsert', () => {
    const upserted: unknown[] = [];
    const res = importSarifText('{bad json', (r) => upserted.push(r));
    assert.equal(res.findings, 0);
    assert.equal(res.risks, 0);
    assert.equal(upserted.length, 0);
    assert.ok(res.errors.length > 0);
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

// #241 Tranche C D-2 (FX915): never-throws contract + guarded upsert loop.
suite('sarif resilience (FX915/#241C)', () => {
  test('T3: runs:[null] -> errors[] note, zero throw', () => {
    const r = parseSarif(JSON.stringify({ version: '2.1.0', runs: [null] }));
    assert.equal(r.findings.length, 0);
    assert.ok(r.errors.some((e) => /run/i.test(e)), 'null run must be reported, not thrown');
  });

  test('T4: non-array rules/results objects -> skipped with errors[] notes, zero throw', () => {
    const r = parseSarif(JSON.stringify({
      version: '2.1.0',
      runs: [{ tool: { driver: { name: 't', rules: { bogus: true } } }, results: { bogus: true } }],
    }));
    assert.equal(r.findings.length, 0);
    assert.ok(r.errors.length >= 1, 'non-iterable shapes must surface as parse notes');
  });

  test('T5: throwing upsert mid-stream -> remaining risks processed, failed counted', () => {
    const text = JSON.stringify({
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 't' } },
        results: [
          { ruleId: 'r1', level: 'error', message: { text: 'a' } },
          { ruleId: 'r2', level: 'error', message: { text: 'b' } },
          { ruleId: 'r3', level: 'error', message: { text: 'c' } },
        ],
      }],
    });
    let calls = 0;
    const r = importSarifText(text, () => {
      calls++;
      if (calls === 2) throw new Error('register write refused');
    });
    assert.equal(calls, 3, 'every risk is still offered to the sink');
    assert.equal((r as any).failed, 1);
    assert.equal(r.risks, 2, 'risks counts only successful upserts');
  });
});

// #241C D-4 (FX915): opt-in parity — manifest + guard.
suite('sarif opt-in (FX915/#241C)', () => {
  test('T9: manifest declares failsafe.integrations.sarif.enabled default false + catalog lists it', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const root = path.resolve(__dirname, '..', '..', '..', '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const prop = pkg.contributes.configuration.properties['failsafe.integrations.sarif.enabled'];
    assert.ok(prop, 'manifest must declare the sarif opt-in');
    assert.equal(prop.default, false, 'default must be OFF');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { INTEGRATION_CATALOG } = require('../../../integrations/catalog/integration-catalog');
    assert.ok(
      INTEGRATION_CATALOG.some((e: { id: string; enabledKey: string }) =>
        e.id === 'sarif' && e.enabledKey === 'failsafe.integrations.sarif.enabled'),
      'the Integrations Catalog must list SARIF with its enabledKey',
    );
  });
});
