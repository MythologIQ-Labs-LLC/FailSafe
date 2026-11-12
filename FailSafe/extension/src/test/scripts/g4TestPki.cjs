"use strict";
/**
 * G4 (#638) TEST ONLY: throwaway PKI for the falsification suite.
 *
 * - a local RFC 3161 TSA (`openssl ts -reply`) under a throwaway test CA;
 * - ephemeral software P-256 signer keys (Node `crypto`) with self-signed
 *   certificates made by `openssl ca -selfsign` (exact UTC validity windows).
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
    "signer_digest = sha256", "default_policy = 1.3.6.1.4.1.99999.638.1", "digests = sha256, sha384, sha512, sha3-256",
    "accuracy = secs:1", "ordering = yes", "tsa_name = yes", "ess_cert_id_chain = no", "ess_cert_id_alg = sha256", "",
  ].join("\n");
}

/** `openssl ca` configuration for the local test CA: issues the TSA certificate, revokes it and makes CRLs. */
function caConfig(dir) {
  const d = dir.split(path.sep).join("/");
  return [
    "[ca]", "default_ca = tca", "[tca]", `dir = ${d}`, "database = $dir/index.txt", "new_certs_dir = $dir",
    "serial = $dir/caserial", "crlnumber = $dir/crlnumber", "certificate = $dir/ca.crt", "private_key = $dir/ca.key",
    "default_md = sha256", "policy = any", "unique_subject = no", "default_crl_days = 30", "x509_extensions = tsa_ext",
    "[any]", "commonName = supplied",
    "[tsa_ext]", "extendedKeyUsage = critical,timeStamping", "keyUsage = critical,digitalSignature", "",
  ].join("\n");
}

function makeCa(bin, p) {
  const files = [["req.cnf", REQ_CNF], ["tsaserial", "01\n"], ["caserial", "1000\n"], ["crlnumber", "1000\n"], ["index.txt", ""]];
  for (const [f, v] of files) fs.writeFileSync(p(f), v);
  sh(bin, ["genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", p("ca.key")]);
  sh(bin, ["req", "-config", p("req.cnf"), "-x509", "-new", "-key", p("ca.key"), "-subj", "/CN=G4 TEST ONLY root CA",
    "-days", "2", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign", "-out", p("ca.crt")]);
}

/**
 * A local TSA under a fresh test CA. `request(tsq)` returns a granted `.tsr`.
 * `crl()` returns a PEM CRL from the test CA (`lastMs`/`nextMs` set its window);
 * `revokeSigner()` revokes the TSA signer certificate in later CRLs.
 * `signerValidMs` shortens the signer's validity to model an expired signer.
 */
function createLocalTsa(bin, dir, { signerValidMs = 2 * 86400e3 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const p = (n) => path.join(dir, n);
  makeCa(bin, p);
  fs.writeFileSync(p("tsa.cnf"), tsaConfig(dir));
  fs.writeFileSync(p("ca.cnf"), caConfig(dir));
  sh(bin, ["genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", p("tsa.key")]);
  sh(bin, ["req", "-config", p("req.cnf"), "-new", "-key", p("tsa.key"), "-subj", "/CN=G4 TEST ONLY TSA", "-out", p("tsa.csr")]);
  const now = Date.now();
  sh(bin, ["ca", "-batch", "-notext", "-config", p("ca.cnf"), "-in", p("tsa.csr"), "-out", p("tsa.crt"),
    "-startdate", utcStamp(now - 60e3), "-enddate", utcStamp(now + signerValidMs)]);
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
    crl({ lastMs = Date.now() - 60e3, nextMs = Date.now() + 30 * 86400e3 } = {}) {
      n += 1;
      const out = p(`crl${n}.pem`);
      sh(bin, ["ca", "-config", p("ca.cnf"), "-gencrl", "-crl_lastupdate", utcStamp(lastMs), "-crl_nextupdate", utcStamp(nextMs), "-out", out]);
      return fs.readFileSync(out);
    },
    revokeSigner(reason) {
      sh(bin, ["ca", "-config", p("ca.cnf"), "-revoke", p("tsa.crt"), ...(reason ? ["-crl_reason", reason] : [])]);
    },
  };
}

/** OpenSSL `ca` configuration and database for one self-signed test certificate. */
function selfSignCaConfig(dir, keyPath) {
  const dbDir = path.join(dir, "local-ca-db");
  const issuedDir = path.join(dbDir, "issued");
  fs.mkdirSync(issuedDir, { recursive: true });
  fs.writeFileSync(path.join(dbDir, "index.txt"), "");
  fs.writeFileSync(path.join(dbDir, "serial"), "1000\n");
  const quoted = (v) => {
    if (/[\r\n\0]/.test(v)) throw new Error("unsafe path in G4 test CA configuration");
    const normalized = v.split(path.sep).join("/");
    // OpenSSL config treats backslash as an escape. Escape it BEFORE quotes.
    return '"' + normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  };
  return [
    "[ca]", "default_ca = local_signer_ca", "[local_signer_ca]",
    "new_certs_dir = " + quoted(issuedDir),
    "database = " + quoted(path.join(dbDir, "index.txt")),
    "serial = " + quoted(path.join(dbDir, "serial")),
    "private_key = " + quoted(keyPath),
    "default_md = sha256", "policy = policy_any",
    "x509_extensions = signer_extensions",
    "[policy_any]", "commonName = supplied",
    "[signer_extensions]", "basicConstraints = critical,CA:FALSE",
    "keyUsage = critical,digitalSignature", "",
  ].join("\n");
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
  // OpenSSL req -x509 does not accept -not_before / -not_after on supported
  // CI OpenSSL versions. Use ca -selfsign with a throwaway local CA database.
  const caConfig = selfSignCaConfig(dir, keyPath);
  const configPath = path.join(dir, "ca.cnf");
  const csrPath = path.join(dir, name + ".test-only.csr");
  const pemPath = path.join(dir, name + ".test-only.crt.pem");
  fs.writeFileSync(configPath, caConfig);
  sh(bin, ["req", "-config", path.join(dir, "req.cnf"), "-new", "-key", keyPath,
    "-subj", "/CN=G4 TEST ONLY signer " + name, "-out", csrPath]);
  const now = Date.now();
  sh(bin, ["ca", "-selfsign", "-config", configPath, "-in", csrPath, "-out", pemPath,
    "-startdate", utcStamp(notBeforeMs ?? now - 3600e3),
    "-enddate", utcStamp(notAfterMs ?? now + 86400e3), "-batch"]);
  sh(bin, ["x509", "-in", pemPath, "-outform", "DER", "-out", cerPath]);
  return createSoftwareTestSigner({ privateKey, certificateDer: fs.readFileSync(cerPath) });
}

module.exports = { createLocalTsa, createTestSigner, utcStamp };
