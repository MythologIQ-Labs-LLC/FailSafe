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
