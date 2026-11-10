"use strict";
/**
 * G4 (#638): checkpoint manifest builder and strict reader.
 *
 * The manifest is UTF-8 JSON. Its exact persisted bytes are what is hashed,
 * signed, timestamped and verified. `buildManifestBytes` is the only place
 * that serializes; the verifier only parses bytes it hashed first.
 */
const { sha256, refuse, decodeUtf8Strict, isHex64, witnessImprint } = require("./bytes.cjs");
const { requireBlob, resolveCommit } = require("./git.cjs");
const layout = require("./layout.cjs");
const registry = require("./registry.cjs");

const ENTRY_RE = /^### Entry #(\d+)/gm;

/** Digest, length and entry statistics of complete ledger bytes. */
function ledgerFacts(buf) {
  const text = decodeUtf8Strict(buf, "ledger");
  const numbers = [...text.matchAll(ENTRY_RE)].map((m) => Number(m[1]));
  return {
    sha256: sha256(buf),
    byteLength: buf.length,
    entryCount: numbers.length,
    lastEntryNumber: numbers.length ? numbers[numbers.length - 1] : null,
  };
}

function previousFields(prev, ledgerBuf) {
  if (!prev) return { previousCheckpoint: { genesis: layout.GENESIS_MARKER }, previousLedger: null };
  const pl = prev.manifest.ledger;
  const prefix = ledgerBuf.subarray(0, pl.byteLength);
  if (ledgerBuf.length < pl.byteLength || sha256(prefix) !== pl.sha256) {
    throw refuse("PREFIX_BROKEN", `new ledger does not begin with the ${pl.byteLength} bytes of ${prev.manifest.checkpointId}`);
  }
  return {
    previousCheckpoint: {
      checkpointId: prev.manifest.checkpointId,
      manifestSha256: sha256(prev.manifestBytes),
      witnessImprint: witnessImprint(prev.manifestBytes, prev.signatureBytes),
    },
    previousLedger: {
      commit: prev.manifest.commit,
      byteLength: pl.byteLength,
      sha256: pl.sha256,
      prefixOfNew: { byteLength: prefix.length, sha256: sha256(prefix) },
    },
  };
}

/**
 * @param {{repoRoot:string, commit:string, repository:string, sequence:number,
 *   previous?:{manifest:object, manifestBytes:Buffer, signatureBytes:Buffer}|null,
 *   keyFingerprint:string, createdUtc?:string, ledgerPath?:string}} o
 * @returns {Buffer} the exact manifest bytes to persist
 */
function buildManifestBytes(o) {
  const commit = resolveCommit(o.repoRoot, o.commit);
  if (!commit) throw refuse("COMMIT_MISSING", `${o.commit} is not a commit in ${o.repoRoot}`);
  const ledgerPath = o.ledgerPath || layout.LEDGER_PATH;
  const ledgerBuf = requireBlob(o.repoRoot, commit, ledgerPath, "LEDGER_MISSING");
  const regBuf = requireBlob(o.repoRoot, commit, layout.REGISTRY_PATH, "REGISTRY_MISSING");
  const gapBuf = requireBlob(o.repoRoot, commit, layout.GAP_STATEMENT_PATH, "GAP_STATEMENT_MISSING");
  const manifest = {
    schema: layout.MANIFEST_SCHEMA,
    checkpointId: layout.checkpointId(o.sequence),
    sequence: o.sequence,
    repository: o.repository,
    commit,
    ledger: { path: ledgerPath, ...ledgerFacts(ledgerBuf) },
    ...previousFields(o.previous, ledgerBuf),
    revocationRegistry: { path: layout.REGISTRY_PATH, sha256: sha256(regBuf), version: registry.parse(regBuf).version },
    historicalGapStatement: { path: layout.GAP_STATEMENT_PATH, sha256: sha256(gapBuf) },
    key: { fingerprintSha256: o.keyFingerprint, algorithm: "ECDSA-P256-SHA256", signatureEncoding: "ieee-p1363" },
    createdUtc: o.createdUtc || new Date().toISOString(),
  };
  return Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function requireShape(cond, detail) {
  if (!cond) throw refuse("MANIFEST_MALFORMED", detail);
}

/** Parse manifest bytes (already hashed by the caller); never reserialize. */
function parseManifest(bytes) {
  let m;
  try {
    m = JSON.parse(decodeUtf8Strict(bytes, "manifest"));
  } catch (err) {
    if (err && err.code) throw err;
    throw refuse("MANIFEST_MALFORMED", "manifest is not JSON");
  }
  requireShape(m && m.schema === layout.MANIFEST_SCHEMA, "unknown manifest schema");
  requireShape(Number.isInteger(m.sequence) && m.checkpointId === layout.checkpointId(m.sequence), "checkpoint id/sequence");
  requireShape(/^[0-9a-f]{40}$/.test(m.commit || ""), "commit is not a full SHA");
  requireShape(m.ledger && isHex64(m.ledger.sha256) && Number.isInteger(m.ledger.byteLength), "ledger fields");
  requireShape(m.revocationRegistry && isHex64(m.revocationRegistry.sha256), "registry fields");
  requireShape(m.historicalGapStatement && isHex64(m.historicalGapStatement.sha256), "gap statement fields");
  requireShape(m.key && isHex64(m.key.fingerprintSha256), "key fingerprint");
  requireShape(m.key.algorithm === "ECDSA-P256-SHA256" && m.key.signatureEncoding === "ieee-p1363", "key algorithm/encoding");
  requireShape(typeof m.repository === "string" && m.repository.length > 0, "repository");
  requireShape(!Number.isNaN(Date.parse(m.createdUtc)), "createdUtc");
  requireShape(m.previousCheckpoint && typeof m.previousCheckpoint === "object", "previousCheckpoint");
  return m;
}

module.exports = { ledgerFacts, buildManifestBytes, parseManifest };
