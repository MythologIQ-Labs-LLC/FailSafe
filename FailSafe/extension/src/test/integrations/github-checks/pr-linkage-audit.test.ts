// Functional tests for the PR↔issue linkage auditor (#154). Pure logic +
// injectable transport — NO live network. Covers the originating footgun
// (`Closes #1, #2` only closes #1), stale/nonexistent targets, referenced-but-
// -not-closed, and the disabled/no-auth no-network path.

import { strict as assert } from 'assert';
import {
  parsePrLinkage, auditPrLinkage, buildLinkageCheckRunPayload, runLinkageAudit,
  type GitHubGetFn,
} from '../../../integrations/github-checks/pr-linkage-audit';

suite('github-checks PR↔issue linkage auditor (#154)', () => {
  test('parsePrLinkage: a keyword applies to the FIRST number only — comma-listed rest are bare', () => {
    const p = parsePrLinkage('Closes #1, #2, #3');
    assert.deepEqual(p.closing, [1], 'only #1 gets the keyword');
    assert.deepEqual(p.commaListBare, [2, 3], '#2/#3 are bare (the footgun)');
    assert.deepEqual(p.referenced.sort((a, b) => a - b), [1, 2, 3]);
  });

  test('parsePrLinkage: each number with its own keyword closes; case-insensitive; all 3 keyword families', () => {
    const p = parsePrLinkage('closes #1\nFixes #2\nRESOLVED #3\nsee #4');
    assert.deepEqual(p.closing.sort((a, b) => a - b), [1, 2, 3]);
    assert.deepEqual(p.commaListBare, []);
    assert.ok(p.referenced.includes(4) && !p.closing.includes(4), '#4 referenced, not closing');
  });

  test('multi-close-no-keyword: comma list of open issues → failure (the originating bug)', () => {
    const r = auditPrLinkage({ body: 'Closes #1, #2', openIssues: [1, 2] });
    const f = r.findings.find((x) => x.kind === 'multi-close-no-keyword' && x.issue === 2);
    assert.ok(f, '#2 flagged as a silent non-close');
    assert.equal(f!.severity, 'fail');
    assert.equal(r.conclusion, 'failure');
  });

  test('closes-stale-or-missing: closing a nonexistent issue → failure', () => {
    const r = auditPrLinkage({ body: 'Closes #99', openIssues: [1], knownIssues: [1, 2, 3] });
    const f = r.findings.find((x) => x.kind === 'closes-stale-or-missing' && x.issue === 99);
    assert.ok(f, '#99 flagged (not a known issue)');
    assert.equal(r.conclusion, 'failure');
  });

  test('referenced-not-closed: an open issue referenced without a keyword → advisory neutral', () => {
    const r = auditPrLinkage({ body: 'Related to #5 — context only', openIssues: [5] });
    const f = r.findings.find((x) => x.kind === 'referenced-not-closed' && x.issue === 5);
    assert.ok(f, '#5 flagged as referenced-not-closed');
    assert.equal(f!.severity, 'warn');
    assert.equal(r.conclusion, 'neutral');
  });

  test('clean linkage → success, no findings', () => {
    const r = auditPrLinkage({ body: 'Closes #1\nFixes #2', openIssues: [1, 2], knownIssues: [1, 2] });
    assert.deepEqual(r.findings, []);
    assert.equal(r.conclusion, 'success');
  });

  test('buildLinkageCheckRunPayload: deterministic Check Run body, no secrets/content', () => {
    const r = auditPrLinkage({ body: 'Closes #1', openIssues: [1], knownIssues: [1] });
    const payload = buildLinkageCheckRunPayload('abc123', r);
    assert.equal(payload.head_sha, 'abc123');
    assert.equal(payload.status, 'completed');
    assert.equal(payload.conclusion, 'success');
    assert.ok(/linkage/i.test(payload.name));
    assert.ok(typeof payload.output.summary === 'string' && payload.output.summary.length > 0);
  });

  test('runLinkageAudit: off-by-default — no token ⇒ localOnly, injected GET never called', async () => {
    let calls = 0;
    const get: GitHubGetFn = async () => { calls += 1; return { status: 200, body: '[]' }; };
    const res = await runLinkageAudit({ get, owner: 'a', repo: 'b', prNumber: 1, headSha: 's' });
    assert.equal(res.ok, true);
    assert.equal(res.localOnly, true);
    assert.equal(calls, 0, 'no network without a token');
  });

  test('runLinkageAudit: with token ⇒ fetches PR body + open issues via injected GET, audits', async () => {
    const calls: string[] = [];
    const get: GitHubGetFn = async (url) => {
      calls.push(url);
      if (/\/pulls\/7\b/.test(url)) return { status: 200, body: JSON.stringify({ body: 'Closes #3, #4' }) };
      if (/\/issues\b/.test(url)) return { status: 200, body: JSON.stringify([{ number: 3 }, { number: 4 }]) };
      return { status: 404, body: '' };
    };
    const res = await runLinkageAudit({ token: 't', get, owner: 'a', repo: 'b', prNumber: 7, headSha: 's' });
    assert.equal(res.ok, true);
    assert.equal(res.localOnly, undefined);
    assert.equal(res.conclusion, 'failure', '#4 is a silent non-close');
    assert.ok((res.findings || []).some((f) => f.kind === 'multi-close-no-keyword' && f.issue === 4));
    assert.equal(calls.length, 2, 'PR body + open issues');
  });
});
