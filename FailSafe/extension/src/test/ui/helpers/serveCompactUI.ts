// Test helper: spin up an HTTP + WS server that mimics the FailSafe ConsoleServer
// just enough for the compact Monitor UI to render. Returns a controller that
// lets specs swap the hub snapshot mid-test and force WS open/close to drive
// hub.refresh and staleness state.

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { AddressInfo } from 'net';
import { WebSocket, WebSocketServer } from 'ws';

import { HubFixture, ShieldEntry, buildLedgerContent } from './ledgerFixtures';

export interface ServeFixtures {
  hub: HubFixture;
  ledgerEntries?: ShieldEntry[];
  workspaceDir?: string;
}

export interface ServeController {
  url: string;
  setHub(hub: HubFixture): void;
  broadcast(message: { type: string; payload?: unknown }): void;
  closeAllSockets(): void;
  acceptingConnections(open: boolean): void;
  close(): Promise<void>;
}

const UI_ROOT = path.resolve(__dirname, '..', '..', '..', 'roadmap', 'ui');
// Educational Component (v5.2.0): the micro-lesson affordance imports the
// lesson registry from `../../../education/lessons.js`, resolved at the
// /education URL. The browser needs an ESM module — the tsc `out/education`
// output is CommonJS, so the real ConsoleServer mounts the esbuild-emitted
// `out/education-browser` instead (ConsoleRouteRegistrar). This helper mirrors
// that, probing candidates so it works whether run from the src/ tree
// (Playwright) or the out/ tree.
const EDUCATION_ROOT = (() => {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', '..', 'out', 'education-browser'),
    path.resolve(__dirname, '..', '..', '..', '..', '..', 'out', 'education-browser'),
    path.resolve(__dirname, '..', '..', '..', 'education-browser'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'lessons.js'))) return c;
  }
  return candidates[0];
})();

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function writeWorkspace(dir: string, entries: ShieldEntry[] | undefined): void {
  const docs = path.join(dir, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'META_LEDGER.md'), buildLedgerContent(entries || []), 'utf8');
  fs.writeFileSync(path.join(docs, 'BACKLOG.md'), '# FailSafe Backlog\n\n_(test fixture)_\n', 'utf8');
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  // /education/* resolves to the education tree (sibling of roadmap/), matching
  // the real ConsoleServer's /education mount.
  if (requestPath.startsWith('/education/')) {
    const eduRel = requestPath.replace(/^\/education\/+/, '');
    const eduPath = path.join(EDUCATION_ROOT, eduRel);
    if (eduPath.startsWith(EDUCATION_ROOT) && fs.existsSync(eduPath) && !fs.statSync(eduPath).isDirectory()) {
      res.setHeader('Content-Type', contentType(eduPath));
      res.end(fs.readFileSync(eduPath));
      return true;
    }
    return false;
  }
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.join(UI_ROOT, relative);
  if (!filePath.startsWith(UI_ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  res.setHeader('Content-Type', contentType(filePath));
  res.end(fs.readFileSync(filePath));
  return true;
}

export async function serveCompactUI(fixtures: ServeFixtures): Promise<ServeController> {
  const workspaceDir = fixtures.workspaceDir
    || fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-monitor-fixture-'));
  writeWorkspace(workspaceDir, fixtures.ledgerEntries);

  let currentHub: HubFixture = fixtures.hub;
  const sockets = new Set<WebSocket>();
  let acceptConnections = true;

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/api/hub')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(currentHub));
      return;
    }
    if (url.startsWith('/api/')) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end('{}');
      return;
    }
    if (!serveStatic(req, res)) {
      res.statusCode = 404;
      res.end('not found');
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (!acceptConnections) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket as never, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (socket) => {
    sockets.add(socket);
    socket.send(JSON.stringify({ type: 'init', payload: currentHub }));
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    setHub(hub) { currentHub = hub; },
    broadcast(message) {
      const data = JSON.stringify(message);
      for (const sock of sockets) {
        if (sock.readyState === WebSocket.OPEN) sock.send(data);
      }
    },
    closeAllSockets() {
      for (const sock of sockets) sock.close();
      sockets.clear();
    },
    acceptingConnections(open) { acceptConnections = open; },
    async close() {
      acceptConnections = false;
      for (const sock of sockets) sock.terminate();
      sockets.clear();
      wss.close();
      const closeAll = (server as { closeAllConnections?: () => void }).closeAllConnections;
      if (typeof closeAll === 'function') closeAll.call(server);
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
