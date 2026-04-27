import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  AuditReportReader,
  parseAuditFromText,
} from '../../roadmap/services/AuditReportReader';

let tmpRoot: string;

function writeAudit(content: string): void {
  const dir = path.join(tmpRoot, '.failsafe', 'governance');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'AUDIT_REPORT.md'), content);
}

const SAMPLE = `# AUDIT REPORT

**Tribunal Date**: 2026-04-27T00:00:00Z
**Target**: v5 De-Theater Pass
**Plan**: \`.failsafe/governance/plans/plan-v5-de-theater-pass.md\`
**Risk Grade**: L2
**Auditor**: The QoreLogic Judge

---

## VERDICT: PASS

---

### Executive Summary

Some text.

### Audit Observations (non-blocking)

1. First observation
2. Second observation
3. Third observation
`;

suite('AuditReportReader: parseAuditFromText', () => {
  test('extracts verdict, target, riskGrade, tribunalDate', () => {
    const audit = parseAuditFromText(SAMPLE);
    assert.equal(audit.verdict, 'PASS');
    assert.equal(audit.target, 'v5 De-Theater Pass');
    assert.equal(audit.riskGrade, 'L2');
    assert.equal(audit.tribunalDate, '2026-04-27T00:00:00Z');
  });

  test('counts numbered observations', () => {
    const audit = parseAuditFromText(SAMPLE);
    assert.equal(audit.observationCount, 3);
  });

  test('VETO verdict parsed correctly', () => {
    const veto = SAMPLE.replace('VERDICT: PASS', 'VERDICT: VETO');
    const audit = parseAuditFromText(veto);
    assert.equal(audit.verdict, 'VETO');
  });

  test('null fields when sections absent', () => {
    const audit = parseAuditFromText('# Empty file');
    assert.equal(audit.verdict, null);
    assert.equal(audit.target, null);
    assert.equal(audit.riskGrade, null);
  });
});

suite('AuditReportReader: read', function () {
  this.timeout(5000);
  setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-reader-')); });
  teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ } });

  test('returns null when AUDIT_REPORT.md absent', () => {
    const reader = new AuditReportReader(tmpRoot);
    assert.equal(reader.read(), null);
  });

  test('returns AuditSnapshot when file exists', () => {
    writeAudit(SAMPLE);
    const reader = new AuditReportReader(tmpRoot);
    const audit = reader.read();
    assert.ok(audit);
    assert.equal(audit!.verdict, 'PASS');
  });
});
