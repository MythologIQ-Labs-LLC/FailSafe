"use strict";
/**
 * G4 (#638) verifier, part 1: who signed, and when the TSA saw it.
 *
 * Key known; the genesis key equal to the externally pinned one; every later
 * key the same as the previous one or reached through an accepted transition
 * record (transition.cjs); signature valid; RFC 3161 token valid at its own
 * time for this exact manifest+signature (tsa-trust.cjs); token time inside
 * the key's certificate window; and the key not revoked at that time.
 */
const fs = require("node:fs");
const { refuse, block, witnessImprint } = require("./bytes.cjs");
const layout = require("./layout.cjs");
const { loadCertificate, verifySignature } = require("./signer.cjs");
const registry = require("./registry.cjs");
const { verifyStamp } = require("./tsa-trust.cjs");
const { acceptKeyChange } = require("./transition.cjs");

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_TOKEN_DELAY_MS = 24 * 60 * 60 * 1000;

function checkKey(ctx, m, prev) {
  const fp = m.key.fingerprintSha256;
  const certPath = layout.certPathFor(ctx.repoRoot, fp);
  if (!fs.existsSync(certPath)) throw refuse("KEY_UNKNOWN", `${m.checkpointId}: no committed certificate for ${fp.slice(0, 16)}`);
  const info = loadCertificate(fs.readFileSync(certPath));
  if (info.fingerprint !== fp) throw refuse("KEY_UNKNOWN", `${m.checkpointId}: certificate file does not match its fingerprint`);
  if (!prev && ctx.trustFingerprint && fp !== ctx.trustFingerprint) {
    throw refuse("KEY_UNTRUSTED", `${m.checkpointId}: genesis key ${fp.slice(0, 16)} is not the externally pinned key`);
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
  const genTime = verifyStamp(ctx, { imprintHex: imprint, tsrPath: files.tokenPath, chainPath: files.chainPath, what: m.checkpointId });
  return { imprint, genTime };
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
  const changed = prev && prev.fingerprint !== m.key.fingerprintSha256;
  const limitation = changed ? acceptKeyChange(ctx, { id: m.checkpointId, manifest: m, key: m.key }, prev, genTime) : null;
  const revocation = checkNotRevoked(ctx, m, genTime);
  return { fingerprint: m.key.fingerprintSha256, imprint, genTime, revocation, limitation };
}

module.exports = { verifyWitness };
