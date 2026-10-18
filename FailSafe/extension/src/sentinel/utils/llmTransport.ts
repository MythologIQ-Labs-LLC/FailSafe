/**
 * llmTransport - the only place Sentinel and Brainstorm content leaves the process (#538, B273).
 *
 * One request to a target the destination policy produced. Every address the
 * host resolves to is checked against the request's address class before
 * connecting (an IP literal is checked here, because Node skips `lookup` for
 * literals). Redirects are never followed: a 3xx comes back to the caller.
 * The response is capped and the timeout is one deadline for the whole call.
 */

import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { addressAllowed, guardedLookup, refusedAddressError, type AddressClass, type ResolveFn } from '../../shared/net/addressPolicy';
import type { LlmTarget } from './llmDestinationPolicy';

export interface LlmHttpRequest {
  target: LlmTarget;
  /** Path under the target's base path, e.g. `/api/tags`. */
  path: string;
  method: 'GET' | 'POST';
  body?: string;
  timeoutMs: number;
  addresses: AddressClass;
}

export interface LlmHttpResponse { status: number; body: string }

export type LlmHttpFn = (request: LlmHttpRequest) => Promise<LlmHttpResponse>;

export const MAX_LLM_RESPONSE_BYTES = 8 * 1024 * 1024;

export function createLlmHttp(resolve?: ResolveFn): LlmHttpFn {
  return (request) => new Promise<LlmHttpResponse>((resolvePromise, reject) => {
    const { target } = request;
    if (net.isIP(target.hostname) !== 0 && !addressAllowed(target.hostname, request.addresses)) {
      reject(refusedAddressError(target.hostname));
      return;
    }
    let settled = false;
    // Assigned below, before any event can call finish().
    const deadline: { timer?: NodeJS.Timeout } = {};
    const finish = (err: Error | undefined, value?: LlmHttpResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline.timer);
      if (err) reject(err); else resolvePromise(value as LlmHttpResponse);
    };
    const options: http.RequestOptions = {
      hostname: target.hostname,
      port: target.port,
      path: `${target.basePath}${request.path}`,
      method: request.method,
      agent: false,
      lookup: guardedLookup(request.addresses, resolve),
      headers: request.body === undefined
        ? {}
        : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(request.body) },
    };
    const onResponse = (res: http.IncomingMessage) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_LLM_RESPONSE_BYTES) {
          req.destroy();
          finish(new Error(`LLM response too large (over ${MAX_LLM_RESPONSE_BYTES} bytes)`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => finish(undefined, { status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', (e) => finish(e));
      res.on('aborted', () => finish(new Error('LLM response aborted')));
    };
    const req = target.protocol === 'https:' ? https.request(options, onResponse) : http.request(options, onResponse);
    deadline.timer = setTimeout(() => {
      finish(new Error(`LLM request timed out after ${request.timeoutMs} ms`));
      req.destroy();
    }, request.timeoutMs);
    req.on('error', (e) => finish(e));
    req.end(request.body);
  });
}
