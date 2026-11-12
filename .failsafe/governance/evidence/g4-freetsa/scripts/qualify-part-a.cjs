"use strict";
/** Part A: real FreeTSA tokens, OpenSSL verification against the pinned root only. */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Q = require("./qualify-freetsa.cjs");

const PUBLISHED_TSA_CERT_SHA256 = "32e841a95cc1164101ffde41298ef2fc75c1c4372ef095e88a6bbd47dfb191fc";
const MOZILLA_BUNDLE = "C:\\Program Files\\Git\\mingw64\\etc\\ssl\\certs\\ca-bundle.crt";
const DIR = path.join(Q.OUT, "part-a");

function verify(tok, { digest = tok.digest, tsr = tok.tsr, caFile = path.join(DIR, "pinned-root.pem"), extra = [] } = {}) {
  const args = ["ts", "-verify", "-digest", digest, "-in", tsr, "-CAfile", caFile, "-untrusted", tok.chain, ...extra];
  return Q.ts.run(Q.BIN, args);
}

/** A self-signed root with the FreeTSA root's exact subject DN, but a different key. */
function forgedRoot() {
  const subj = "/O=Free TSA/OU=Root CA/CN=www.freetsa.org/emailAddress=busilezas@gmail.com/L=Wuerzburg/ST=Bayern/C=DE";
  const key = path.join(DIR, "forged-root.key");
  const crt = path.join(DIR, "forged-root-same-dn.pem");
  Q.ts.run(Q.BIN, ["genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", key]);
  const r = Q.ts.run(Q.BIN, ["req", "-x509", "-new", "-key", key, "-subj", subj, "-days", "30", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign", "-out", crt]);
  if (!r.ok) throw new Error(r.out);
  fs.rmSync(key);
  return crt;
}

function chainFacts(tok) {
  const pems = fs.readFileSync(tok.chain, "utf8").match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  return pems.map((p) => { const c = new crypto.X509Certificate(p); return { subject: c.subject.replace(/\n/g, ", "), sha256: Q.sha256(c.raw), validTo: c.validTo }; });
}

function checkToken(tok, i) {
  const name = `token ${i}`;
  Q.record("A", `${name} granted, sha256, genTime`, true, tok.info.granted && tok.info.hashAlgorithm === "sha256" && Boolean(tok.info.genTime), `genTime ${tok.info.genTime}`);
  const facts = chainFacts(tok);
  fs.writeFileSync(path.join(tok.dir, "chain-facts.json"), JSON.stringify(facts, null, 2) + "\n");
  Q.record("A", `${name} embedded signer is the published tsa.crt`, true, facts.some((f) => f.sha256 === PUBLISHED_TSA_CERT_SHA256), facts.map((f) => f.sha256.slice(0, 16)).join(","));
  const r = verify(tok);
  Q.record("A", `${name} verifies against the pinned FreeTSA root only`, "OK", Q.verdict(r), Q.tail(r.out));
}

function mutate(tok, label, fn) {
  const p = path.join(DIR, `malformed-${label}.tsr`);
  fs.writeFileSync(p, fn(fs.readFileSync(tok.tsr)));
  const r = verify(tok, { tsr: p });
  Q.record("A", `malformed token (${label}) rejected`, "FAIL", Q.verdict(r), Q.tail(r.out));
}

function flip(buf, at) {
  const b = Buffer.from(buf);
  b[at] ^= 0x01;
  return b;
}

/** Offset `skip` bytes past the first occurrence of hex `marker`. */
function at(buf, marker, skip) {
  const i = buf.indexOf(Buffer.from(marker, "hex"));
  if (i < 0) throw new Error(`marker ${marker} not found`);
  return i + skip;
}

/**
 * The CMS certificates field is outside the signature by design. A byte flipped
 * inside an embedded certificate leaves the signed content intact; OpenSSL then
 * takes the signer from the separately supplied chain, matched by the signed
 * ESSCertID, and the token still verifies. Without that chain it must fail.
 */
function unsignedCertSet(t1) {
  const p = path.join(DIR, "unsigned-embedded-certificate-byte-flipped.tsr");
  const b = fs.readFileSync(t1.tsr);
  fs.writeFileSync(p, flip(b, at(b, Buffer.from("freetsa_cps.html").toString("hex"), 3)));
  const withChain = verify(t1, { tsr: p });
  Q.record("A", "unsigned embedded certificate byte flipped, genuine chain supplied (signed content intact)", "OK", Q.verdict(withChain), Q.tail(withChain.out));
  const bare = Q.ts.run(Q.BIN, ["ts", "-verify", "-digest", t1.digest, "-in", p, "-CAfile", path.join(DIR, "pinned-root.pem")]);
  Q.record("A", "unsigned embedded certificate byte flipped, no separate chain", "FAIL", Q.verdict(bare), Q.tail(bare.out));
}

function rejections(t1, t2) {
  const forged = forgedRoot();
  for (const [label, caFile] of [["public Mozilla bundle", MOZILLA_BUNDLE], ["forged root with the same subject DN", forged]]) {
    const r = verify(t1, { caFile });
    Q.record("A", `wrong root (${label}) rejected`, "FAIL", Q.verdict(r), Q.tail(r.out));
  }
  for (const [label, digest] of [["fresh random digest", Q.randomDigest()], ["token 2's digest", t2.digest]]) {
    const r = verify(t1, { digest });
    Q.record("A", `substituted imprint (${label}) rejected`, "FAIL", Q.verdict(r), Q.tail(r.out));
  }
  mutate(t1, "truncated", (b) => b.subarray(0, Math.floor(b.length / 2)));
  mutate(t1, "last byte of signature flipped", (b) => flip(b, b.length - 1));
  mutate(t1, "a genTime digit inside the signed TSTInfo flipped", (b) => flip(b, at(b, "180f", 4)));
  mutate(t1, "the TSTInfo nonce flipped", (b) => flip(b, at(b, "0101ff0208", 6)));
  unsignedCertSet(t1);
  mutate(t1, "random bytes", () => crypto.randomBytes(t1.info.text.length));
  mutate(t1, "empty", () => Buffer.alloc(0));
}

function timeWindow(t1) {
  const gen = Math.floor(Date.parse(t1.info.genTime) / 1000);
  const cases = [
    ["at token time", gen, "OK"],
    ["before the signer certificate (2026-01-01)", Date.parse("2026-01-01T00:00:00Z") / 1000, "FAIL"],
    ["after the signer certificate expires (2040-02-03)", Date.parse("2040-02-03T00:00:00Z") / 1000, "FAIL"],
    ["after the root expires (2041-03-08)", Date.parse("2041-03-08T00:00:00Z") / 1000, "FAIL"],
  ];
  for (const [label, at, want] of cases) {
    const r = verify(t1, { extra: ["-attime", String(at)] });
    Q.record("A", `verification time ${label}`, want, Q.verdict(r), Q.tail(r.out));
  }
}

async function run() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, "pinned-root.pem"), Q.ROOT_PEM);
  const tokens = [];
  for (let i = 1; i <= 3; i += 1) tokens.push(await Q.stamp(path.join(DIR, `token-${i}`), Q.randomDigest()));
  tokens.forEach((t, i) => checkToken(t, i + 1));
  fs.writeFileSync(path.join(DIR, "digests.json"), JSON.stringify(tokens.map((t) => ({ digest: t.digest, genTime: t.info.genTime })), null, 2) + "\n");
  rejections(tokens[0], tokens[1]);
  timeWindow(tokens[0]);
}

module.exports = { run };
