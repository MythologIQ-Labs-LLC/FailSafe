"use strict";
/**
 * G4 (#638): create one checkpoint (manifest, signature, RFC 3161 token, TSA chain).
 *
 * The checkpoint is staged in a sibling temp directory and renamed into place
 * only when every artifact exists, so a failure never leaves a partial head.
 */
const fs = require("node:fs");
const path = require("node:path");
const { refuse, block, witnessImprint } = require("./bytes.cjs");
const layout = require("./layout.cjs");
const { buildManifestBytes, parseManifest } = require("./manifest.cjs");
const { loadCertificate, verifySignature } = require("./signer.cjs");
const ts = require("./timestamp.cjs");

/** Raw files of a checkpoint directory; absent files are null. */
function readCheckpointFiles(dir) {
  const read = (name) => {
    const p = path.join(dir, name);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  };
  return {
    manifestBytes: read(layout.FILES.manifest),
    signatureBytes: read(layout.FILES.signature),
    tokenBytes: read(layout.FILES.token),
    tokenPath: path.join(dir, layout.FILES.token),
    chainPath: path.join(dir, layout.FILES.chain),
  };
}

function loadPrevious(checkpointsDir) {
  const all = layout.listCheckpoints(checkpointsDir);
  if (all.length === 0) return { sequence: 1, previous: null };
  const last = all[all.length - 1];
  const f = readCheckpointFiles(last.dir);
  if (!f.manifestBytes || !f.signatureBytes) throw refuse("CHECKPOINT_INCOMPLETE", `${last.id} lacks manifest or signature`);
  const manifest = parseManifest(f.manifestBytes);
  return { sequence: last.sequence + 1, previous: { manifest, manifestBytes: f.manifestBytes, signatureBytes: f.signatureBytes } };
}

function requireCommittedCert(repoRoot, signer) {
  const p = layout.certPathFor(repoRoot, signer.fingerprint);
  if (!fs.existsSync(p)) throw refuse("KEY_UNKNOWN", `no committed certificate ${path.relative(repoRoot, p)}`);
  const info = loadCertificate(fs.readFileSync(p));
  if (info.fingerprint !== signer.fingerprint) throw refuse("KEY_UNKNOWN", "committed certificate differs from signer");
  return info;
}

async function timestampInto(stage, imprintHex, tsa) {
  const bin = ts.requireOpenssl();
  const tsqPath = path.join(stage, layout.FILES.query);
  const tsrPath = path.join(stage, layout.FILES.token);
  ts.buildQuery(bin, imprintHex, tsqPath);
  const tsr = await tsa.request(fs.readFileSync(tsqPath));
  if (!tsr || tsr.length === 0) throw block("TSA_OFFLINE", "the TSA returned no token");
  fs.writeFileSync(tsrPath, tsr);
  const info = ts.tokenInfo(bin, tsrPath);
  if (!info.granted) throw block("TSA_REJECTED", "the TSA did not grant the request");
  ts.extractChain(bin, tsrPath, path.join(stage, layout.FILES.chain));
}

/**
 * Sign, timestamp and persist `manifestBytes` as checkpoint `id`.
 * Exported so tests can model an attacker who holds the key and TSA access.
 */
async function writeSignedCheckpoint({ checkpointsDir, id, manifestBytes, signer, certInfo, tsa }) {
  const signatureBytes = signer.sign(manifestBytes);
  if (!verifySignature(manifestBytes, signatureBytes, certInfo)) throw refuse("SIGNATURE_INVALID", "signer output does not verify");
  const stage = path.join(checkpointsDir, `.staging-${id}-${process.pid}`);
  fs.mkdirSync(stage, { recursive: true });
  try {
    fs.writeFileSync(path.join(stage, layout.FILES.manifest), manifestBytes);
    fs.writeFileSync(path.join(stage, layout.FILES.signature), signatureBytes);
    const imprint = witnessImprint(manifestBytes, signatureBytes);
    await timestampInto(stage, imprint, tsa);
    const dir = path.join(checkpointsDir, id);
    fs.renameSync(stage, dir);
    return { id, dir, imprint };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/**
 * @param {{repoRoot:string, commit:string, repository:string, signer:object,
 *   tsa:{request:(tsq:Buffer)=>Promise<Buffer>}, checkpointsDir?:string, createdUtc?:string}} o
 * @returns {Promise<{id:string, dir:string, imprint:string}>}
 */
async function createCheckpoint(o) {
  const checkpointsDir = o.checkpointsDir || path.join(o.repoRoot, layout.CHECKPOINTS_DIR);
  const certInfo = requireCommittedCert(o.repoRoot, o.signer);
  const { sequence, previous } = loadPrevious(checkpointsDir);
  const manifestBytes = buildManifestBytes({ ...o, sequence, previous, keyFingerprint: o.signer.fingerprint });
  const id = layout.checkpointId(sequence);
  return writeSignedCheckpoint({ checkpointsDir, id, manifestBytes, signer: o.signer, certInfo, tsa: o.tsa });
}

module.exports = { createCheckpoint, writeSignedCheckpoint, readCheckpointFiles, loadPrevious, requireCommittedCert };
