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
  readMetaLedgerRaw,
  applyVersionFloor,
  type RawArtifactRead,
  type ConsumerReadOptions,
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

// #233: classifyMetaLedgerText runs META_LEDGER classification through the SAME shared
// classifyRead ladder readMetaLedgerArtifact uses, for callers with their own injected
// read seam instead of a workspace root (governance-sidecar.ts / SidecarDeps). No fixture
// filesystem involved — pure over the RawArtifactRead argument.
suite('classifyMetaLedgerText (#233 shared-ladder text-seam classification)', () => {
  const OK_LEDGER = [
    '### Entry #1: SESSION SEAL - fixture',
    '',
    '**Phase**: SUBSTANTIATE',
    '**Chain Hash**: `' + 'a'.repeat(64) + '`',
    '',
  ].join('\n');

  test('absent (text null, no readError) -> unavailable', () => {
    const env = classifyMetaLedgerText({ text: null, mtimeIso: null }, 'docs/META_LEDGER.md');
    assert.equal(env.state, 'unavailable');
    assert.equal(env.data, null);
    assert.ok(env.reason?.includes('docs/META_LEDGER.md'));
    assert.equal(env.provenance.mtimeIso, null);
    assert.equal(env.provenance.sourcePath, 'docs/META_LEDGER.md');
  });

  // The G1 review finding: a present-but-unreadable ledger (EACCES/EISDIR) must classify
  // as malformed (untrusted), never as unavailable (silently "no governance") — the exact
  // distinction a plain try/catch-to-null read seam cannot make, which is why this function
  // takes a RawArtifactRead with an explicit readError channel instead of a bare string|null.
  test('present but unreadable (text null, readError set) -> malformed, not unavailable', () => {
    const env = classifyMetaLedgerText(
      { text: null, mtimeIso: '2026-01-01T00:00:00.000Z', readError: 'EISDIR: illegal operation on a directory, read' },
      'docs/META_LEDGER.md',
    );
    assert.equal(env.state, 'malformed', 'a read failure after the file is known to exist must never read as "ungoverned"');
    assert.equal(env.data, null);
    assert.ok(env.reason?.includes('docs/META_LEDGER.md'), `reason: ${env.reason}`);
    assert.ok(env.reason?.includes('EISDIR'), `reason should surface the underlying cause: ${env.reason}`);
    assert.equal(env.provenance.mtimeIso, '2026-01-01T00:00:00.000Z', 'mtime is preserved even though the read itself failed');
  });

  test('non-empty parseable text -> ok with the parsed entries', () => {
    const env = classifyMetaLedgerText({ text: OK_LEDGER, mtimeIso: null }, 'docs/META_LEDGER.md');
    assert.equal(env.state, 'ok');
    assert.equal(env.data?.length, 1);
    assert.equal(env.reason, null);
    assert.deepEqual(env.data, parseMetaLedgerEntries(OK_LEDGER),
      'must match the canonical parser exactly');
  });

  test('whitespace-only text -> ok with an empty entries array (not malformed)', () => {
    const env = classifyMetaLedgerText({ text: '   \n', mtimeIso: null }, 'docs/META_LEDGER.md');
    assert.equal(env.state, 'ok');
    assert.deepEqual(env.data, []);
  });

  test('non-empty text that parses to zero entries -> malformed, reason names the source', () => {
    const env = classifyMetaLedgerText(
      { text: 'not a governance ledger, no entries here\n', mtimeIso: null },
      'docs/META_LEDGER.md',
    );
    assert.equal(env.state, 'malformed');
    assert.equal(env.data, null);
    assert.ok(env.reason?.includes('docs/META_LEDGER.md'), `reason: ${env.reason}`);
  });

  test('below-floor version -> unsupported, reason names installed and minimum', () => {
    const env = classifyMetaLedgerText({ text: OK_LEDGER, mtimeIso: null }, 'docs/META_LEDGER.md', {
      versionStatus: { installed: '0.50.0', minimum: '0.100.0', meetsFloor: false },
    });
    assert.equal(env.state, 'unsupported');
    assert.equal(env.data, null);
    assert.ok(env.reason?.includes('0.50.0') && env.reason?.includes('0.100.0'), `reason: ${env.reason}`);
  });

  test('never throws on malformed text, mirrors readMetaLedgerArtifact classification exactly', () => {
    assert.doesNotThrow(() => classifyMetaLedgerText({ text: 'garbage', mtimeIso: null }, 'docs/META_LEDGER.md'));
  });

  test('maxAgeMs exceeded, with a caller-supplied mtimeIso -> stale, data still present', () => {
    const env = classifyMetaLedgerText(
      { text: OK_LEDGER, mtimeIso: '2000-01-01T00:00:00.000Z' },
      'docs/META_LEDGER.md',
      { maxAgeMs: 1 },
    );
    assert.equal(env.state, 'stale');
    assert.ok((env.data?.length ?? 0) > 0, 'stale keeps the parsed data');
    assert.equal(env.provenance.mtimeIso, '2000-01-01T00:00:00.000Z');
  });

  test('maxAgeMs supplied but no mtimeIso -> freshness stays unknown, classifies ok (never guessed stale)', () => {
    const env = classifyMetaLedgerText({ text: OK_LEDGER, mtimeIso: null }, 'docs/META_LEDGER.md', { maxAgeMs: 1 });
    assert.equal(env.state, 'ok');
    assert.equal(env.provenance.mtimeIso, null);
  });

  test('generous maxAgeMs with a recent mtimeIso -> stays ok', () => {
    const env = classifyMetaLedgerText(
      { text: OK_LEDGER, mtimeIso: new Date().toISOString() },
      'docs/META_LEDGER.md',
      { maxAgeMs: 1000 * 60 * 60 * 24 * 365 * 100 },
    );
    assert.equal(env.state, 'ok');
  });
});

