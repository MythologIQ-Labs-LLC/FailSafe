"use strict";
/**
 * G4 (#638) verifier, part 1: who signed, and when the TSA saw it.
 *
 * Key known and trusted, unchanged along the chain, signature valid, RFC 3161
 * token valid for this exact manifest+signature, token time inside the key's
 * certificate window, and the key not revoked at that time.
 */
const fs = require("node:fs");
const { refuse, block, witnessImprint } = require("./bytes.cjs");
const layout = require("./layout.cjs");
const { loadCertificate, verifySignature } = require("./signer.cjs");
const registry = require("./registry.cjs");
const ts = require("./timestamp.cjs");

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_TOKEN_DELAY_MS = 24 * 60 * 60 * 1000;

function checkKey(ctx, m, prev) {
  const fp = m.key.fingerprintSha256;
  const certPath = layout.certPathFor(ctx.repoRoot, fp);
  if (!fs.existsSync(certPath)) throw refuse("KEY_UNKNOWN", `${m.checkpointId}: no committed certificate for ${fp.slice(0, 16)}`);
  const info = loadCertificate(fs.readFileSync(certPath));
  if (info.fingerprint !== fp) throw refuse("KEY_UNKNOWN", `${m.checkpointId}: certificate file does not match its fingerprint`);
  if (ctx.trustFingerprint && fp !== ctx.trustFingerprint) {
    throw refuse("KEY_UNTRUSTED", `${m.checkpointId}: key ${fp.slice(0, 16)} is not the externally pinned key`);
  }
  if (prev && prev.fingerprint !== fp) {
    throw refuse("KEY_RESET", `${m.checkpointId}: key changed from ${prev.fingerprint.slice(0, 16)} without an accepted transition`);
  }
  return info;
}

function checkSignature(m, files, certInfo) {
  if (!verifySignature(files.manifestBytes, files.signatureBytes, certInfo)) {
    throw refuse("SIGNATURE_INVALID", `${m.checkpointId}: signature does not verify against the committed certificate`);
  }
}

function checkToken(ctx, m, files) {
  if (!files.tokenBytes) throw block("TOKEN_MISSING", `${m.checkpointId}: no RFC 3161 token (${layout.FILES.token})`);
  const imprint = witnessImprint(files.manifestBytes, files.signatureBytes);
  const r = ts.verifyToken(ctx.openssl, { imprintHex: imprint, tsrPath: files.tokenPath, caFile: ctx.caFile, untrustedFile: files.chainPath });
  if (!r.ok) {
    const code = /imprint mismatch/i.test(r.out) ? "TOKEN_IMPRINT_MISMATCH" : "TOKEN_INVALID";
    throw refuse(code, `${m.checkpointId}: openssl ts -verify: ${r.out.split(/\r?\n/).slice(-2).join(" | ")}`);
  }
  const info = ts.tokenInfo(ctx.openssl, files.tokenPath);
  if (!info.granted) throw refuse("TOKEN_INVALID", `${m.checkpointId}: token status is not granted`);
  if (info.hashAlgorithm !== "sha256") throw refuse("TOKEN_INVALID", `${m.checkpointId}: token hash is ${info.hashAlgorithm}`);
  if (!info.genTime) throw refuse("TOKEN_INVALID", `${m.checkpointId}: token time unreadable`);
  return { imprint, genTime: info.genTime };
}

function checkTimes(m, certInfo, genTime) {
  const t = Date.parse(genTime);
  const from = Date.parse(certInfo.cert.validFrom);
  const to = Date.parse(certInfo.cert.validTo);
  if (t < from || t > to) {
    throw refuse("KEY_WINDOW", `${m.checkpointId}: token time ${genTime} outside key validity ${certInfo.cert.validFrom} .. ${certInfo.cert.validTo}`);
  }
  const created = Date.parse(m.createdUtc);
  if (created - t > MAX_FUTURE_SKEW_MS || t - created > MAX_TOKEN_DELAY_MS) {
    throw refuse("MANIFEST_TIME", `${m.checkpointId}: createdUtc ${m.createdUtc} is not just before token time ${genTime}`);
  }
}

function checkNotRevoked(ctx, m, genTime) {
  const notice = registry.revocationFor(ctx.currentRegistry, m.key.fingerprintSha256);
  if (notice && Date.parse(genTime) >= Date.parse(notice.effectiveUtc)) {
    throw refuse("KEY_REVOKED", `${m.checkpointId}: key revoked from ${notice.effectiveUtc}; token time ${genTime}`);
  }
  return notice ? `revoked from ${notice.effectiveUtc}; checkpoint predates revocation` : "not revoked";
}

/** All witness checks for one checkpoint. Returns facts the chain step needs. */
function verifyWitness(ctx, m, files, prev) {
  const certInfo = checkKey(ctx, m, prev);
  checkSignature(m, files, certInfo);
  const { imprint, genTime } = checkToken(ctx, m, files);
  checkTimes(m, certInfo, genTime);
  if (prev && Date.parse(genTime) < Date.parse(prev.genTime)) {
    throw refuse("CHAIN_TIME_ORDER", `${m.checkpointId}: token time precedes ${prev.id}`);
  }
  const revocation = checkNotRevoked(ctx, m, genTime);
  return { fingerprint: m.key.fingerprintSha256, imprint, genTime, revocation };
}

module.exports = { verifyWitness };
