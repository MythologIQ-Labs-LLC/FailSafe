// #538 lane A (B273): shared fixtures for the Sentinel LLM egress rows.
//
// The counting server records every request it receives, so "nothing reached
// the destination" is a measured zero. The red-on-main rows need a host name
// that is not a loopback name yet still reaches a local server: the machine's
// own host name, served by a listener on all interfaces. A control request
// proves that name reaches the server first; if it does not, the row fails
// with the reason instead of passing on a zero it never could have broken.

import * as http from 'http';
import * as os from 'os';
import type { AddressInfo } from 'net';
import { LLMClient } from '../../../sentinel/utils/LLMClient';
import type { IConfigProvider } from '../../../core/interfaces/IConfigProvider';
import type { FailSafeConfig } from '../../../shared/types';

export interface Received { method: string; url: string; body: string }

export interface CountingServer {
  port: number;
  received: Received[];
  /** Requests other than the control request. */
  count(): number;
  close(): Promise<void>;
}

export type Responder = (req: Received, res: http.ServerResponse) => void;

const CONTROL_PATH = '/__failsafe_control__';

export const defaultResponder: Responder = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url.endsWith('/api/generate')) {
    res.end(JSON.stringify({ response: 'ESCALATE: model answer', total_duration: 7 }));
  } else {
    res.end(JSON.stringify({ models: [] }));
  }
};

/** A server counting requests; `host` '::' listens on all interfaces. */
export function startCountingServer(host: string, respond: Responder = defaultResponder): Promise<CountingServer> {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const r: Received = { method: req.method ?? '', url: req.url ?? '', body: Buffer.concat(chunks).toString('utf8') };
      received.push(r);
      if (r.url === CONTROL_PATH) { res.end('control'); return; }
      respond(r, res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        received,
        count: () => received.filter((r) => r.url !== CONTROL_PATH).length,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/**
 * `http://<os.hostname()>:<port>` after a direct control request proved the
 * name reaches `server`. Throws (failing the row) when it does not.
 */
export async function reachableHostNameEndpoint(server: CountingServer): Promise<string> {
  const endpoint = `http://${os.hostname()}:${server.port}`;
  const before = server.received.length;
  await new Promise<void>((resolve, reject) => {
    const req = http.get(`${endpoint}${CONTROL_PATH}`, (res) => { res.resume(); res.on('end', () => resolve()); });
    req.setTimeout(3000, () => req.destroy(new Error('control request timed out')));
    req.on('error', (e) => reject(new Error(`control request to ${endpoint} failed (${e.message}); this row needs the host name to reach a local listener`)));
  });
  if (server.received.length !== before + 1) {
    throw new Error(`control request to ${endpoint} did not reach the counting server`);
  }
  return endpoint;
}

export interface SentinelFields {
  endpoint: string;
  source?: string;
  mode?: string;
  model?: string;
}

/** A config provider whose sentinel section is `fields`; the endpoint may be swapped later. */
export function configProvider(fields: SentinelFields): IConfigProvider & { set(next: Partial<SentinelFields>): void } {
  let current = { ...fields };
  return {
    set(next: Partial<SentinelFields>) { current = { ...current, ...next }; },
    getConfig: () => ({
      sentinel: {
        enabled: true,
        mode: current.mode ?? 'hybrid',
        localModel: current.model ?? 'phi3:mini',
        ollamaEndpoint: current.endpoint,
        ollamaEndpointSource: current.source,
      },
      governance: { mode: 'observe', overseerId: 'did:myth:overseer:test' },
    }) as unknown as FailSafeConfig,
    getWorkspaceRoot: () => undefined,
    getFailSafeDir: () => os.tmpdir(),
    getLedgerPath: () => os.tmpdir(),
    getFeedbackDir: () => os.tmpdir(),
    getSentinelConfigPath: () => os.tmpdir(),
    onConfigChange: () => () => undefined,
  } as unknown as IConfigProvider & { set(next: Partial<SentinelFields>): void };
}

export interface AuthorizeCall { request: { origin: string; operation: string; model?: string }; options: { ask: boolean } }

/** An authorizer fake: `decide` answers each call; every call is recorded. */
export function fakeAuthorizer(decide: (call: AuthorizeCall) => boolean | Promise<boolean>) {
  const calls: AuthorizeCall[] = [];
  const notified: string[] = [];
  return {
    calls,
    notified,
    async authorize(request: AuthorizeCall['request'], options: AuthorizeCall['options'] = { ask: false }) {
      const call = { request, options };
      calls.push(call);
      return decide(call);
    },
    async forget() { return 0; },
    notifyRefusedAddress(origin: string) { notified.push(origin); },
  };
}

export const allowAll = () => fakeAuthorizer(() => true);

export interface HttpCall { target: { origin: string; hostname: string; port: number; basePath: string }; path: string; method: string; body?: string; addresses: string }

/** A recording LlmHttpFn: never touches the network. */
export function recordingHttp(respond: (call: HttpCall) => { status: number; body: string } = defaultRecordedResponse) {
  const calls: HttpCall[] = [];
  const fn = async (call: HttpCall) => { calls.push(call); return respond(call); };
  return { calls, fn };
}

function defaultRecordedResponse(call: HttpCall): { status: number; body: string } {
  return call.path.endsWith('/api/generate')
    ? { status: 200, body: JSON.stringify({ response: 'ok', total_duration: 3 }) }
    : { status: 200, body: '{"models":[]}' };
}

/**
 * Build an LLMClient through the constructor's argument list, so these rows
 * compile against main (one parameter, the red run) and after the fix (an
 * optional second parameter).
 */
export function newClient(config: IConfigProvider, options?: Record<string, unknown>): LLMClient {
  return Reflect.construct(LLMClient, options === undefined ? [config] : [config, options]) as LLMClient;
}

/** checkAvailability with options, compiled against main's zero-parameter signature. */
export function probe(client: LLMClient, options?: { ask?: boolean }): Promise<boolean> {
  return (client.checkAvailability as (o?: { ask?: boolean }) => Promise<boolean>).call(client, options);
}
