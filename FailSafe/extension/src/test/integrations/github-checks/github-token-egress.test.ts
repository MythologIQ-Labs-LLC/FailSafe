// #538 lane A (B265, B279, plan-538a LD11 G1-G5b): where the GitHub token
// may go. Recording transports and local servers, no live network. G1-G5b
// ran red against main: the linkage audit read from api.github.com whatever
// the base, the default transports dropped the port (and always used TLS),
// a 3xx was parsed as data, and an http or query-carrying base was accepted.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { AddressInfo } from 'net';
import {
  createPullRequest, defaultGitHubGet, defaultGitHubPost, githubRequestOptions, publishCheckRunPayload,
  type GitHubGetFn, type GitHubPostFn, type GitContext,
} from '../../../integrations/github-checks/github-checks-client';
import { apiBaseFor, githubAuthHeaders } from '../../../integrations/github-checks/github-host-affinity';
import { runLinkageAudit } from '../../../integrations/github-checks/pr-linkage-audit';
import { publishLinkageCheck } from '../../../integrations/github-checks/pr-linkage-publish';
import { buildManualAdvisoryPayload } from '../../../integrations/github-checks/github-checks-map';
import { IntegrationCredentials } from '../../../integrations/credentials/IntegrationCredentials';
import {
  endpointRefusalMessage, governedCommitConnection, type EndpointReader, type EndpointScope,
} from '../../../integrations/credentials/credentialGates';
import { governedCommitPrStep, runGovernedCommitFlow } from '../../../extension/governedCommitFlow';
import type { GitRunner } from '../../../extension/governedCommit';
import { FakeInspector, FakeSecretStore, RecordingLogger } from '../credentials/fakes';
import { productionSources, SRC_ROOT } from './source-scan';

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
    assert.equal(r.sent.filter((s) => new URL(s.url).hostname === 'api.github.com').length, 0);
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

class FakeEndpoints implements EndpointReader {
  readonly values = new Map<string, { value?: string; scope: EndpointScope }>();
  endpoint(settingKey: string) { return this.values.get(settingKey) ?? { scope: 'default' as EndpointScope }; }
}

class RecordingUi {
  readonly warnings: string[] = [];
  warn(message: string): PromiseLike<string | undefined> { this.warnings.push(message); return Promise.resolve(undefined); }
}

async function credentials(token?: string, endpoint?: { value: string; scope: EndpointScope }) {
  const creds = new IntegrationCredentials(new FakeSecretStore(), new FakeInspector(), new RecordingLogger());
  await creds.init();
  if (token) await creds.set('github.token', 'user', token);
  const endpoints = new FakeEndpoints();
  if (endpoint) endpoints.values.set('failsafe.integrations.github.apiBaseUrl', endpoint);
  return { creds, endpoints, ui: new RecordingUi() };
}

const fakeGit: GitRunner = async (a) => {
  if (a[0] === 'rev-parse' && a.includes('--is-inside-work-tree')) return { code: 0, stdout: 'true', stderr: '' };
  if (a[0] === 'rev-parse') return { code: 0, stdout: 'abc1234', stderr: '' };
  if (a[0] === 'status') return { code: 0, stdout: ' M .gitignore\n', stderr: '' };
  if (a[0] === 'remote') return { code: 0, stdout: 'https://ghe.example/o/r.git', stderr: '' };
  return { code: 0, stdout: '', stderr: '' };
};

