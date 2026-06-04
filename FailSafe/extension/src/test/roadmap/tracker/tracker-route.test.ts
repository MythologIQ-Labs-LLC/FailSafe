// Functional tests for TrackerRoute.api graceful degradation (v5.5.2 follow-up).
// A missing planning manifest (docs/roadmap/programs.yaml) must NOT 503 — the
// tracker renders the DISCOVERED layer (CHANGELOG/tags) with a non-blocking
// advisory so any workspace without a manifest still loads.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
