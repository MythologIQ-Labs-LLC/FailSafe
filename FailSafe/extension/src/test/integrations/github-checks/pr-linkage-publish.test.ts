// Functional tests for the #154 live-wiring: the generic `publishCheckRunPayload`
// (extracted from publishCheckRun) + the `publishLinkageCheck` bridge. Injected
// GET/POST transports — NO live network.

import { strict as assert } from 'assert';
import {
  publishCheckRunPayload, type GitHubPostFn, type GitHubGetFn, type GitContext, type PublishOptions,
} from '../../../integrations/github-checks/github-checks-client';
import type { CheckRunPayload } from '../../../integrations/github-checks/github-checks-map';
import { publishLinkageCheck } from '../../../integrations/github-checks/pr-linkage-publish';

const CTX: GitContext = { remoteUrl: 'https://github.com/acme/widgets', headSha: 'abc123' };
const OPTS: PublishOptions = { enabled: true, token: 't' };
const PAYLOAD: CheckRunPayload = {
  name: 'FailSafe: PR Linkage', head_sha: 'abc123', status: 'completed', conclusion: 'failure',
  output: { title: 'PR linkage: gaps', summary: '- #2 …' },
};

suite('github-checks publishCheckRunPayload (generic publish, #154)', () => {
  test('disabled / no token / fork ⇒ localOnly, POST never called', async () => {
    let calls = 0;
    const post: GitHubPostFn = async () => { calls += 1; return { status: 201, body: '{}' }; };
    assert.equal((await publishCheckRunPayload(PAYLOAD, CTX, { enabled: false, token: 't' }, post)).localOnly, true);
    assert.equal((await publishCheckRunPayload(PAYLOAD, CTX, { enabled: true }, post)).localOnly, true);
    assert.equal((await publishCheckRunPayload(PAYLOAD, { ...CTX, isFork: true }, OPTS, post)).localOnly, true);
    assert.equal(calls, 0, 'no network on any guard');
  });

  test('success ⇒ posts the payload to the check-runs endpoint, returns the check id', async () => {
    let seen: { url: string; body: string } | null = null;
    const post: GitHubPostFn = async (url, headers, body) => {
      seen = { url, body };
      assert.equal(headers.Authorization, 'token t', 'token only in the header');
      return { status: 201, body: JSON.stringify({ id: 9001 }) };
    };
    const res = await publishCheckRunPayload(PAYLOAD, CTX, OPTS, post);
    assert.equal(res.ok, true);
    assert.equal(res.checkRunId, 9001);
    assert.ok(/\/repos\/acme\/widgets\/check-runs$/.test(seen!.url));
    assert.ok(seen!.body.includes('PR Linkage'), 'posts the linkage payload verbatim');
  });

  test('401 ⇒ auth failure surfaced (token never echoed)', async () => {
    const post: GitHubPostFn = async () => ({ status: 401, body: 'bad creds' });
    const res = await publishCheckRunPayload(PAYLOAD, CTX, OPTS, post);
    assert.equal(res.ok, false);
    assert.equal(res.status, 401);
    assert.ok(!/token t\b/.test(res.error || ''), 'no token in the error');
  });
});

suite('github-checks publishLinkageCheck (#154 live bridge)', () => {
  const okPost: GitHubPostFn = async () => ({ status: 201, body: JSON.stringify({ id: 7 }) });

  test('disabled ⇒ localOnly, neither GET nor POST called', async () => {
    let g = 0; let p = 0;
    const get: GitHubGetFn = async () => { g += 1; return { status: 200, body: '[]' }; };
    const post: GitHubPostFn = async () => { p += 1; return { status: 201, body: '{}' }; };
    const res = await publishLinkageCheck({ ctx: CTX, opts: { enabled: false }, owner: 'a', repo: 'b', prNumber: 1, get, post });
    assert.equal(res.localOnly, true);
    assert.equal(g + p, 0);
  });

  test('enabled ⇒ audits the PR + publishes the linkage Check Run (the footgun → failure)', async () => {
    const get: GitHubGetFn = async (url) => {
      if (/\/pulls\/7\b/.test(url)) return { status: 200, body: JSON.stringify({ body: 'Closes #3, #4' }) };
      if (/\/issues\b/.test(url)) return { status: 200, body: JSON.stringify([{ number: 3, state: 'open' }, { number: 4, state: 'open' }]) };
      return { status: 404, body: '' };
    };
    let posted = '';
    const post: GitHubPostFn = async (_u, _h, body) => { posted = body; return { status: 201, body: JSON.stringify({ id: 42 }) }; };
    const res = await publishLinkageCheck({ ctx: CTX, opts: OPTS, owner: 'a', repo: 'b', prNumber: 7, get, post });
    assert.equal(res.ok, true);
    assert.equal(res.checkRunId, 42);
    assert.ok(/"conclusion":"failure"/.test(posted), '#4 silent non-close → failure');
    assert.ok(/PR Linkage/.test(posted));
  });

  test('clean PR ⇒ publishes a success Check Run', async () => {
    const get: GitHubGetFn = async (url) =>
      /\/pulls\//.test(url) ? { status: 200, body: JSON.stringify({ body: 'Closes #3' }) }
        : { status: 200, body: JSON.stringify([{ number: 3, state: 'open' }]) };
    let posted = '';
    const post: GitHubPostFn = async (_u, _h, body) => { posted = body; return { status: 201, body: JSON.stringify({ id: 1 }) }; };
    const res = await publishLinkageCheck({ ctx: CTX, opts: OPTS, owner: 'a', repo: 'b', prNumber: 3, get, post });
    assert.equal(res.ok, true);
    assert.ok(/"conclusion":"success"/.test(posted));
  });

  test('audit fetch failure ⇒ ok:false, no throw', async () => {
    const get: GitHubGetFn = async () => ({ status: 500, body: '' });
    const res = await publishLinkageCheck({ ctx: CTX, opts: OPTS, owner: 'a', repo: 'b', prNumber: 7, get, post: okPost });
    assert.equal(res.ok, false);
    assert.ok(res.error && res.error.length > 0);
  });
});
