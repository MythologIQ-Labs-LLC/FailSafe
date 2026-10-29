#!/usr/bin/env node
'use strict';
// #588 RC0 installed-host negative security probe. Read-only WebSocket handshakes;
// allow literal loopback targets only. A running FailSafe Console is required.
const net = require('node:net');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
const arg = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
if (args.includes('--help')) {
  console.log('Usage: node scripts/probe-console-websocket-rc.cjs --port PORT [--host 127.0.0.1|localhost|::1] [--timeout 2500]');
  process.exit(0);
}
const host = arg('--host', '127.0.0.1');
const port = Number(arg('--port', '9376'));
const timeout = Number(arg('--timeout', '2500'));
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Only literal loopback hosts are permitted');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
if (!Number.isInteger(timeout) || timeout < 200 || timeout > 20000) throw new Error('Invalid timeout');
const authority = host === '::1' ? '[::1]:' + port : host + ':' + port;
const origin = 'http://' + authority;
function request(headers) {
  return new Promise(resolve => {
    const socket = net.connect({ host, port });
    let buffer = Buffer.alloc(0), ended = false;
    function finish(status, detail) {
      if (ended) return;
      ended = true;
      socket.destroy();
      resolve({ status, detail });
    }
    socket.setTimeout(timeout, () => finish(null, 'timeout'));
    socket.on('error', e => finish(null, e.code || String(e)));
    socket.on('connect', () => {
      const key = crypto.randomBytes(16).toString('base64');
      const msg = ['GET / HTTP/1.1', 'Upgrade: websocket', 'Connection: Upgrade',
        'Sec-WebSocket-Key: ' + key, ...headers, '', ''].join('\r\n');
      socket.write(msg);
    });
    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);
      if (buffer.length > 65536) return finish(null, 'oversized response');
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) return;
      const line = buffer.subarray(0, end).toString('latin1').split('\r\n')[0];
      const match = /^HTTP\/1\.1 (\d{3})\b/.exec(line);
      finish(match ? Number(match[1]) : null, line);
    });
    socket.on('close', () => finish(null, 'socket closed without response'));
  });
}
async function main() {
  const base = ['Host: ' + authority, 'Sec-WebSocket-Version: 13'];
  const cases = [
    ['authorized same origin', [...base, 'Origin: ' + origin], 101],
    ['duplicate hostile Host', [...base, 'hOsT: rebind.example:' + port, 'Origin: ' + origin], 403],
    ['duplicate identical Host', [...base, 'HOST: ' + authority, 'Origin: ' + origin], 403],
    ['cross-origin', [...base, 'Origin: https://attacker.example'], 403],
    ['missing Origin', base, 403],
    ['null Origin', [...base, 'Origin: null'], 403],
    ['wrong-port Origin', [...base, 'Origin: http://' + (host === '::1' ? '[::1]' : host) + ':' + (port === 65535 ? 65534 : port + 1)], 403],
    ['host rebinding', ['Host: attacker.example:' + port, 'Sec-WebSocket-Version: 13', 'Origin: http://attacker.example:' + port], 403],
    ['WebSocket version 8', ['Host: ' + authority, 'Sec-WebSocket-Version: 8', 'Origin: ' + origin], 403],
    ['duplicate Origin', [...base, 'Origin: ' + origin, 'Origin: ' + origin], 403],
  ];
  let failed = 0, unreachable = false;
  for (const [label, headers, expected] of cases) {
    const { status, detail } = await request(headers);
    if (status === null) unreachable = true;
    const pass = status === expected;
    if (!pass) failed++;
    console.log((pass ? 'PASS' : 'FAIL') + ' ' + label + ': HTTP ' + (status ?? 'NONE') + ' expected ' + expected + ' (' + detail + ')');
  }
  console.log((cases.length - failed) + '/' + cases.length + ' matched');
  if (unreachable) console.error('NO-GO: Console was unreachable or returned incomplete responses; no acceptance evidence');
  process.exitCode = failed ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 2; });
