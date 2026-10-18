// #538 lane A (B265, B279, plan-538a LD11 G1-G5b): where the GitHub token
// may go. Recording transports and local servers, no live network. G1-G5b
// ran red against main: the linkage audit read from api.github.com whatever
// the base, the default transports dropped the port (and always used TLS),
// a 3xx was parsed as data, and an http or query-carrying base was accepted.

import { strict as assert } from 'assert';
import * as http from 'http';
import type { AddressInfo } from 'net';
import {
  createPullRequest, defaultGitHubGet, defaultGitHubPost, publishCheckRunPayload,
  type GitHubGetFn, type GitHubPostFn, type GitContext,
} from '../../../integrations/github-checks/github-checks-client';
import { runLinkageAudit } from '../../../integrations/github-checks/pr-linkage-audit';
import { publishLinkageCheck } from '../../../integrations/github-checks/pr-linkage-publish';
import { buildManualAdvisoryPayload } from '../../../integrations/github-checks/github-checks-map';

const TOKEN = 'ghs_LANE_A_TOKEN';
const GHE = 'https://ghe.example/api/v3';
const CTX: GitContext = { remoteUrl: 'https://ghe.example/acme/widgets.git', headSha: 'abc123' };

interface Sent { method: 'GET' | 'POST'; url: string; auth?: string }

function recorder(prStatus = 200) {
  const sent: Sent[] = [];
  const get: GitHubGetFn = async (url, headers) => {
    sent.push({ method: 'GET', url, auth: headers.Authorization });
    if (/\/pulls\/\d+$/.test(url)) return { status: prStatus, body: prStatus === 200 ? JSON.stringify({ body: 'Closes #1' }) : '' };
    return { status: 200, body: JSON.stringify([{ number: 1, state: 'open' }]) };
  };
  const post: GitHubPostFn = async (url, headers) => {
    sent.push({ method: 'POST', url, auth: headers.Authorization });
    return { status: 201, body: JSON.stringify({ id: 42, html_url: 'https://ghe.example/acme/widgets/pull/9', number: 9 }) };
  };
  return { sent, get, post };
}

interface LocalServer { port: number; hits: Array<{ method: string; url: string; auth?: string }>; close(): Promise<void> }

function localServer(respond: (req: http.IncomingMessage, res: http.ServerResponse) => void = (_q, r) => { r.end('{}'); }): Promise<LocalServer> {
  const hits: LocalServer['hits'] = [];
  const server = http.createServer((req, res) => {
    hits.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization });
    req.resume();
    req.on('end', () => respond(req, res));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: (server.address() as AddressInfo).port, hits,
    close: () => new Promise<void>((done) => server.close(() => done())),
  })));
}

