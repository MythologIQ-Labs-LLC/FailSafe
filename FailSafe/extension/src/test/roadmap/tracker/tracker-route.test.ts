// Functional tests for TrackerRoute.api graceful degradation (v5.5.2 follow-up).
// A missing planning manifest (docs/roadmap/programs.yaml) must NOT 503 — the
// tracker renders the DISCOVERED layer (CHANGELOG/tags) with a non-blocking
// advisory so any workspace without a manifest still loads.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Request, Response } from 'express';
import { TrackerRoute } from '../../../roadmap/routes/TrackerRoute';

interface CapturedRes {
  status: number;
  body: Record<string, unknown> | null;
}

function fakeResponse(): { res: Response; captured: CapturedRes } {
  const captured: CapturedRes = { status: 200, body: null };
  const res = {
    status(code: number) { captured.status = code; return this; },
    json(body: Record<string, unknown>) { captured.body = body; return this; },
    type() { return this; },
    send() { return this; },
  } as unknown as Response;
  return { res, captured };
}

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-tracker-route-'));
}

suite('TrackerRoute.api graceful degradation', () => {
  test('manifest ABSENT → 200 (not 503) with manifestPresent:false + advisory lint', () => {
    const ws = tmpWorkspace(); // no docs/roadmap/programs.yaml
    const { res, captured } = fakeResponse();
    TrackerRoute.api({} as Request, res, { workspaceRoot: ws, uiDir: '' });
    assert.notEqual(captured.status, 503, 'must not hard-fail');
    assert.equal(captured.status, 200);
    assert.ok(captured.body, 'body present');
    assert.equal(captured.body!.manifestPresent, false);
    assert.equal(captured.body!.ok, true, 'absent manifest is not an abort');
    assert.ok(Array.isArray(captured.body!.rcs), 'discovered-release axis present');
    const lint = captured.body!.lint as Array<{ code: string; severity: string }>;
    const advisory = lint.find((f) => f.code === 'manifest-absent');
    assert.ok(advisory, 'manifest-absent advisory present');
    assert.equal(advisory!.severity, 'warn', 'advisory is non-blocking');
  });

  test('manifest PRESENT → 200 with manifestPresent:true', () => {
    const ws = tmpWorkspace();
    fs.mkdirSync(path.join(ws, 'docs', 'roadmap'), { recursive: true });
    fs.writeFileSync(
      path.join(ws, 'docs', 'roadmap', 'programs.yaml'),
      'programs: []\nrcs: []\nphases: []\n',
      'utf-8',
    );
    const { res, captured } = fakeResponse();
    TrackerRoute.api({} as Request, res, { workspaceRoot: ws, uiDir: '' });
    assert.equal(captured.status, 200);
    assert.equal(captured.body!.manifestPresent, true);
    const lint = captured.body!.lint as Array<{ code: string }>;
    assert.ok(!lint.some((f) => f.code === 'manifest-absent'), 'no absent-advisory when present');
  });
});

