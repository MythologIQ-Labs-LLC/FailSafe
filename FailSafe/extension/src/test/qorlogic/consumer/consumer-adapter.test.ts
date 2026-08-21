// FX892 — Qor-logic consumer adapter (#233). Behavior tests over the six
// fixture sets in src/test/fixtures/qor-consumer (supported, missing-optional,
// stale, malformed, unsupported-version, partial-migration).
//
// Fixtures store `ws-docs/` and `qor-gates/` (dot-free / non-docs names —
// the root .gitignore's unanchored `.qor/` and `docs/` patterns match at any
// depth and would silently drop fixture files from git). materialize() copies
// a fixture set into a temp workspace and renames them to the REAL artifact
// paths (`docs/`, `.qor/gates/`) before the adapter runs.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readMetaLedgerArtifact,
  readFeatureIndexArtifact,
  readTrackerManifestArtifact,
  readAuditGateArtifact,
  classifyMetaLedgerText,
} from '../../../qorlogic/consumer/consumer-adapter';
import { WorkspaceArtifactBuilder } from '../../../roadmap/services/WorkspaceArtifactBuilder';
import type { QorLogicVersionStatus } from '../../../qorlogic/qorLogicInstallRecord';
import { parseMetaLedgerEntries } from '../../../qorlogic/meta-ledger-model';

const FIXTURE_ROOT = path.resolve(
  __dirname, '..', '..', '..', '..', 'src', 'test', 'fixtures', 'qor-consumer',
);

const BELOW_FLOOR: QorLogicVersionStatus = {
  installed: '0.50.0',
  minimum: '0.100.0',
  meetsFloor: false,
};

const EPOCH_2000 = new Date('2000-01-01T00:00:00Z');

const tempRoots: string[] = [];

/** Copy a fixture set into a temp workspace with the real artifact paths. */
function materialize(fixture: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-consumer-'));
  fs.cpSync(path.join(FIXTURE_ROOT, fixture), root, { recursive: true });
  const wsDocs = path.join(root, 'ws-docs');
  if (fs.existsSync(wsDocs)) fs.renameSync(wsDocs, path.join(root, 'docs'));
  const gates = path.join(root, 'qor-gates');
  if (fs.existsSync(gates)) {
    fs.mkdirSync(path.join(root, '.qor'), { recursive: true });
    fs.renameSync(gates, path.join(root, '.qor', 'gates'));
  }
  tempRoots.push(root);
  return root;
}

