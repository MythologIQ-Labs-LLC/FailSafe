"use strict";
/**
 * G4 (#638): repository layout and checkpoint file names. One definition,
 * shared by the builder, the verifier and the tests.
 */
const fs = require("node:fs");
const path = require("node:path");

const LEDGER_PATH = "docs/META_LEDGER.md";
const REGISTRY_PATH = "tools/g4/revocations.json";
const GAP_STATEMENT_PATH = "tools/g4/HISTORICAL_GAPS.md";
const TSA_POLICY_PATH = "tools/g4/tsa-policy.json";
const KEYS_DIR = "tools/g4/keys";
const CHECKPOINTS_DIR = "tools/g4/checkpoints";
const GENESIS_MARKER = "after clean epoch #914";
const GENESIS_EPOCH_HEADING = "### Entry #914: EPOCH";
const MANIFEST_SCHEMA = "failsafe-g4-checkpoint-manifest/v1";

const FILES = Object.freeze({
  manifest: "manifest.json",
  signature: "manifest.sig",
  query: "timestamp.tsq",
  token: "timestamp.tsr",
  chain: "tsa-chain.pem",
});

const ID_RE = /^g4-(\d{6})$/;

function checkpointId(sequence) {
  return `g4-${String(sequence).padStart(6, "0")}`;
}

/** Checkpoint directories sorted by sequence, as { id, sequence, dir }. */
function listCheckpoints(checkpointsDir) {
  if (!fs.existsSync(checkpointsDir)) return [];
  return fs
    .readdirSync(checkpointsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && ID_RE.test(e.name))
    .map((e) => ({ id: e.name, sequence: Number(ID_RE.exec(e.name)[1]), dir: path.join(checkpointsDir, e.name) }))
    .sort((a, b) => a.sequence - b.sequence);
}

function certPathFor(repoRoot, fingerprint) {
  return path.join(repoRoot, KEYS_DIR, `${fingerprint}.cer`);
}

module.exports = {
  LEDGER_PATH,
  REGISTRY_PATH,
  GAP_STATEMENT_PATH,
  TSA_POLICY_PATH,
  KEYS_DIR,
  CHECKPOINTS_DIR,
  GENESIS_MARKER,
  GENESIS_EPOCH_HEADING,
  MANIFEST_SCHEMA,
  FILES,
  checkpointId,
  listCheckpoints,
  certPathFor,
};