suite('#538 GitHub token host affinity: new seams (B265, B279)', () => {
  test('G3b request options keep the port, strip IPv6 brackets, guard loopback http and refuse network http', () => {
    const https443 = githubRequestOptions('https://ghe.example:8443/api/v3/x', 'GET', {});
    assert.ok(https443);
    assert.equal(https443.protocol, 'https:');
    assert.equal(https443.options.port, 8443);
    assert.equal(https443.options.hostname, 'ghe.example');
    assert.equal(https443.options.path, '/api/v3/x');
    const v6 = githubRequestOptions('http://[::1]:9443/x', 'POST', {});
    assert.ok(v6);
    assert.equal(v6.protocol, 'http:');
    assert.equal(v6.options.hostname, '::1');
    assert.equal(typeof v6.options.lookup, 'function', 'loopback http resolves through the loopback guard');
    assert.equal(githubRequestOptions('http://ghe.example/x', 'GET', {}), undefined);
    assert.equal(githubRequestOptions('ftp://ghe.example/x', 'GET', {}), undefined);
  });

  test('G10 a connection reset mid-body settles the promise (rejects) and raises no unhandled error', async () => {
    const server = await localServer((_q, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1000' });
      res.write('{"partial":');
      setTimeout(() => res.socket?.destroy(), 50);
    });
    try {
      const settled = defaultGitHubGet(`http://127.0.0.1:${server.port}/api/v3/repos/acme/widgets`, {}).then(() => 'resolved', () => 'rejected');
      const timeout = new Promise((r) => setTimeout(() => r('hung'), 3000));
      assert.equal(await Promise.race([settled, timeout]), 'rejected');
    } finally {
      await server.close();
    }
  });

  test('G13 the 8-second deadline covers the whole request: a server that keeps trickling bytes is cut off', async function () {
    this.timeout(14000);
    const timers: NodeJS.Timeout[] = [];
    const server = await localServer((_q, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const t = setInterval(() => { if (!res.writableEnded) res.write(' '); }, 100);
      timers.push(t);
      res.on('close', () => clearInterval(t));
    });
    const started = Date.now();
    try {
      await assert.rejects(defaultGitHubGet(`http://127.0.0.1:${server.port}/x`, {}), /timeout/);
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 9500, `the call ran ${elapsed} ms against an 8000 ms deadline`);
    } finally {
      timers.forEach(clearInterval);
      await server.close();
    }
  });

  test('G11 the transports never use a pooled agent', () => {
    assert.equal(githubRequestOptions('http://127.0.0.1:9443/x', 'GET', {})?.options.agent, false);
    assert.equal(githubRequestOptions('https://ghe.example/x', 'GET', {})?.options.agent, false);
  });

  test('G12 a response over the cap is aborted', async () => {
    const server = await localServer((_q, res) => { res.end(Buffer.alloc(17 * 1024 * 1024, 0x61)); });
    try {
      await assert.rejects(defaultGitHubGet(`http://127.0.0.1:${server.port}/x`, {}), /too large/);
    } finally {
      await server.close();
    }
  });

  test('G6 the Authorization header is attached only for the base origin (host, scheme and port)', () => {
    const api = apiBaseFor('https://ghe.example/api/v3');
    assert.ok(api.ok);
    const extra = { Accept: 'application/vnd.github+json' };
    assert.deepEqual(githubAuthHeaders(api.base, 'https://ghe.example/api/v3/repos/o/r/pulls', TOKEN, extra), { ...extra, Authorization: `token ${TOKEN}` });
    assert.deepEqual(githubAuthHeaders(api.base, 'https://GHE.example:443/x', TOKEN, extra)?.Authorization, `token ${TOKEN}`);
    for (const other of ['https://api.github.com/repos/o/r', 'http://ghe.example/api/v3/x', 'https://ghe.example:8443/api/v3/x', 'https://ghe.example.evil/x', 'not a url']) {
      assert.equal(githubAuthHeaders(api.base, other, TOKEN, extra), undefined, other);
    }
    const dflt = apiBaseFor(undefined);
    assert.ok(dflt.ok);
    assert.equal(dflt.base.origin, 'https://api.github.com');
  });

  test('G7 governedCommitConnection keeps the workspace-endpoint refusal and stays silent without a token', async () => {
    const refused = await credentials(TOKEN, { value: 'https://ghe.evil/api/v3', scope: 'workspace' });
    assert.equal(governedCommitConnection(refused.creds, refused.endpoints, refused.ui), undefined);
    assert.deepEqual(refused.ui.warnings, [endpointRefusalMessage('GitHub')]);

    const none = await credentials();
    assert.equal(governedCommitConnection(none.creds, none.endpoints, none.ui), undefined);
    assert.deepEqual(none.ui.warnings, [], 'no token: no warning');

    const paired = await credentials(TOKEN, { value: GHE, scope: 'user' });
    assert.deepEqual(governedCommitConnection(paired.creds, paired.endpoints, paired.ui), { credential: TOKEN, endpoint: GHE });
  });

  test('G8 only github-host-affinity.ts builds a GitHub token Authorization header (tests excluded)', () => {
    const files = productionSources();
    assert.ok(files.length > 100, 'scan saw the production tree');
    const builders = files
      .filter((f) => /Authorization['"]?\s*:\s*`token \$\{/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC_ROOT, f).split(path.sep).join('/'));
    assert.deepEqual(builders, ['integrations/github-checks/github-host-affinity.ts']);
  });

  test('G9 the production option helper sends the governed-commit PR to the endpoint paired with the token', async () => {
    const run = async (endpoint?: { value: string; scope: EndpointScope }) => {
      const x = await credentials(TOKEN, endpoint);
      const r = recorder();
      const result = await runGovernedCommitFlow('organize', ['.gitignore'], ['x'], {
        workspaceRoot: '/ws', git: fakeGit, confirm: async () => true, recordDeclined: async () => {}, now: () => '2026-10-18T00:00:00Z',
        ...governedCommitPrStep(governedCommitConnection(x.creds, x.endpoints, x.ui), r.post),
      });
      return { step: (result as { step: string }).step, sent: r.sent };
    };
    const ghe = await run({ value: GHE, scope: 'user' });
    assert.equal(ghe.step, 'pr');
    assert.deepEqual(ghe.sent.map((s) => [s.method, s.url, s.auth]), [['POST', `${GHE}/repos/o/r/pulls`, `token ${TOKEN}`]]);
    const dflt = await run();
    assert.deepEqual(dflt.sent.map((s) => s.url), ['https://api.github.com/repos/o/r/pulls']);
  });

  test('S9 a refused base is an error result, and the governed commit reports it as a pushed branch with that warning', async () => {
    const r = recorder();
    const result = await runGovernedCommitFlow('organize', ['.gitignore'], ['x'], {
      workspaceRoot: '/ws', git: fakeGit, confirm: async () => true, recordDeclined: async () => {}, now: () => '2026-10-18T00:00:00Z',
      post: r.post, token: TOKEN, apiBaseUrl: 'http://ghe.example/api/v3',
    }) as { step: string; warning?: string };
    assert.equal(r.sent.length, 0);
    assert.equal(result.step, 'pushed');
    assert.match(result.warning ?? '', /https:\/\//);
  });
});
