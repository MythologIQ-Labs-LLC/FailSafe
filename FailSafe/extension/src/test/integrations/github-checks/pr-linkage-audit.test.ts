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

  test('runLinkageAudit: with token ⇒ fetches PR body + issue set via injected GET, audits', async () => {
    const calls: string[] = [];
    const get: GitHubGetFn = async (url) => {
      calls.push(url);
      if (/\/pulls\/7\b/.test(url)) return { status: 200, body: JSON.stringify({ body: 'Closes #3, #4' }) };
      if (/\/issues\b/.test(url)) return { status: 200, body: JSON.stringify([{ number: 3, state: 'open' }, { number: 4, state: 'open' }]) };
      return { status: 404, body: '' };
    };
    const res = await runLinkageAudit({ token: 't', get, owner: 'a', repo: 'b', prNumber: 7, headSha: 's' });
    assert.equal(res.ok, true);
    assert.equal(res.localOnly, undefined);
    assert.equal(res.conclusion, 'failure', '#4 is a silent non-close');
    assert.ok((res.findings || []).some((f) => f.kind === 'multi-close-no-keyword' && f.issue === 4));
    assert.equal(calls.length, 2, 'PR body + issue set');
  });

  // #241 F-7: the live path never populated `knownIssues`, so a closing
  // reference to an issue number that never existed silently fell through to
  // the SAME "not currently open (already closed)" warn as a genuinely
  // already-closed known issue — understating severity (warn vs fail) and
  // misstating the reason (nonexistent vs closed).
  test('runLinkageAudit: closing a NONEXISTENT issue ⇒ fail via live knownIssues, not silently downgraded to warn (F-7)', async () => {
    const get: GitHubGetFn = async (url) => {
      if (/\/pulls\/8\b/.test(url)) return { status: 200, body: JSON.stringify({ body: 'Closes #999' }) };
      if (/\/issues\b/.test(url)) {
        return { status: 200, body: JSON.stringify([{ number: 1, state: 'open' }, { number: 2, state: 'closed' }]) };
      }
      return { status: 404, body: '' };
    };
    const res = await runLinkageAudit({ token: 't', get, owner: 'a', repo: 'b', prNumber: 8, headSha: 's' });
    assert.equal(res.ok, true);
    const f = (res.findings || []).find((x) => x.kind === 'closes-stale-or-missing' && x.issue === 999);
    assert.ok(f, '#999 must be flagged');
    assert.equal(f!.severity, 'fail', 'a nonexistent issue must be fail severity, not downgraded to warn');
    assert.ok(/does not exist in this repo \(never existed, deleted, or transferred away\)/.test(f!.detail),
      'detail must say nonexistent with the three-cause explanation (#374), not "already closed"');
    assert.equal(res.conclusion, 'failure');
  });

  // Distinct disposition: a real, known, but CLOSED issue stays a warn — the
  // fix must not turn every closing reference into a hard failure.
  test('runLinkageAudit: closing an already-closed KNOWN issue ⇒ warn, distinct from nonexistent (F-7)', async () => {
    const get: GitHubGetFn = async (url) => {
      if (/\/pulls\/8\b/.test(url)) return { status: 200, body: JSON.stringify({ body: 'Closes #2' }) };
      if (/\/issues\b/.test(url)) {
        return { status: 200, body: JSON.stringify([{ number: 1, state: 'open' }, { number: 2, state: 'closed' }]) };
      }
      return { status: 404, body: '' };
    };
    const res = await runLinkageAudit({ token: 't', get, owner: 'a', repo: 'b', prNumber: 8, headSha: 's' });
    assert.equal(res.ok, true);
    const f = (res.findings || []).find((x) => x.kind === 'closes-stale-or-missing' && x.issue === 2);
    assert.ok(f, '#2 must be flagged');
    assert.equal(f!.severity, 'warn', 'a known-but-closed issue stays warn, not fail');
    assert.ok(/already closed/.test(f!.detail));
    assert.equal(res.conclusion, 'neutral');
  });
});

// #241 Tranche C D-3 (FX914): pagination + truncation disclosure.
suite('runLinkageAudit pagination (FX914/#241C)', () => {
  function pagedGet(pages: Array<Array<{ number: number }>>, prBody: string) {
    return async (url: string) => {
      if (url.includes('/pulls/')) return { status: 200, body: JSON.stringify({ body: prBody }) };
      const m = url.match(/[?&]page=([0-9]+)/);
      const page = m ? Number(m[1]) : 1;
      return { status: 200, body: JSON.stringify(pages[page - 1] ?? []) };
    };
  }

  test('T7: an open issue on page 2 is recognized (no false already-closed finding)', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ number: i + 1, state: 'open' }));
    const page2 = [{ number: 555, state: 'open' }];
    const r = await runLinkageAudit({
      enabled: true, token: 't', owner: 'o', repo: 'r', prNumber: 9,
      get: pagedGet([page1, page2], 'Closes #555'),
    } as any);
    assert.equal(r.ok, true);
    const findings = (r as any).audit?.findings ?? [];
    assert.ok(
      !findings.some((f: any) => f.kind === 'closes-stale-or-missing'),
      'issue #555 is open on page 2 — must not be reported stale/closed',
    );
  });

  test('T8: ten full pages -> truncation disclosure finding appended', async () => {
    const full = (start: number) => Array.from({ length: 100 }, (_, i) => ({ number: start + i, state: 'open' }));
    const pages = Array.from({ length: 10 }, (_, p) => full(p * 100 + 1));
    const r = await runLinkageAudit({
      enabled: true, token: 't', owner: 'o', repo: 'r', prNumber: 9,
      get: pagedGet(pages, 'Closes #1'),
    } as any);
    assert.equal(r.ok, true);
    const findings = (r as any).audit?.findings ?? [];
    assert.ok(
      findings.some((f: any) => f.kind === 'truncated-issue-list'),
      'a full 10th page must disclose truncation in the findings',
    );
  });
});

