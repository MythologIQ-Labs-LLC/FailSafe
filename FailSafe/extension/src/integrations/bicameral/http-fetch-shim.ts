// http-fetch-shim — minimal `fetch`-shaped GET helper backed by node:https.
//
// RC1: the extension-host Node runtime (vscode-test electron) does not
// reliably expose a global `fetch`. `UpstreamMonitor` only issues GET
// requests to api.github.com and consumes a tiny subset of the Response
// API (`.ok`, `.status`, `.json()`). This shim satisfies exactly that
// subset so the upstream poller keeps working when global `fetch` is
// absent — graceful degradation without bricking activation.
//
// Intentionally minimal: GET only, HTTPS only, no streaming, no headers
// API beyond what UpstreamMonitor needs. Not a general-purpose fetch.

import * as https from 'node:https';

/** The slice of the WHATWG Response interface that UpstreamMonitor consumes. */
interface MinimalResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/**
 * A `typeof fetch`-compatible GET shim. Only the first argument (URL) is
 * honoured; request init is ignored because UpstreamMonitor issues bare
 * GETs. Resolves with a MinimalResponse; rejects on transport error.
 */
export const httpFetchShim: typeof fetch = ((input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  return new Promise<Response>((resolve, reject) => {
    const req = https.get(
      url,
      // GitHub's REST API rejects requests without a User-Agent.
      { headers: { 'User-Agent': 'failsafe-upstream-monitor', Accept: 'application/vnd.github+json' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          const response: MinimalResponse = {
            ok: status >= 200 && status < 300,
            status,
            json: async () => JSON.parse(body),
            text: async () => body,
          };
          resolve(response as unknown as Response);
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}) as typeof fetch;