suite('qor consumer adapter (#233 FX892)', () => {
  suiteTeardown(() => {
    for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
  });

  test('supported: META_LEDGER -> ok with parsed entries and provenance', () => {
    const env = readMetaLedgerArtifact(materialize('supported'));
    assert.equal(env.artifact, 'META_LEDGER');
    assert.equal(env.state, 'ok');
    assert.equal(env.data?.length, 2, 'data must hold the two parsed entries');
    assert.equal(env.data?.[0]?.n, 1);
    assert.ok(env.provenance.sourcePath.includes('META_LEDGER.md'));
    assert.equal(typeof env.provenance.mtimeIso, 'string', 'mtimeIso populated');
    assert.equal(env.reason, null);
  });

  test('supported: FEATURE_INDEX + programs.yaml + audit gate -> ok', () => {
    const root = materialize('supported');
    const fi = readFeatureIndexArtifact(root);
    assert.equal(fi.state, 'ok');
    assert.equal(fi.data?.[0]?.id, 'FX001');
    const tm = readTrackerManifestArtifact(root);
    assert.equal(tm.state, 'ok');
    assert.equal(tm.data?.programs?.length, 1);
    const ag = readAuditGateArtifact(root, 'sess-1');
    assert.equal(ag.state, 'ok');
    assert.equal(ag.data?.verdict, 'PASS');
  });

  test('missing optional artifact -> unavailable with null data', () => {
    const env = readFeatureIndexArtifact(materialize('missing-optional'));
    assert.equal(env.state, 'unavailable');
    assert.equal(env.data, null);
    assert.ok(env.reason, 'unavailable carries a reason');
    assert.equal(env.provenance.mtimeIso, null);
  });

  test('malformed META_LEDGER (non-empty garbage) -> malformed, reason names source path', () => {
    const env = readMetaLedgerArtifact(materialize('malformed'));
    assert.equal(env.state, 'malformed');
    assert.equal(env.data, null);
    assert.ok(env.reason?.includes('META_LEDGER.md'), `reason names the file: ${env.reason}`);
  });

  test('malformed programs.yaml (yaml throw) + garbage audit.json -> malformed', () => {
    const root = materialize('malformed');
    const tm = readTrackerManifestArtifact(root);
    assert.equal(tm.state, 'malformed');
    assert.ok(tm.reason?.includes('programs.yaml'), `reason names the file: ${tm.reason}`);
    const ag = readAuditGateArtifact(root, 'sess-1');
    assert.equal(ag.state, 'malformed');
    assert.ok(ag.reason?.includes('audit.json'), `reason names the file: ${ag.reason}`);
  });

  test('versionStatus below floor -> unsupported naming installed and minimum', () => {
    const root = materialize('unsupported-version');
    const env = readMetaLedgerArtifact(root, { versionStatus: BELOW_FLOOR });
    assert.equal(env.state, 'unsupported');
    assert.equal(env.data, null);
    assert.ok(env.reason?.includes('0.50.0'), `reason names installed: ${env.reason}`);
    assert.ok(env.reason?.includes('0.100.0'), `reason names minimum: ${env.reason}`);
  });

  test('maxAgeMs exceeded -> stale with data still present', () => {
    const root = materialize('stale');
    fs.utimesSync(path.join(root, 'docs', 'META_LEDGER.md'), EPOCH_2000, EPOCH_2000);
    const env = readMetaLedgerArtifact(root, { maxAgeMs: 1 });
    assert.equal(env.state, 'stale');
    assert.ok((env.data?.length ?? 0) > 0, 'stale keeps the parsed data');
    assert.ok(env.reason, 'stale carries a reason');
  });

  test('generous maxAgeMs keeps state ok', () => {
    const root = materialize('stale');
    const env = readMetaLedgerArtifact(root, { maxAgeMs: 1000 * 60 * 60 * 24 * 365 * 100 });
    assert.equal(env.state, 'ok');
  });

  test('partial-migration: ledger ok while feature index unavailable (mixed states)', () => {
    const root = materialize('partial-migration');
    assert.equal(readMetaLedgerArtifact(root).state, 'ok');
    assert.equal(readFeatureIndexArtifact(root).state, 'unavailable');
  });

  test('invalid audit session id -> unavailable (mirrors AuditGateArtifactReader validation)', () => {
    const root = materialize('supported');
    assert.equal(readAuditGateArtifact(root, 'bad/../id').state, 'unavailable');
    assert.equal(readAuditGateArtifact(root, undefined).state, 'unavailable');
    assert.equal(readAuditGateArtifact(root, '').state, 'unavailable');
  });

  test('WorkspaceArtifactBuilder: malformed ledger -> qorConsumer malformed + explicit-empty summary', () => {
    const snapshot = new WorkspaceArtifactBuilder(materialize('malformed')).build();
    const ledgerDiag = snapshot.qorConsumer.artifacts.find((a) => a.artifact === 'META_LEDGER');
    assert.equal(ledgerDiag?.state, 'malformed');
    assert.ok(ledgerDiag?.reason?.includes('META_LEDGER.md'), `reason: ${ledgerDiag?.reason}`);
    assert.equal(snapshot.qorConsumer.compatible, false);
    assert.equal(snapshot.ledgerSummary.totalEntries, 0, 'explicit empty, no fabricated entries');
    assert.equal(snapshot.ledgerSummary.latestEntry, null);
    assert.deepEqual(snapshot.ledgerVerdicts, []);
    assert.deepEqual(snapshot.ledgerCompletions, []);
  });

  test('WorkspaceArtifactBuilder: supported ledger -> qorConsumer ok + populated summary', () => {
    const snapshot = new WorkspaceArtifactBuilder(materialize('supported')).build();
    const ledgerDiag = snapshot.qorConsumer.artifacts.find((a) => a.artifact === 'META_LEDGER');
    assert.equal(ledgerDiag?.state, 'ok');
    assert.equal(snapshot.ledgerSummary.totalEntries, 2);
  });
});

