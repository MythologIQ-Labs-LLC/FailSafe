"use strict";
/**
 * G4 (#638) TEST ONLY: throwaway PKI for the falsification suite.
 *
 * - a local RFC 3161 TSA (`openssl ts -reply`) under a throwaway test CA;
 * - ephemeral software P-256 signer keys (Node `crypto`) with self-signed
 *   certificates made by `openssl req -x509`.
 *
 * Everything lives in a temp directory the caller deletes. None of these keys
 * or certificates is, or may become, a FailSafe owner key or trusted TSA.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const { createSoftwareTestSigner } = require("../../../scripts/lib/g4/signer.cjs");

const REQ_CNF = "[req]\ndistinguished_name = dn\nprompt = no\n[dn]\nCN = g4-test-only\n";

function sh(bin, args) {
  const r = ts.run(bin, args);
  if (!r.ok) throw new Error(`openssl ${args.slice(0, 2).join(" ")} failed: ${r.out}`);
  return r.out;
}

function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "").slice(0, 14) + "Z";
}

function tsaConfig(dir) {
  const d = dir.split(path.sep).join("/");
  return [
    "[tsa]", "default_tsa = tsa1", "[tsa1]", `dir = ${d}`, "serial = $dir/tsaserial",
    "crypto_device = builtin", "signer_cert = $dir/tsa.crt", "certs = $dir/tsa.crt", "signer_key = $dir/tsa.key",
    "signer_digest = sha256", "default_policy = 1.3.6.1.4.1.99999.638.1", "digests = sha256, sha384, sha512",
    "accuracy = secs:1", "ordering = yes", "tsa_name = yes", "ess_cert_id_chain = no", "ess_cert_id_alg = sha256", "",
  ].join("\n");
}

/** A local TSA under a fresh test CA. `request(tsq)` returns a granted `.tsr`. */
function createLocalTsa(bin, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const p = (n) => path.join(dir, n);
  fs.writeFileSync(p("req.cnf"), REQ_CNF);
  fs.writeFileSync(p("tsa-ext.cnf"), "extendedKeyUsage = critical,timeStamping\nkeyUsage = critical,digitalSignature\n");
  fs.writeFileSync(p("tsaserial"), "01\n");
  fs.writeFileSync(p("tsa.cnf"), tsaConfig(dir));
  sh(bin, ["genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", p("ca.key")]);
  sh(bin, ["req", "-config", p("req.cnf"), "-x509", "-new", "-key", p("ca.key"), "-subj", "/CN=G4 TEST ONLY root CA",
    "-days", "2", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign", "-out", p("ca.crt")]);
  sh(bin, ["genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", p("tsa.key")]);
  sh(bin, ["req", "-config", p("req.cnf"), "-new", "-key", p("tsa.key"), "-subj", "/CN=G4 TEST ONLY TSA", "-out", p("tsa.csr")]);
  sh(bin, ["x509", "-req", "-in", p("tsa.csr"), "-CA", p("ca.crt"), "-CAkey", p("ca.key"), "-CAcreateserial",
    "-days", "2", "-extfile", p("tsa-ext.cnf"), "-out", p("tsa.crt")]);
  let n = 0;
  return {
    rootPem: fs.readFileSync(p("ca.crt")),
    rootPath: p("ca.crt"),
    async request(tsq) {
      n += 1;
      const q = p(`q${n}.tsq`);
      const r = p(`r${n}.tsr`);
      fs.writeFileSync(q, tsq);
      sh(bin, ["ts", "-reply", "-config", p("tsa.cnf"), "-queryfile", q, "-out", r]);
      return fs.readFileSync(r);
    },
  };
}

/**
 * TEST ONLY: ephemeral P-256 signer. Validity defaults to [now-1h, now+1d];
 * pass `notAfterMs` in the past to model an expired key window.
 */
function createTestSigner(bin, dir, name, { notBeforeMs, notAfterMs } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const keyPath = path.join(dir, `${name}.test-only.key.pem`);
  const cerPath = path.join(dir, `${name}.test-only.cer`);
  fs.writeFileSync(path.join(dir, "req.cnf"), REQ_CNF);
  fs.writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  const now = Date.now();
  sh(bin, ["req", "-config", path.join(dir, "req.cnf"), "-x509", "-new", "-key", keyPath, "-sha256",
    "-subj", `/CN=G4 TEST ONLY signer ${name}`, "-not_before", utcStamp(notBeforeMs ?? now - 3600e3),
    "-not_after", utcStamp(notAfterMs ?? now + 86400e3), "-addext", "keyUsage=critical,digitalSignature",
    "-outform", "DER", "-out", cerPath]);
  return createSoftwareTestSigner({ privateKey, certificateDer: fs.readFileSync(cerPath) });
}

module.exports = { createLocalTsa, createTestSigner, utcStamp };