// GH #174 Part 2: PR-incremental (non-semver) cadence fallback.
suite('TrackerRoute.api cadence (GH #174 Part 2)', () => {
  function gitRepo(ws: string, subjects: string[]): void {
    const git = (args: string[]) => execFileSync('git', args, { cwd: ws, stdio: 'ignore' });
    git(['init', '-q']);
    git(['config', 'user.email', 't@example.com']);
    git(['config', 'user.name', 'Tester']);
    git(['config', 'commit.gpgsign', 'false']);
    for (const s of subjects) git(['commit', '--allow-empty', '-q', '-m', s]);
  }

  test('no semver releases + merged-PR git history → cadence=pr-incremental with pr-<N> anchors', () => {
    const ws = tmpWorkspace();
    try {
      // CHANGELOG with ONLY an Unreleased section — no released semver versions.
      fs.writeFileSync(path.join(ws, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- wip\n');
      gitRepo(ws, [
        'feat: thing one (#1)',
        'Merge pull request #2 from acme/feat-two',
        'feat: thing three (#3)',
      ]);
      const { res, captured } = fakeResponse();
      TrackerRoute.api({} as Request, res, { workspaceRoot: ws, uiDir: '' });
      assert.equal(captured.status, 200);
      assert.equal(captured.body!.cadence, 'pr-incremental', 'falls back to PR cadence');
      const rcs = captured.body!.rcs as Array<{ id: string; state: string }>;
      assert.ok(rcs.length >= 3, 'PR anchors populate the axis (not a blank shell)');
      assert.ok(rcs.every((r) => /^pr-\d+$/.test(r.id)), 'every anchor is a pr-<N>');
      // oldest-first: pr-1 before pr-3
      assert.ok(rcs.findIndex((r) => r.id === 'pr-1') < rcs.findIndex((r) => r.id === 'pr-3'), 'ascending order preserved');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('semver releases present → cadence=semver (PR fallback does NOT hijack)', () => {
    const ws = tmpWorkspace();
    try {
      fs.writeFileSync(path.join(ws, 'CHANGELOG.md'), '# Changelog\n\n## [1.2.0] - 2026-01-01\n\n### Added\n- x\n\n## [1.1.0] - 2025-12-01\n\n- y\n');
      gitRepo(ws, ['Merge pull request #9 from acme/x']); // PRs exist, but semver wins
      const { res, captured } = fakeResponse();
      TrackerRoute.api({} as Request, res, { workspaceRoot: ws, uiDir: '' });
      assert.equal(captured.body!.cadence, 'semver', 'semver takes precedence over PRs');
      const rcs = captured.body!.rcs as Array<{ id: string }>;
      assert.ok(rcs.some((r) => r.id === 'v1.2.0'), 'semver releases on the axis');
      assert.ok(!rcs.some((r) => /^pr-/.test(r.id)), 'no PR anchors when semver releases exist');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('empty repo (no releases, no PRs) → cadence=empty, no crash', () => {
    const ws = tmpWorkspace();
    try {
      const { res, captured } = fakeResponse();
      TrackerRoute.api({} as Request, res, { workspaceRoot: ws, uiDir: '' });
      assert.equal(captured.status, 200);
      assert.equal(captured.body!.cadence, 'empty');
      assert.deepEqual(captured.body!.rcs, []);
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });
});

// A.2b (#202): governed-repo projection fallback when programs.yaml is absent.
suite('TrackerRoute.api governance projection (A.2b #202)', () => {
  function governedWorkspace(): string {
    const ws = tmpWorkspace();
    fs.writeFileSync(path.join(ws, 'CHANGELOG.md'),
      '# Changelog\n\n## [5.6.1] - 2026-06-05\n\n- shipped the tracker\n\n## [5.6.2] - 2026-06-06\n\n- ux\n');
    fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'docs', 'META_LEDGER.md'),
      '# META LEDGER\n\n### Entry #1: DELIVER - v5.6.1\n\n**Phase**: DELIVER\n**Version**: 5.6.1\n**Tag**: v5.6.1\n\n## Decision\n\nShipped v5.6.1 to both marketplaces.\n\n---\n');
    fs.writeFileSync(path.join(ws, 'docs', 'FEATURE_INDEX.md'),
      '# Feature Index\n\n| ID | Feature | Doc | Code | Test | Status | Notes |\n| --- | --- | --- | --- | --- | --- | --- |\n| FX1 | A thing | d | src/integrations/x.ts | t | verified | - |\n');
    fs.mkdirSync(path.join(ws, '.failsafe', 'governance', 'plans'), { recursive: true });
    fs.writeFileSync(path.join(ws, '.failsafe', 'governance', 'plans', 'plan-qor-a.md'),
      '# Plan: Qor A\n\n**Target Version**: v5.6.1\n'); // anchors (in CHANGELOG axis)
    fs.writeFileSync(path.join(ws, '.failsafe', 'governance', 'plans', 'plan-qor-b.md'),
      '# Plan: Qor B\n\n**Target Version**: v4.9.3\n'); // never shipped → must degrade, not abort
    return ws;
  }

  test('programs.yaml absent on a governed repo → projection populates programs/verticals/decisions, ok:true', () => {
    const ws = governedWorkspace();
    try {
      const { res, captured } = fakeResponse();
      TrackerRoute.api({} as Request, res, { workspaceRoot: ws, uiDir: '' });
      assert.equal(captured.status, 200);
      assert.equal(captured.body!.manifestPresent, false);
      assert.equal(captured.body!.manifestSource, 'projection');
      assert.equal(captured.body!.ok, true, 'dangling v4.9.3 degrades to unanchored — never an abort');
      assert.ok((captured.body!.programs as unknown[]).length >= 1, 'programs projected from plans');
      assert.ok((captured.body!.verticals as unknown[]).length >= 1, 'verticals from FEATURE_INDEX');
      const meta = captured.body!.meta as { decisions?: unknown[] };
      assert.ok((meta.decisions?.length ?? 0) >= 1, 'decisions from META_LEDGER');
      const lint = captured.body!.lint as Array<{ code: string; severity: string }>;
      assert.ok(lint.some((f) => f.code === 'manifest-projected'), 'projected advisory present');
      assert.ok(lint.some((f) => f.code === 'phase-unanchored'), 'unversioned/never-shipped plans → unanchored warn');
      assert.ok(!lint.some((f) => f.severity === 'abort'), 'no aborts');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('operator programs.yaml present → projection NOT used (operator authoritative)', () => {
    const ws = governedWorkspace();
    try {
      fs.mkdirSync(path.join(ws, 'docs', 'roadmap'), { recursive: true });
      fs.writeFileSync(path.join(ws, 'docs', 'roadmap', 'programs.yaml'), 'programs: []\nphases: []\n', 'utf-8');
      const { res, captured } = fakeResponse();
      TrackerRoute.api({} as Request, res, { workspaceRoot: ws, uiDir: '' });
      assert.equal(captured.body!.manifestPresent, true);
      assert.equal(captured.body!.manifestSource, 'operator');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });
});

// #233: the ledger read is gated by the qorlogic consumer adapter
// (readMetaLedgerArtifact) so a malformed ledger is a fail-visible condition
// instead of silently parsing to a verticals-only manifest that looks like a
// real projection (manifestSource would previously become 'projection' purely
// from the fixed CONSOLE_VERTICALS list, regardless of ledger content).
suite('TrackerRoute.api governance projection — malformed ledger (#233)', () => {
  test('META_LEDGER.md present but unparseable (no entries) → NOT reported as projection', () => {
    const ws = tmpWorkspace();
    try {
      fs.writeFileSync(path.join(ws, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- wip\n');
      fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
      // Non-empty, but no `### Entry #N:` headers → parseMetaLedgerEntries → [] → malformed.
      fs.writeFileSync(path.join(ws, 'docs', 'META_LEDGER.md'), 'not a valid governance ledger, no entries here\n');
      const { res, captured } = fakeResponse();
      TrackerRoute.api({} as Request, res, { workspaceRoot: ws, uiDir: '' });
      assert.equal(captured.status, 200, 'malformed ledger is never a hard failure');
      assert.equal(captured.body!.manifestPresent, false);
      assert.notEqual(captured.body!.manifestSource, 'projection', 'malformed ledger must not masquerade as a real projection');
      assert.equal(captured.body!.ok, true, 'advisory only, never an abort');
      const lint = captured.body!.lint as Array<{ code: string; severity: string }>;
      const advisory = lint.find((f) => f.code === 'manifest-projection-malformed');
      assert.ok(advisory, 'malformed-ledger advisory present');
      assert.equal(advisory!.severity, 'warn', 'advisory is non-blocking');
      assert.ok(!lint.some((f) => f.code === 'manifest-projected'), 'no false projected-success advisory');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('no docs/ directory at all (ledger unavailable) → plain manifest-absent advisory, not malformed', () => {
    const ws = tmpWorkspace();
    try {
      fs.writeFileSync(path.join(ws, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- wip\n');
      const { res, captured } = fakeResponse();
      TrackerRoute.api({} as Request, res, { workspaceRoot: ws, uiDir: '' });
      assert.equal(captured.status, 200);
      const lint = captured.body!.lint as Array<{ code: string }>;
      assert.ok(lint.some((f) => f.code === 'manifest-absent'), 'plain absent advisory for a missing ledger');
      assert.ok(!lint.some((f) => f.code.startsWith('manifest-projection-')), 'unavailable is not reported as malformed/unsupported');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });
});
