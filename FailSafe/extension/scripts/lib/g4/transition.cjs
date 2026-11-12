"use strict";
/**
 * G4 (#638): key transitions (owner item 6).
 *
 * A checkpoint may be signed by a different key than the previous one only
 * through a committed transition record for the previous key:
 *   tools/g4/transitions/<old fingerprint>.json  the record
 *   tools/g4/transitions/<old fingerprint>.sig   ECDSA P-256 signature over it
 *   tools/g4/transitions/<old fingerprint>.tsr   RFC 3161 token over transitionImprint
 *
 * - "rotation": signed by the OLD key, which is not revoked at the record's
 *   token time. Continuity is verified: the old key handed over to the new one.
 * - "recovery": the old key is lost, so the record is signed by the NEW key.
 *   The old key must be revoked no later than the record's token time, and the
 *   verifier accepts the record only when the operator passes its digest,
 *   held offline, with --accept-recovery. Continuity across it is NOT verified,
 *   and every PASS says so.
 *
 * Without a valid record every key change is REFUSED KEY_RESET, as before.
 */
const fs = require("node:fs");
const { refuse, decodeUtf8Strict, isHex64, sha256, taggedImprint } = require("./bytes.cjs");
const { showBlob } = require("./git.cjs");
const layout = require("./layout.cjs");
const registry = require("./registry.cjs");
const { loadCertificate, verifySignature } = require("./signer.cjs");
const { verifyStampBlob } = require("./tsa-trust.cjs");

const SCHEMA = "failsafe-g4-key-transition/v1";
const TRANSITION_TAG = "FailSafe-G4-transition-v1\0";
const KINDS = ["rotation", "recovery"];

function transitionImprint(recordBytes, signatureBytes) {
  return taggedImprint(TRANSITION_TAG, recordBytes, signatureBytes);
}

const invalid = (detail) => refuse("KEY_TRANSITION_INVALID", detail);

function parseRecord(bytes, fromFp) {
  let r;
  try {
    r = JSON.parse(decodeUtf8Strict(bytes, "transition record"));
  } catch (err) {
    throw invalid(`transition record for ${fromFp.slice(0, 16)} is not JSON${err.code ? ` (${err.code})` : ""}`);
  }
  const ok = r && r.schema === SCHEMA && KINDS.includes(r.kind) && r.fromFingerprintSha256 === fromFp
    && isHex64(r.toFingerprintSha256) && /^g4-\d{6}$/.test(r.afterCheckpoint) && isHex64(r.afterCheckpointManifestSha256)
    && typeof r.repository === "string"
    && !Number.isNaN(Date.parse(r.createdUtc));
  if (!ok) throw invalid(`transition record for ${fromFp.slice(0, 16)} has a wrong schema, kind or field`);
  return r;
}

/** The committed record for `fromFp` at HEAD, or null when there is none. */
function readTransition(ctx, fromFp) {
  const p = layout.transitionPaths(fromFp);
  const recordBytes = showBlob(ctx.repoRoot, ctx.head, p.record);
  if (!recordBytes) return null;
  const signatureBytes = showBlob(ctx.repoRoot, ctx.head, p.signature);
  if (!signatureBytes) throw invalid(`${p.signature} is missing`);
  return { record: parseRecord(recordBytes, fromFp), recordBytes, signatureBytes, tokenRel: p.token };
}

function certFor(ctx, fp) {
  const file = layout.certPathFor(ctx.repoRoot, fp);
  if (!fs.existsSync(file)) throw refuse("KEY_UNKNOWN", `no committed certificate for ${fp.slice(0, 16)}`);
  return loadCertificate(fs.readFileSync(file));
}

function checkBinding(t, m, prev) {
  const r = t.record;
  const bound = r.afterCheckpoint === prev.id && r.afterCheckpointManifestSha256 === sha256(prev.manifestBytes);
  if (r.toFingerprintSha256 !== m.key.fingerprintSha256 || !bound || r.repository !== m.manifest.repository) {
    throw invalid(`${m.id}: the transition record for ${prev.fingerprint.slice(0, 16)} names ${r.toFingerprintSha256.slice(0, 16)} after ${r.afterCheckpoint}, not this key after ${prev.id}`);
  }
}

