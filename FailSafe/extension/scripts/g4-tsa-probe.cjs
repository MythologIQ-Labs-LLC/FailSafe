#!/usr/bin/env node
/**
 * G4 (#638) MANUAL interoperability probe for free public RFC 3161 TSAs.
 *
 *   node FailSafe/extension/scripts/g4-tsa-probe.cjs --out <dir> [--ca-bundle <PEM>] [--only <name,...>]
 *
 * Network use: one request per TSA. Each request carries SHA-256 of 64 bytes
 * of fresh random data (never repository content), built with
 * `openssl ts -query -digest <hex> -sha256 -cert`. For each response it records
 * HTTP status, grant, genTime, policy, TSA name and whether
 * `openssl ts -verify` validated the token and chain against (a) the CA bundle
 * (default: Git for Windows' Mozilla bundle) and (b) a TSA-published root,
 * when the TSA publishes one (trust-on-first-use; reported separately).
 * Not part of any automated test. No account, key or payment is involved.
 */
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("./lib/g4/timestamp.cjs");

const TSAS = [
  { name: "digicert", url: "http://timestamp.digicert.com" },
  { name: "sectigo", url: "http://timestamp.sectigo.com" },
  { name: "freetsa", url: "https://freetsa.org/tsr", rootUrl: "https://freetsa.org/files/cacert.pem" },
  { name: "globalsign", url: "http://timestamp.globalsign.com/tsa/r6advanced1" },
  { name: "sslcom", url: "http://ts.ssl.com" },
  { name: "entrust", url: "http://timestamp.entrust.net/TSS/RFC3161sha2TS" },
  { name: "certum", url: "http://time.certum.pl" },
];
const DEFAULT_BUNDLE = "C:\\Program Files\\Git\\mingw64\\etc\\ssl\\certs\\ca-bundle.crt";

function parseArgs(argv) {
  const o = { caBundle: DEFAULT_BUNDLE, only: null, out: null };
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === "--out") o.out = argv[i + 1];
    else if (argv[i] === "--ca-bundle") o.caBundle = argv[i + 1];
    else if (argv[i] === "--only") o.only = argv[i + 1].split(",");
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!o.out) throw new Error("--out <dir> is required");
  return o;
}

function verifyLine(bin, digest, tsr, caFile, chain) {
  if (!caFile || !fs.existsSync(caFile)) return "not attempted (no CA file)";
  const r = ts.verifyToken(bin, { imprintHex: digest, tsrPath: tsr, caFile, untrustedFile: chain });
  return r.ok ? "Verification: OK" : `FAILED: ${r.out.split(/\r?\n/).slice(-2).join(" | ")}`;
}

async function fetchRoot(t, dir) {
  if (!t.rootUrl) return null;
  const res = await fetch(t.rootUrl, { signal: AbortSignal.timeout(20000) });
  if (res.status !== 200) return null;
  const p = path.join(dir, "published-root.pem");
  fs.writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  return p;
}

function describeToken(bin, tsr, dir) {
  const info = ts.tokenInfo(bin, tsr);
  const chain = path.join(dir, "tsa-chain.pem");
  ts.extractChain(bin, tsr, chain);
  const subjects = fs.readFileSync(chain, "utf8").split(/\r?\n/).filter((l) => l.startsWith("subject=")).map((l) => l.slice(8));
  const field = (re) => (re.exec(info.text) || [])[1] || null;
  return { granted: info.granted, genTime: info.genTime, hash: info.hashAlgorithm, policy: field(/Policy OID: (.+)/), tsaName: field(/TSA: (.+)/), chain, subjects };
}

async function probeOne(bin, t, o) {
  const dir = path.join(o.out, t.name);
  fs.mkdirSync(dir, { recursive: true });
  const digest = crypto.createHash("sha256").update(crypto.randomBytes(64)).digest("hex");
  const tsq = path.join(dir, "probe.tsq");
  ts.buildQuery(bin, digest, tsq);
  const row = { name: t.name, url: t.url, digest };
  try {
    const res = await ts.postQuery(t.url, fs.readFileSync(tsq));
    Object.assign(row, { http: res.status, contentType: res.contentType });
    if (res.status !== 200 || res.body.length === 0) return row;
    const tsr = path.join(dir, "probe.tsr");
    fs.writeFileSync(tsr, res.body);
    Object.assign(row, describeToken(bin, tsr, dir));
    row.verifyBundle = verifyLine(bin, digest, tsr, o.caBundle, row.chain);
    const root = await fetchRoot(t, dir).catch(() => null);
    if (root) row.verifyPublishedRoot = verifyLine(bin, digest, tsr, root, row.chain);
  } catch (err) {
    row.error = String(err && err.message ? err.message : err);
  }
  return row;
}

async function main(argv) {
  const o = parseArgs(argv);
  const bin = ts.requireOpenssl();
  fs.mkdirSync(o.out, { recursive: true });
  const rows = [];
  for (const t of TSAS.filter((x) => !o.only || o.only.includes(x.name))) rows.push(await probeOne(bin, t, o));
  const report = { probedUtc: new Date().toISOString(), openssl: ts.findOpenssl().version, caBundle: o.caBundle, rows };
  fs.writeFileSync(path.join(o.out, "probe-results.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { process.stderr.write(`[g4-tsa-probe] ${e.message}\n`); process.exitCode = 2; });
}
