/**
 * Lightweight in-process HTTP harness for route tests.
 *
 * Spins the supplied Express app on an ephemeral port and provides a
 * `request` helper backed by Node's built-in `http` module so tests can
 * exercise route handlers end-to-end without supertest. Verifies real
 * status codes, headers, and JSON bodies via the same path production
 * traffic takes (`req.body` parsing, middleware, etc.).
 */
import * as http from 'http';
import type { Application } from 'express';
import express from 'express';

export interface RouteResponse {
  status: number;
  body: any;
  headers: http.IncomingHttpHeaders;
}

export interface RouteRequestOptions {
  method?: string;
  path: string;
  body?: unknown;
  remote?: boolean;
}

export class RouteHarness {
  private server: http.Server | null = null;
  private port = 0;
  constructor(public readonly app: Application) {}

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server = this.app.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr !== 'string') this.port = addr.port;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  async request(opts: RouteRequestOptions): Promise<RouteResponse> {
    return new Promise((resolve, reject) => {
      const payload = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
      const headers: Record<string, string> = {};
      if (payload) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = String(Buffer.byteLength(payload));
      }
      // Force a non-loopback originating IP for "remote" tests by using
      // the X-Forwarded-For header is NOT honoured by the route guard
      // (which checks socket.remoteAddress). To simulate a remote client
      // we connect via the public hostname mapped to a non-loopback IP.
      // Easiest reliable trick: the guard treats only ::1 / 127.0.0.1 as
      // local, so dialing the harness on `localhost` -> 127.0.0.1 is
      // always local. Tests for the remote path should use the
      // `simulateRemote` helper that bypasses the harness entirely.
      const req = http.request({
        host: '127.0.0.1',
        port: this.port,
        path: opts.path,
        method: opts.method || 'GET',
        headers,
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed: any = data;
          if ((res.headers['content-type'] || '').includes('application/json')) {
            try { parsed = JSON.parse(data); } catch { /* keep raw */ }
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
}

export function makeApp(): Application {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  return app;
}

/**
 * Synchronous helper for routes whose only "remote" branch we want to
 * verify. Builds the smallest possible mock req/res, drives the Express
 * router directly via `app.handle`, and returns the captured response.
 * Avoids the need for a real HTTP socket so we can lie about the
 * remote address.
 */
export interface CapturedResponse {
  statusCode: number;
  body: unknown;
  finished: boolean;
}

export function invokeRemote(app: Application, method: string, path: string): Promise<CapturedResponse> {
  return new Promise((resolve, reject) => {
    const captured: CapturedResponse = { statusCode: 200, body: undefined, finished: false };
    // Mock req: just enough surface for express + route handlers.
    const fakeReq: any = {
      method,
      url: path,
      headers: { host: 'example.com' },
      // Critical: socket.remoteAddress must be non-loopback so
      // rejectIfRemote returns true.
      socket: { remoteAddress: '203.0.113.7' },
      ip: '203.0.113.7',
      query: {},
      params: {},
      body: {},
      app,
      get(name: string) { return this.headers[String(name).toLowerCase()]; },
    };
    const fakeRes: any = {
      _headers: {} as Record<string, string>,
      statusCode: 200,
      setHeader(k: string, v: string) { this._headers[k.toLowerCase()] = v; },
      getHeader(k: string) { return this._headers[k.toLowerCase()]; },
      status(code: number) { this.statusCode = code; captured.statusCode = code; return this; },
      json(payload: unknown) { captured.body = payload; captured.finished = true; this.end(); return this; },
      send(payload: unknown) { captured.body = payload; captured.finished = true; this.end(); return this; },
      end() {
        if (captured.statusCode === 200 && this.statusCode !== 200) {
          captured.statusCode = this.statusCode;
        }
        captured.finished = true;
        resolve(captured);
        return this;
      },
      writeHead(code: number) { this.statusCode = code; captured.statusCode = code; return this; },
    };
    try {
      (app as any).handle(fakeReq, fakeRes, (err: unknown) => {
        if (err) reject(err);
        else if (!captured.finished) resolve(captured);
      });
    } catch (err) {
      reject(err);
    }
  });
}