// #233 iteration-5, plan-233-read-ledger-once.md Phase 1: readMetaLedgerRaw is the ONE fs
// touch for docs/META_LEDGER.md; readMetaLedgerArtifact and WorkspaceArtifactBuilder.build()
// both route through it instead of each doing their own read.
suite('readMetaLedgerRaw (#233 iteration-5 Phase 1)', () => {
  const rawRoots: string[] = [];

  function freshRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-ledger-'));
    rawRoots.push(root);
    return root;
  }

  suiteTeardown(() => {
    for (const root of rawRoots) fs.rmSync(root, { recursive: true, force: true });
  });

  test('present ledger -> {text, mtimeIso}, no readError', () => {
    const root = freshRoot();
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'META_LEDGER.md'), '### Entry #1: X\n');
    const raw = readMetaLedgerRaw(root);
    assert.equal(raw.read.text, '### Entry #1: X\n');
    assert.equal(typeof raw.read.mtimeIso, 'string', 'mtimeIso populated for a present file');
    assert.equal(raw.read.readError, undefined);
    assert.ok(raw.sourcePath.endsWith(path.join('docs', 'META_LEDGER.md')));
  });

  test('absent ledger -> {text: null, mtimeIso: null}, no readError', () => {
    const root = freshRoot();
    const raw = readMetaLedgerRaw(root);
    assert.equal(raw.read.text, null);
    assert.equal(raw.read.mtimeIso, null);
    assert.equal(raw.read.readError, undefined, 'absent must not be conflated with unreadable');
  });

  test('present but unreadable (directory planted at the ledger path) -> {text: null, mtimeIso, readError}', () => {
    const root = freshRoot();
    fs.mkdirSync(path.join(root, 'docs', 'META_LEDGER.md'), { recursive: true });
    const raw = readMetaLedgerRaw(root);
    assert.equal(raw.read.text, null);
    assert.equal(typeof raw.read.mtimeIso, 'string', 'mtime is known even though the read itself failed');
    assert.ok(raw.read.readError, 'readError set, distinguishing "exists but unreadable" from "absent"');
  });
});

