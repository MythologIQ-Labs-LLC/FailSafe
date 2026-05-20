// FX532 — Phase 4 of plan-qor-bicameral-cluster-high (B-INT-3 + upstream awareness).
// UpstreamMonitor.poll() behavior: builds snapshot from GitHub release + issues
// endpoints; surfaces errors as snapshot.error without throwing; regex-allowlist
// fail-closed; dispose clears interval.
import { strict as assert } from 'assert';
import { UpstreamMonitor, UpstreamMonitorDeps } from '../../../integrations/bicameral/UpstreamMonitor';

interface FetchCall {
  url: string;
}

function makeMonitor(opts: {
  responses?: Array<{ ok: boolean; status: number; body?: unknown }>;
  repo?: string;
}): { monitor: UpstreamMonitor; calls: FetchCall[]; warns: Array<{ msg: string; data: unknown }> } {
  const calls: FetchCall[] = [];
  const warns: Array<{ msg: string; data: unknown }> = [];
  const responses = opts.responses ?? [];
  const httpFetch = (async (input: string): Promise<Response> => {
    calls.push({ url: input });
    const r = responses.shift() ?? { ok: true, status: 200, body: {} };
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.body,
    } as Response;
  }) as typeof fetch;
  const configProvider: UpstreamMonitorDeps['configProvider'] = {
    getNumber: () => 86_400_000,
    getString: (_k, dflt) => opts.repo ?? dflt,
  };
  const logger = {
    warn: (msg: string, data?: unknown) => { warns.push({ msg, data }); },
    info: () => undefined, error: () => undefined, debug: () => undefined,
  } as unknown as UpstreamMonitorDeps['logger'];
  return {
    monitor: new UpstreamMonitor({ httpFetch, configProvider, logger }),
    calls,
    warns,
  };
}

suite('UpstreamMonitor (FX532 — Phase 4 upstream awareness)', () => {
  test('happy-path 200 response builds populated snapshot', async () => {
    const { monitor, calls } = makeMonitor({
      responses: [
        { ok: true, status: 200, body: { tag_name: 'v0.15.2', published_at: '2026-04-01T00:00:00Z' } },
        { ok: true, status: 200, body: { total_count: 7 } },
      ],
    });
    monitor.start();
    monitor.dispose(); // stop the interval; we only assert on the initial poll
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r)); // 2 ticks: fetch resolves, then await chain
    const snap = monitor.getSnapshot();
    assert.ok(snap, 'snapshot should exist after initial poll');
    assert.equal(snap.latestVersion, '0.15.2', 'v-prefix stripped');
    assert.equal(snap.latestReleasedAt, '2026-04-01T00:00:00Z');
    assert.equal(snap.openIssueCount, 7);
    assert.equal(snap.error, undefined);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes('/releases/latest'));
    assert.ok(calls[1].url.includes('/search/issues'));
  });

  test('release endpoint non-2xx surfaces error snapshot (no throw)', async () => {
    const { monitor, warns } = makeMonitor({
      responses: [
        { ok: false, status: 404, body: {} },
        { ok: true, status: 200, body: { total_count: 1 } },
      ],
    });
    monitor.start();
    monitor.dispose();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const snap = monitor.getSnapshot();
    assert.ok(snap, 'snapshot should exist (error variant)');
    assert.equal(snap.latestVersion, null);
    assert.match(snap.error ?? '', /404/);
    assert.equal(warns.length, 1);
  });

  test('issues endpoint non-2xx also surfaces error snapshot', async () => {
    const { monitor } = makeMonitor({
      responses: [
        { ok: true, status: 200, body: { tag_name: '0.15.0' } },
        { ok: false, status: 503, body: {} },
      ],
    });
    monitor.start();
    monitor.dispose();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const snap = monitor.getSnapshot();
    assert.ok(snap);
    assert.match(snap.error ?? '', /503/);
  });

  test('malformed JSON returns error snapshot without throwing', async () => {
    const httpFetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new Error('json-parse-failed'); },
    } as unknown as Response)) as typeof fetch;
    const warns: Array<{ msg: string; data: unknown }> = [];
    const monitor = new UpstreamMonitor({
      httpFetch,
      configProvider: { getNumber: () => 1000, getString: (_k, d) => d },
      logger: {
        warn: (msg: string, data?: unknown) => { warns.push({ msg, data }); },
        info: () => undefined, error: () => undefined, debug: () => undefined,
      } as never,
    });
    monitor.start();
    monitor.dispose();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const snap = monitor.getSnapshot();
    assert.ok(snap);
    assert.match(snap.error ?? '', /json-parse-failed/);
  });

  test('repo URL with shell metacharacters rejected before fetch (fail-closed)', async () => {
    const { monitor, calls, warns } = makeMonitor({ repo: 'evil; rm -rf /' });
    monitor.start();
    monitor.dispose();
    await new Promise((r) => setImmediate(r));
    const snap = monitor.getSnapshot();
    assert.ok(snap, 'snapshot should exist (error variant)');
    assert.match(snap.error ?? '', /Invalid upstreamRepoUrl/);
    assert.equal(calls.length, 0, 'NO httpFetch call should be issued');
    assert.equal(warns.length, 1);
  });

  test('dispose() clears interval timer (no subsequent poll fires)', async () => {
    const { monitor, calls } = makeMonitor({
      responses: [
        { ok: true, status: 200, body: { tag_name: '0.14.0' } },
        { ok: true, status: 200, body: { total_count: 0 } },
      ],
    });
    monitor.start();
    monitor.dispose();
    // Wait a small amount; if dispose didn't clear, more fetches would queue.
    await new Promise((r) => setTimeout(r, 20));
    // Initial poll fired (2 calls); after dispose, NO additional polls.
    assert.equal(calls.length, 2);
  });
});
