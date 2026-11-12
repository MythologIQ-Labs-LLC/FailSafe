"use strict";
/**
 * G4 (#638): create revocation-notice tokens and key-transition records.
 * OWNER WORKSTATION ONLY for real use; the tests drive it with a local test TSA
 * and software test keys. Nothing here commits. Each output is staged and
 * moved into place only when complete, and an existing output is never
 * replaced.
 */
const fs = require("node:fs");
const path = require("node:path");
const { refuse, block, isHex64 } = require("./bytes.cjs");
const { requireBlob } = require("./git.cjs");
const layout = require("./layout.cjs");
const registry = require("./registry.cjs");
const ts = require("./timestamp.cjs");
const { loadCertificate, verifySignature } = require("./signer.cjs");
const { noticeImprint } = require("./notices.cjs");
const { SCHEMA, transitionImprint } = require("./transition.cjs");

/** Request a granted RFC 3161 token for `imprintHex`; returns its bytes. */
async function requestToken(imprintHex, tsa, stageDir) {
  const bin = ts.requireOpenssl();
  const tsq = path.join(stageDir, "request.tsq");
  const tsr = path.join(stageDir, "reply.tsr");
  ts.buildQuery(bin, imprintHex, tsq);
  const bytes = await tsa.request(fs.readFileSync(tsq));
  if (!bytes || bytes.length === 0) throw block("TSA_OFFLINE", "the TSA returned no token");
  fs.writeFileSync(tsr, bytes);
  if (!ts.tokenInfo(bin, tsr).granted) throw block("TSA_REJECTED", "the TSA did not grant the request");
  return bytes;
}

/** Write `files` ({ rel: bytes }) under repoRoot only if none exists yet, after `make` succeeds. */
async function writeNew(repoRoot, rels, make) {
  for (const rel of rels) if (fs.existsSync(path.join(repoRoot, rel))) throw refuse("RECORD_EXISTS", `${rel} already exists; records are never replaced`);
  const stage = fs.mkdtempSync(path.join(path.dirname(path.join(repoRoot, layout.REGISTRY_PATH)), ".g4-stage-"));
  try {
    const out = await make(stage);
    for (const [rel, bytes] of Object.entries(out)) {
      fs.mkdirSync(path.dirname(path.join(repoRoot, rel)), { recursive: true });
      fs.writeFileSync(path.join(repoRoot, rel), bytes);
    }
    return Object.keys(out);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** Timestamp the registry version committed at `commit` (default HEAD). */
async function stampRegistry({ repoRoot, tsa, commit = "HEAD" }) {
  const bytes = requireBlob(repoRoot, commit, layout.REGISTRY_PATH, "REGISTRY_MISSING");
  const { version } = registry.parse(bytes);
  if (version < 2) throw refuse("REGISTRY_UNCHANGED", "registry version 1 needs no notice token");
  const rel = layout.noticeTokenPath(version);
  return writeNew(repoRoot, [rel], async (stage) => ({ [rel]: await requestToken(noticeImprint(bytes), tsa, stage) }));
}

/**
 * Write a transition record for the key `fromFingerprint`, signed by `signer`
 * (the old key for "rotation", the new key for "recovery"), and timestamp it.
 */
async function writeTransition({ repoRoot, kind, fromFingerprint, toFingerprint, afterCheckpoint, repository, signer, tsa, createdUtc }) {
  if (!isHex64(fromFingerprint) || !isHex64(toFingerprint)) throw refuse("TRANSITION_INPUT", "fingerprints must be 64 lowercase hex");
  const expected = kind === "rotation" ? fromFingerprint : toFingerprint;
  if (signer.fingerprint !== expected) throw refuse("TRANSITION_INPUT", `a ${kind} record must be signed by ${expected.slice(0, 16)}`);
  const record = { schema: SCHEMA, kind, repository, fromFingerprintSha256: fromFingerprint, toFingerprintSha256: toFingerprint,
    afterCheckpoint, createdUtc: createdUtc || new Date().toISOString() };
  const recordBytes = Buffer.from(JSON.stringify(record, null, 2) + "\n");
  const signatureBytes = signer.sign(recordBytes);
  if (!verifySignature(recordBytes, signatureBytes, loadCertificate(signer.certificateDer))) throw refuse("SIGNATURE_INVALID", "signer output does not verify");
  const p = layout.transitionPaths(fromFingerprint);
  return writeNew(repoRoot, [p.record, p.signature, p.token], async (stage) => ({
    [p.record]: recordBytes,
    [p.signature]: signatureBytes,
    [p.token]: await requestToken(transitionImprint(recordBytes, signatureBytes), tsa, stage),
  }));
}

module.exports = { requestToken, stampRegistry, writeTransition };