function checkRotation(ctx, t, genTime) {
  const notice = registry.revocationFor(ctx.currentRegistry, t.record.fromFingerprintSha256);
  // genTime has one-second resolution: a revocation anywhere in that second counts as before it.
  if (notice && Date.parse(notice.effectiveUtc) < Date.parse(genTime) + 1000) {
    throw invalid(`rotation away from ${t.record.fromFingerprintSha256.slice(0, 16)} is timestamped ${genTime}, after the key was revoked (${notice.effectiveUtc})`);
  }
  return null;
}

function checkRecovery(ctx, t, genTime, prev) {
  const from = t.record.fromFingerprintSha256;
  const notice = registry.revocationFor(ctx.currentRegistry, from);
  const witnessed = ctx.noticeWitnessed && ctx.noticeWitnessed.get(from);
  // Both the stated effective time and the notice's own token must precede the recovery record (audit #959 N1).
  if (!notice || !witnessed || Date.parse(notice.effectiveUtc) > Date.parse(genTime) || Date.parse(witnessed) > Date.parse(genTime)) {
    throw refuse("KEY_RECOVERY_UNREVOKED", `recovery from ${from.slice(0, 16)} requires that key to be revoked, and the revocation timestamped, no later than the record's token time ${genTime}`);
  }
  const ack = `${prev.id}:${sha256(t.recordBytes)}`;
  if (!(ctx.acceptRecovery || []).includes(ack)) {
    throw refuse("KEY_RECOVERY_UNACKNOWLEDGED", `emergency recovery after ${prev.id} needs --accept-recovery ${ack}, from the owner's offline record`);
  }
  return `emergency key recovery after ${prev.id}: key ${from.slice(0, 16)} -> ${t.record.toFingerprintSha256.slice(0, 16)}; chain continuity across it is NOT verified (accepted by --accept-recovery)`;
}

/**
 * Accept the key change from `prev` to checkpoint `m` (token time `genTime`)
 * or throw. Returns a limitation for an accepted recovery, else null.
 * @param {{id:string, manifest:object, key:{fingerprintSha256:string}}} m
 */
function acceptKeyChange(ctx, m, prev, genTime) {
  const t = readTransition(ctx, prev.fingerprint);
  if (!t) throw refuse("KEY_RESET", `${m.id}: key changed from ${prev.fingerprint.slice(0, 16)} without an accepted transition`);
  checkBinding(t, m, prev);
  const signerFp = t.record.kind === "rotation" ? t.record.fromFingerprintSha256 : t.record.toFingerprintSha256;
  const signerCert = certFor(ctx, signerFp);
  if (!verifySignature(t.recordBytes, t.signatureBytes, signerCert)) {
    throw invalid(`${m.id}: the ${t.record.kind} record is not signed by ${signerFp.slice(0, 16)}`);
  }
  const what = `transition record for ${prev.fingerprint.slice(0, 16)}`;
  const tTime = verifyStampBlob(ctx, { rel: t.tokenRel, imprintHex: transitionImprint(t.recordBytes, t.signatureBytes), what, missingCode: "KEY_TRANSITION_INVALID" });
  if (Date.parse(tTime) < Date.parse(prev.genTime) || Date.parse(tTime) > Date.parse(genTime)) {
    throw invalid(`${what}: token time ${tTime} is not between ${prev.id} (${prev.genTime}) and ${m.id} (${genTime})`);
  }
  const t0 = Date.parse(tTime);
  if (t0 < Date.parse(signerCert.cert.validFrom) || t0 > Date.parse(signerCert.cert.validTo)) {
    throw invalid(`${what}: token time ${tTime} is outside the signing key's certificate window (audit #959 V2)`);
  }
  return t.record.kind === "rotation" ? checkRotation(ctx, t, tTime) : checkRecovery(ctx, t, tTime, prev);
}

module.exports = { SCHEMA, TRANSITION_TAG, transitionImprint, acceptKeyChange };