suite('#233 route-seam equivalence (FX892 MODIFIED)', () => {
  test('T3: envelope entries ≡ legacy parseMetaLedgerEntries over the same fixture workspace', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'consumer-233-'));
    const ledgerText = [
      '### Entry #7: SESSION SEAL - fixture',
      '',
      '**Timestamp**: 2026-08-20T00:00:00Z',
      '**Phase**: SUBSTANTIATE',
      '**Author**: Judge',
      '**Risk Grade**: L2',
      '',
      '## Decision',
      '',
      'Fixture seal.',
    ].join('\n');
    fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'docs', 'META_LEDGER.md'), ledgerText);
    const envelope = readMetaLedgerArtifact(ws);
    assert.equal(envelope.state, 'ok');
    const legacy = parseMetaLedgerEntries(ledgerText);
    assert.deepEqual(envelope.data, legacy,
      'the adapter envelope must carry exactly what the legacy direct-parse path produced');
  });
});

// #233: classifyMetaLedgerText is the text-only sibling of readMetaLedgerArtifact, for
// callers with an injected file-read seam instead of a workspace root (governance-sidecar.ts
// / SidecarDeps). No fixture filesystem involved — pure over the text argument.
suite('classifyMetaLedgerText (#233 text-seam classification)', () => {
  const OK_LEDGER = [
    '### Entry #1: SESSION SEAL - fixture',
    '',
    '**Phase**: SUBSTANTIATE',
    '**Chain Hash**: `' + 'a'.repeat(64) + '`',
    '',
  ].join('\n');

  test('null text -> unavailable, null mtimeIso (no fs stat performed)', () => {
    const env = classifyMetaLedgerText(null, 'docs/META_LEDGER.md');
    assert.equal(env.state, 'unavailable');
    assert.equal(env.data, null);
    assert.ok(env.reason?.includes('docs/META_LEDGER.md'));
    assert.equal(env.provenance.mtimeIso, null);
    assert.equal(env.provenance.sourcePath, 'docs/META_LEDGER.md');
  });

  test('non-empty parseable text -> ok with the parsed entries', () => {
    const env = classifyMetaLedgerText(OK_LEDGER, 'docs/META_LEDGER.md');
    assert.equal(env.state, 'ok');
    assert.equal(env.data?.length, 1);
    assert.equal(env.reason, null);
    assert.deepEqual(env.data, parseMetaLedgerEntries(OK_LEDGER),
      'must match the canonical parser exactly');
  });

  test('whitespace-only text -> ok with an empty entries array (not malformed)', () => {
    const env = classifyMetaLedgerText('   \n', 'docs/META_LEDGER.md');
    assert.equal(env.state, 'ok');
    assert.deepEqual(env.data, []);
  });

  test('non-empty text that parses to zero entries -> malformed, reason names the source', () => {
    const env = classifyMetaLedgerText('not a governance ledger, no entries here\n', 'docs/META_LEDGER.md');
    assert.equal(env.state, 'malformed');
    assert.equal(env.data, null);
    assert.ok(env.reason?.includes('docs/META_LEDGER.md'), `reason: ${env.reason}`);
  });

  test('below-floor version -> unsupported, reason names installed and minimum', () => {
    const env = classifyMetaLedgerText(OK_LEDGER, 'docs/META_LEDGER.md', {
      versionStatus: { installed: '0.50.0', minimum: '0.100.0', meetsFloor: false },
    });
    assert.equal(env.state, 'unsupported');
    assert.equal(env.data, null);
    assert.ok(env.reason?.includes('0.50.0') && env.reason?.includes('0.100.0'), `reason: ${env.reason}`);
  });

  test('never throws on malformed text, mirrors readMetaLedgerArtifact classification exactly', () => {
    assert.doesNotThrow(() => classifyMetaLedgerText('garbage', 'docs/META_LEDGER.md'));
  });
});