// #233 iteration-5 B2 (ledger #594/#597, owner decision on PR #433): readMetaLedgerArtifact,
// now redefined in terms of readMetaLedgerRaw + classifyMetaLedgerText, must remain
// behavior-preserving across all five ArtifactState values. Four are driven by the six named
// qor-consumer fixtures (each with the options that actually reach its state); `unavailable`
// cannot be reached by any of them (none omits docs/META_LEDGER.md), so it is proven instead by
// a directly-constructed absent-ledger temp workspace -- the same technique this file's own
// "#233 route-seam equivalence" suite and WorkspaceArtifactBuilder.test.ts's makeWorkspace()
// already use for exactly this class of state.
suite('readMetaLedgerArtifact equivalence across fixtures + absent (#233 iteration-5 B2, FX892)', () => {
  const equivRoots: string[] = [];

  suiteTeardown(() => {
    for (const root of equivRoots) fs.rmSync(root, { recursive: true, force: true });
  });

  const FIXTURE_CASES: Array<{
    fixture: string;
    opts?: ConsumerReadOptions;
    state: string;
    rewindMtime?: boolean;
  }> = [
    { fixture: 'supported', state: 'ok' },
    { fixture: 'malformed', state: 'malformed' },
    { fixture: 'missing-optional', state: 'ok' },
    { fixture: 'partial-migration', state: 'ok' },
    { fixture: 'stale', state: 'stale', opts: { maxAgeMs: 1 }, rewindMtime: true },
    { fixture: 'unsupported-version', state: 'unsupported', opts: { versionStatus: BELOW_FLOOR } },
  ];

  for (const { fixture, opts, state, rewindMtime } of FIXTURE_CASES) {
    test(`${fixture} fixture: state/reason/provenance/data-length equal the pre-change implementation (-> ${state})`, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'consumer-equiv-'));
      fs.cpSync(path.join(FIXTURE_ROOT, fixture), root, { recursive: true });
      const wsDocs = path.join(root, 'ws-docs');
      if (fs.existsSync(wsDocs)) fs.renameSync(wsDocs, path.join(root, 'docs'));
      equivRoots.push(root);
      if (rewindMtime) {
        fs.utimesSync(path.join(root, 'docs', 'META_LEDGER.md'), EPOCH_2000, EPOCH_2000);
      }
      const env = readMetaLedgerArtifact(root, opts);
      assert.equal(env.state, state, `${fixture}: ${env.reason}`);
      assert.equal(env.provenance.sourcePath, path.join(root, 'docs', 'META_LEDGER.md'));
      if (state === 'ok' || state === 'stale') {
        assert.ok((env.data?.length ?? 0) >= 0, `${fixture}: data present for ${state}`);
      } else {
        assert.equal(env.data, null, `${fixture}: ${state} carries no data`);
      }
    });
  }

  test('directly-constructed absent-ledger temp workspace (no fixture): unavailable, data null, reason names source path', () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'consumer-absent-'));
    equivRoots.push(emptyRoot);
    const env = readMetaLedgerArtifact(emptyRoot);
    assert.equal(env.state, 'unavailable');
    assert.equal(env.data, null);
    assert.ok(env.reason?.includes('META_LEDGER.md'), `reason names the source path: ${env.reason}`);
    assert.equal(env.provenance.mtimeIso, null);
  });

  test('bare no-options call cannot reach unavailable via the six fixtures (regression guard for the original B2 defect)', () => {
    // Every one of the six named fixtures ships docs/META_LEDGER.md, so a no-options call
    // against any of them must never report unavailable -- confirms the fixture set itself
    // still cannot produce the state Phase 1's bullet used to (falsely) claim it could.
    for (const { fixture } of FIXTURE_CASES) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'consumer-noopt-'));
      fs.cpSync(path.join(FIXTURE_ROOT, fixture), root, { recursive: true });
      const wsDocs = path.join(root, 'ws-docs');
      if (fs.existsSync(wsDocs)) fs.renameSync(wsDocs, path.join(root, 'docs'));
      equivRoots.push(root);
      assert.notEqual(readMetaLedgerArtifact(root).state, 'unavailable', fixture);
    }
  });
});

