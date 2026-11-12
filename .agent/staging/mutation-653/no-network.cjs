'use strict';
// Preload for every mutation run (audit VETO #945): no test process may reach a host other than this machine.
// Loaded with `node --require` or `mocha --require`. Each refused attempt is appended to the file named by
// NO_NETWORK_LOG, so a run can report how many connections a mutant tried. Loopback is allowed (local Console
// servers); everything else, including any lookup of the provider, is refused before a packet is sent.
const dns = require('dns');
const net = require('net');
const fs = require('fs');

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/i;
const log = (what, host) => {
  if (process.env.NO_NETWORK_LOG) fs.appendFileSync(process.env.NO_NETWORK_LOG, `${what} ${host}\n`);
};
const refused = (host) => Object.assign(new Error(`no-network: refused ${host}`), { code: 'ECONNREFUSED' });

const lookup = dns.lookup;
dns.lookup = function guardedLookup(host, opts, cb) {
  const done = typeof opts === 'function' ? opts : cb;
  if (LOCAL.test(String(host))) return lookup.apply(this, arguments);
  log('lookup', host);
  process.nextTick(() => done(refused(host)));
  return undefined;
};
for (const name of ['resolve', 'resolve4', 'resolve6']) {
  dns[name] = (host, ...rest) => { log(name, host); process.nextTick(() => rest[rest.length - 1](refused(host))); };
}
dns.promises.lookup = async (host, ...rest) => {
  if (LOCAL.test(String(host))) return lookup.__promisify__ ? lookup.__promisify__(host, ...rest) : require('util').promisify(lookup)(host, ...rest);
  log('lookup', host);
  throw refused(host);
};

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  // net.connect() passes its normalised arguments as an internal array whose first item is the options object.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const o = typeof first === 'object' && first !== null ? first : { host: args[1], port: first };
  const host = o.path ? 'local-pipe' : String(o.host || 'localhost');
  if (o.path || LOCAL.test(host)) return connect.apply(this, args);
  log('connect', host);
  process.nextTick(() => this.destroy(refused(host)));
  return this;
};