suite('#538 GitHub token host affinity (B265, B279)', () => {
  test('G1 with a GHE base, the linkage check reads and publishes on the GHE origin only, token on each', async () => {
    const r = recorder();
    const res = await publishLinkageCheck({
      ctx: CTX, opts: { enabled: true, token: TOKEN, apiBaseUrl: GHE }, owner: 'acme', repo: 'widgets', prNumber: 9, get: r.get, post: r.post,
    });
    assert.equal(res.ok, true);
    assert.deepEqual(r.sent.map((s) => `${s.method} ${new URL(s.url).origin}`), [
      'GET https://ghe.example', 'GET https://ghe.example', 'POST https://ghe.example',
    ]);
    assert.ok(r.sent.every((s) => s.auth === `token ${TOKEN}`), 'the token rides every request');
    assert.equal(r.sent.filter((s) => s.url.includes('api.github.com')).length, 0);
  });

  test('G2 runLinkageAudit takes the API base', async () => {
    const r = recorder();
    // Passed through a variable: main's LinkageRunOptions has no apiBaseUrl.
    const opts = { get: r.get, owner: 'acme', repo: 'widgets', prNumber: 9, headSha: 'abc123', token: TOKEN, enabled: true, apiBaseUrl: GHE };
    const res = await runLinkageAudit(opts);
    assert.equal(res.ok, true);
    assert.deepEqual(r.sent.map((s) => s.url), [
      `${GHE}/repos/acme/widgets/pulls/9`,
      `${GHE}/repos/acme/widgets/issues?state=all&per_page=100&page=1`,
    ]);
  });

  test('G2b with no base, the linkage check still uses api.github.com, token on each', async () => {
    const r = recorder();
    const res = await publishLinkageCheck({
      ctx: { remoteUrl: 'https://github.com/acme/widgets', headSha: 'abc123' },
      opts: { enabled: true, token: TOKEN }, owner: 'acme', repo: 'widgets', prNumber: 9, get: r.get, post: r.post,
    });
    assert.equal(res.ok, true);
    assert.deepEqual(r.sent.map((s) => `${s.method} ${new URL(s.url).origin}`), [
      'GET https://api.github.com', 'GET https://api.github.com', 'POST https://api.github.com',
    ]);
    assert.ok(r.sent.every((s) => s.auth === `token ${TOKEN}`));
  });

  test('G3 the default transports keep the base URL port', async () => {
    const server = await localServer();
    try {
      const g = await defaultGitHubGet(`http://127.0.0.1:${server.port}/api/v3/repos/acme/widgets`, { Accept: 'application/json' });
      const p = await defaultGitHubPost(`http://127.0.0.1:${server.port}/api/v3/repos/acme/widgets/pulls`, { Accept: 'application/json' }, '{}');
      assert.equal(g.status, 200);
      assert.equal(p.status, 200);
      assert.deepEqual(server.hits.map((h) => `${h.method} ${h.url}`), [
        'GET /api/v3/repos/acme/widgets', 'POST /api/v3/repos/acme/widgets/pulls',
      ]);
    } finally {
      await server.close();
    }
  });

  test('G4 a 3xx from GitHub fails the linkage audit and nothing further is requested', async () => {
    const r = recorder(302);
    const opts = { get: r.get, owner: 'acme', repo: 'widgets', prNumber: 9, headSha: 'abc123', token: TOKEN, enabled: true, apiBaseUrl: GHE };
    const res = await runLinkageAudit(opts);
    assert.equal(res.ok, false);
    assert.equal(r.sent.length, 1);
  });

  test('G4b the default GET transport returns a 3xx and never follows it', async () => {
    const second = await localServer();
    const first = await localServer((_q, res) => {
      res.statusCode = 302;
      res.setHeader('Location', `http://127.0.0.1:${second.port}/stolen`);
      res.end();
    });
    try {
      const res = await defaultGitHubGet(`http://127.0.0.1:${first.port}/api/v3/repos/acme/widgets/pulls/9`, { Authorization: `token ${TOKEN}` });
      assert.equal(res.status, 302);
      assert.equal(first.hits.length, 1);
      assert.equal(second.hits.length, 0, 'the redirect target received a request');
    } finally {
      await first.close();
      await second.close();
    }
  });

  test('G5 an http base on a network host is refused before any send, with an https hint', async () => {
    const r = recorder();
    const base = 'http://ghe.example/api/v3';
    const advisory = await publishCheckRunPayload(buildManualAdvisoryPayload('abc123'), CTX, { enabled: true, token: TOKEN, apiBaseUrl: base }, r.post);
    const pr = await createPullRequest({ token: TOKEN, apiBaseUrl: base, remoteUrl: CTX.remoteUrl, head: 'fix/x', base: 'main', title: 't', body: 'b' }, r.post);
    assert.equal(r.sent.length, 0);
    assert.equal(advisory.ok, false);
    assert.equal(pr.ok, false);
    assert.equal(pr.localOnly, undefined, 'a refused base is an error, not a local-only skip');
    assert.match(pr.error ?? '', /https:\/\//);
  });

  test('G5b a base carrying a query string or fragment is refused before any send', async () => {
    const r = recorder();
    for (const base of [`${GHE}?x=1`, `${GHE}#f`]) {
      const advisory = await publishCheckRunPayload(buildManualAdvisoryPayload('abc123'), CTX, { enabled: true, token: TOKEN, apiBaseUrl: base }, r.post);
      const pr = await createPullRequest({ token: TOKEN, apiBaseUrl: base, remoteUrl: CTX.remoteUrl, head: 'fix/x', base: 'main', title: 't', body: 'b' }, r.post);
      assert.equal(advisory.ok, false, base);
      assert.equal(pr.ok, false, base);
    }
    assert.equal(r.sent.length, 0);
  });
});