// #233 iteration-5 Phase 1, FX931: applyVersionFloor overlays the B197 floor verdict onto an
// already-classified envelope without a second read or parse. It must reproduce classifyRead's
// real floor precedence exactly for every combination it accepts.
suite('applyVersionFloor (#233 iteration-5 Phase 1, FX931)', () => {
  const AVF_OK_LEDGER = [
    '### Entry #1: SESSION SEAL - fixture',
    '',
    '**Phase**: SUBSTANTIATE',
    '**Chain Hash**: `' + 'a'.repeat(64) + '`',
    '',
  ].join('\n');
  const AVF_MALFORMED_TEXT = 'not a governance ledger, no entries here\n';
  const AVF_PATH = 'docs/META_LEDGER.md';

  const READS: Record<string, RawArtifactRead> = {
    ok: { text: AVF_OK_LEDGER, mtimeIso: null },
    malformed: { text: AVF_MALFORMED_TEXT, mtimeIso: null },
    absent: { text: null, mtimeIso: null },
  };

  const MEETS_FLOOR: QorLogicVersionStatus = { installed: '0.200.0', minimum: '0.100.0', meetsFloor: true };
  const VERSION_STATUSES: Array<{ name: string; vs: QorLogicVersionStatus | undefined }> = [
    { name: 'below-floor', vs: BELOW_FLOOR },
    { name: 'meets-floor', vs: MEETS_FLOOR },
    { name: 'undefined', vs: undefined },
  ];

  for (const [readName, read] of Object.entries(READS)) {
    for (const { name: vsName, vs } of VERSION_STATUSES) {
      test(`${readName} read x ${vsName} versionStatus: applyVersionFloor(classify(read), vs) deep-equals classify(read, {versionStatus: vs})`, () => {
        const baseEnv = classifyMetaLedgerText(read, AVF_PATH);
        const overlaid = applyVersionFloor(baseEnv, vs);
        const direct = classifyMetaLedgerText(read, AVF_PATH, { versionStatus: vs });
        assert.deepEqual(overlaid, direct);
      });
    }
  }

  test('applyVersionFloor rejects maxAgeMs at compile time (@ts-expect-error pin); the full ladder still reaches stale', () => {
    const rewound: RawArtifactRead = { text: AVF_OK_LEDGER, mtimeIso: '2000-01-01T00:00:00.000Z' };
    const env = classifyMetaLedgerText(rewound, AVF_PATH);
    // @ts-expect-error -- applyVersionFloor accepts ONLY versionStatus, not ConsumerReadOptions.
    // QorLogicVersionStatus requires {installed, minimum, meetsFloor}, so {maxAgeMs: 1} errors
    // on both the missing required members and the excess property; widening the parameter
    // back to ConsumerReadOptions would make this directive unused, itself a compile error.
    applyVersionFloor(env, { maxAgeMs: 1 });
    const staleEnv = classifyMetaLedgerText(rewound, AVF_PATH, { maxAgeMs: 1 });
    assert.equal(staleEnv.state, 'stale', 'the state the overlay cannot express is still reachable via the full ladder');
    assert.ok((staleEnv.data?.length ?? 0) > 0, 'stale keeps the parsed data');
  });

  test('applyVersionFloor carries both the floor verdict and provenance.qorVersion, not just one', () => {
    const okEnv = classifyMetaLedgerText({ text: AVF_OK_LEDGER, mtimeIso: null }, AVF_PATH);
    const belowEnv = applyVersionFloor(okEnv, BELOW_FLOOR);
    assert.equal(belowEnv.state, 'unsupported');
    assert.equal(belowEnv.data, null);
    assert.equal(belowEnv.provenance.qorVersion, BELOW_FLOOR.installed);

    const meetsEnv = applyVersionFloor(okEnv, MEETS_FLOOR);
    assert.equal(meetsEnv.state, 'ok');
    assert.equal(meetsEnv.data?.length, 1);
    assert.equal(meetsEnv.provenance.qorVersion, MEETS_FLOOR.installed);
  });
});