// ── #374: signal quality — accurate fail details + truncation false-fail guard
suite('#374 linkage signal quality', () => {
  test('unit: closing a PR number (in knownPrs) fails with the pull-request detail, not "does not exist"', () => {
    const r = auditPrLinkage({
      body: 'Closes #366', openIssues: [1], knownIssues: [1, 2], knownPrs: [366], selfPr: 400,
    });
    const f = r.findings.find((x) => x.kind === 'closes-stale-or-missing' && x.issue === 366);
    assert.ok(f, '#366 must be flagged');
    assert.equal(f!.severity, 'fail');
    assert.match(f!.detail, /is a pull request — closing keywords only act on issues/);
    assert.doesNotMatch(f!.detail, /does not exist/);
  });

  test('unit: truncated window demotes missing-from-known to WARN (never fail on unverifiable existence)', () => {
    const r = auditPrLinkage({
      body: 'Closes #12', openIssues: [1], knownIssues: [1, 2], truncated: true, selfPr: 400,
    });
    const f = r.findings.find((x) => x.kind === 'closes-stale-or-missing' && x.issue === 12);
    assert.ok(f);
    assert.equal(f!.severity, 'warn', 'outside-the-window references must not produce false fails');
    assert.match(f!.detail, /outside the fetched issue window/);
    assert.equal(r.conclusion, 'neutral');
  });

  test('unit: untruncated missing reference keeps fail with the three-cause detail', () => {
    const r = auditPrLinkage({
      body: 'Closes #12', openIssues: [1], knownIssues: [1, 2], truncated: false, selfPr: 400,
    });
    const f = r.findings.find((x) => x.issue === 12);
    assert.equal(f!.severity, 'fail');
    assert.match(f!.detail, /never existed, deleted, or transferred away/);
  });

  test('unit: known === null keeps the pure-caller contract (fail branch unreachable)', () => {
    const r = auditPrLinkage({ body: 'Closes #12', openIssues: [1], knownPrs: [12], selfPr: 400 });
    const f = r.findings.find((x) => x.kind === 'closes-stale-or-missing' && x.issue === 12);
    assert.ok(f, 'still flagged via the open-set warn path');
    assert.equal(f!.severity, 'warn', 'without knownIssues no fail branch may fire (pre-#366 contract)');
  });

  test('publish path: a pull_request page item populates knownPrs end-to-end', async () => {
    const get: GitHubGetFn = async (url) => {
      if (/\/pulls\/8\b/.test(url)) return { status: 200, body: JSON.stringify({ body: 'Closes #5' }) };
      if (/\/issues\b/.test(url)) {
        return { status: 200, body: JSON.stringify([
          { number: 1, state: 'open' },
          { number: 5, state: 'closed', pull_request: {} },
        ]) };
      }
      return { status: 404, body: '' };
    };
    const res = await runLinkageAudit({ token: 't', get, owner: 'a', repo: 'b', prNumber: 8, headSha: 's' });
    const f = (res.findings || []).find((x) => x.issue === 5);
    assert.ok(f, '#5 must be flagged');
    assert.equal(f!.severity, 'fail');
    assert.match(f!.detail, /is a pull request/);
  });

  test('publish path: Closes #<selfPr> gets the accurate pull-request detail (audit F3 bonus pin)', async () => {
    const get: GitHubGetFn = async (url) => {
      if (/\/pulls\/8\b/.test(url)) return { status: 200, body: JSON.stringify({ body: 'Closes #8' }) };
      if (/\/issues\b/.test(url)) {
        return { status: 200, body: JSON.stringify([
          { number: 1, state: 'open' },
          { number: 8, state: 'open', pull_request: {} },
        ]) };
      }
      return { status: 404, body: '' };
    };
    const res = await runLinkageAudit({ token: 't', get, owner: 'a', repo: 'b', prNumber: 8, headSha: 's' });
    const f = (res.findings || []).find((x) => x.issue === 8);
    assert.ok(f, 'a self-close reference must be flagged');
    assert.match(f!.detail, /is a pull request/, 'not the false "does not exist" of pre-#374');
  });
});
