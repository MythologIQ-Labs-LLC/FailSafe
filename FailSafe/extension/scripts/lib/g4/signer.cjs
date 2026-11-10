"use strict";
/**
 * G4 (#638): pluggable checkpoint signers and signature verification.
 *
 * A signer is { kind, fingerprint, certificateDer, sign(manifestBytes) -> Buffer }.
 * Signatures are ECDSA P-256 over SHA-256(manifest bytes), IEEE P1363 (r||s,
 * 64 bytes): what .NET `ECDsaCng.SignHash` returns.
 *
 * - `createSoftwareTestSigner` is for tests only. Its key lives in memory.
 * - `createTpmSigner` calls `tools/g4/sign-checkpoint.ps1`, which opens a named
 *   key in the Microsoft Platform Crypto Provider. No key is created here.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { refuse } = require("./bytes.cjs");

const SIG_OPTS = { dsaEncoding: "ieee-p1363" };

function certFingerprint(certDer) {
  return crypto.createHash("sha256").update(certDer).digest("hex");
}

/** Parse a committed certificate (DER or PEM) and refuse anything but P-256. */
function loadCertificate(buf) {
  let cert;
  try {
    cert = new crypto.X509Certificate(buf);
  } catch {
    throw refuse("KEY_CERT_MALFORMED", "certificate does not parse");
  }
  const key = cert.publicKey;
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails.namedCurve !== "prime256v1") {
    throw refuse("KEY_ALGORITHM", "certificate key is not ECDSA P-256");
  }
  return { cert, der: cert.raw, fingerprint: certFingerprint(cert.raw) };
}

function verifySignature(manifestBytes, signatureBytes, certInfo) {
  if (signatureBytes.length !== 64) return false;
  return crypto.verify("sha256", manifestBytes, { key: certInfo.cert.publicKey, ...SIG_OPTS }, signatureBytes);
}

/** TEST ONLY: an in-memory P-256 key plus a certificate made for it by the test. */
function createSoftwareTestSigner({ privateKey, certificateDer }) {
  const info = loadCertificate(certificateDer);
  return {
    kind: "software-test",
    fingerprint: info.fingerprint,
    certificateDer: info.der,
    sign: (manifestBytes) => crypto.sign("sha256", manifestBytes, { key: privateKey, ...SIG_OPTS }),
  };
}

/**
 * The TPM signer. `keyName` is the CNG key container name chosen at enrollment.
 * Written for the owner-approved procedure; not exercised against a real key here.
 */
function createTpmSigner({ keyName, certificatePath, scriptPath, powershell = "powershell.exe" }) {
  const info = loadCertificate(fs.readFileSync(certificatePath));
  return {
    kind: "tpm-platform-crypto-provider",
    fingerprint: info.fingerprint,
    certificateDer: info.der,
    sign(manifestBytes) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g4-sign-"));
      try {
        return runTpmScript({ dir, manifestBytes, keyName, certificatePath, scriptPath, powershell });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

function runTpmScript(o) {
  const manifestPath = path.join(o.dir, "manifest.json");
  const sigPath = path.join(o.dir, "manifest.sig");
  fs.writeFileSync(manifestPath, o.manifestBytes);
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", o.scriptPath,
    "-ManifestPath", manifestPath, "-SignaturePath", sigPath, "-KeyName", o.keyName, "-CertificatePath", o.certificatePath];
  const res = spawnSync(o.powershell, args, { encoding: "utf8", windowsHide: true });
  if (res.status !== 0 || !fs.existsSync(sigPath)) {
    throw refuse("SIGNER_FAILED", `sign-checkpoint.ps1 exit ${res.status}: ${(res.stderr || res.stdout || "").trim()}`);
  }
  return fs.readFileSync(sigPath);
}

module.exports = { certFingerprint, loadCertificate, verifySignature, createSoftwareTestSigner, createTpmSigner };
