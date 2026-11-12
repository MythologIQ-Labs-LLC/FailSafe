"use strict";
/**
 * G4 (#638): RFC 3161 timestamp handling through the OpenSSL CLI.
 *
 * Query:  openssl ts -query -digest <imprint hex> -sha256 -cert
 * Verify: openssl ts -verify -digest <imprint hex> -in <tsr> -CAfile <trusted roots> -untrusted <chain>
 *
 * OpenSSL does the CMS and certificate-path work; this module only frames
 * inputs and reads its text output. No network access happens here except in
 * `postQuery`, which the caller invokes explicitly.
 */
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { refuse, block } = require("./bytes.cjs");

const CANDIDATES = [
  "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe",
  "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
  "/usr/bin/openssl",
];
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

function probe(bin) {
  const res = spawnSync(bin, ["version"], { encoding: "utf8", windowsHide: true });
  return res.status === 0 ? { bin, version: res.stdout.trim() } : null;
}

/** { bin, version } or null. `G4_OPENSSL` overrides discovery. */
function findOpenssl() {
  if (process.env.G4_OPENSSL) return probe(process.env.G4_OPENSSL);
  const onPath = probe("openssl");
  if (onPath) return onPath;
  for (const c of CANDIDATES) {
    if (fs.existsSync(c)) {
      const found = probe(c);
      if (found) return found;
    }
  }
  return null;
}

function requireOpenssl() {
  const found = findOpenssl();
  if (!found) throw block("OPENSSL_UNAVAILABLE", "no openssl binary found (set G4_OPENSSL)");
  return found.bin;
}

function run(bin, args) {
  const res = spawnSync(bin, args, { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return { ok: res.status === 0, out: `${res.stdout || ""}${res.stderr || ""}`.trim() };
}

function buildQuery(bin, imprintHex, outPath) {
  const r = run(bin, ["ts", "-query", "-digest", imprintHex, "-sha256", "-cert", "-out", outPath]);
  if (!r.ok) throw block("TSQ_FAILED", r.out);
}

function parseGenTime(text) {
  const m = /Time stamp: (\w{3})\s+(\d+) (\d\d:\d\d:\d\d)(\.\d+)? (\d{4}) GMT/.exec(text);
  if (!m || !MONTHS[m[1]]) return null;
  const iso = `${m[5]}-${String(MONTHS[m[1]]).padStart(2, "0")}-${m[2].padStart(2, "0")}T${m[3]}${m[4] || ""}Z`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Status, hash algorithm and genTime from the token's text form. */
function tokenInfo(bin, tsrPath) {
  const r = run(bin, ["ts", "-reply", "-in", tsrPath, "-text"]);
  if (!r.ok) throw refuse("TOKEN_MALFORMED", r.out);
  return {
    granted: /Status: Granted\./.test(r.out),
    hashAlgorithm: (/Hash Algorithm: (\S+)/.exec(r.out) || [])[1] || null,
    genTime: parseGenTime(r.out),
    text: r.out,
  };
}

/** Certificates embedded in the token, as PEM, written to `outPem`. */
function extractChain(bin, tsrPath, outPem) {
  const tokenDer = `${outPem}.token.der`;
  const a = run(bin, ["ts", "-reply", "-in", tsrPath, "-token_out", "-out", tokenDer]);
  if (!a.ok) throw refuse("TOKEN_MALFORMED", a.out);
  const b = run(bin, ["pkcs7", "-inform", "DER", "-in", tokenDer, "-print_certs", "-out", outPem]);
  fs.rmSync(tokenDer, { force: true });
  if (!b.ok) throw refuse("TOKEN_MALFORMED", b.out);
}

/**
 * True only when OpenSSL validates the token, the imprint and the chain to `caFile`.
 * With `atTime` (an ISO time) the chain is validated at that time instead of now,
 * and the TSA signer is checked against a CRL in `caFile` that was current then.
 */
function verifyToken(bin, { imprintHex, tsrPath, caFile, untrustedFile, atTime }) {
  const args = ["ts", "-verify", "-digest", imprintHex, "-in", tsrPath, "-CAfile", caFile];
  if (untrustedFile && fs.existsSync(untrustedFile)) args.push("-untrusted", untrustedFile);
  if (atTime) args.push("-attime", String(Math.floor(Date.parse(atTime) / 1000)), "-crl_check");
  return run(bin, args);
}

/** POST a TSQ to a TSA (manual/live use only). Returns the raw response bytes. */
async function postQuery(url, tsqBytes, timeoutMs = 20000) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/timestamp-query", Accept: "application/timestamp-reply" },
    body: tsqBytes,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status, contentType: res.headers.get("content-type"), body: Buffer.from(await res.arrayBuffer()) };
}

module.exports = {
  findOpenssl,
  requireOpenssl,
  run,
  buildQuery,
  parseGenTime,
  tokenInfo,
  extractChain,
  verifyToken,
  postQuery,
};
