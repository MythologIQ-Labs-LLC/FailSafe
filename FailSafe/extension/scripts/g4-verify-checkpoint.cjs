#!/usr/bin/env node
/**
 * G4 ledger witness verifier (#638).
 *
 *   node FailSafe/extension/scripts/g4-verify-checkpoint.cjs [--repo-root <dir>]
 *     [--trust-fingerprint <sha256 of the owner certificate, pinned out of band>]
 *     [--trusted-head <g4-NNNNNN>:<manifest sha256, retained out of band>]
 *     [--tsa-ca <PEM file of trusted TSA roots; overrides tools/g4/tsa-policy.json>]
 *     [--repository <owner/name>] [--commit <qualified commit sha>]
 *     [--checkpoints <dir>] [--release] [--json]
 *
 * --release is the only mode that counts as release evidence. It is BLOCKED
 * unless --trust-fingerprint, --trusted-head, --repository and --commit are all
 * given and well formed, HEAD is exactly --commit, and the checkout is clean
 * (no modified or untracked file; no ignored file under tools/g4). It refuses
 * the --tsa-ca and --checkpoints overrides.
 *
 * --tsa-ca is a test/diagnostic override: a PASS under it carries the
 * limitation "NOT a release verification". Unexpected errors are BLOCKED
 * INTERNAL_ERROR.
 *
 * Walks tools/g4/checkpoints from genesis to head and checks, for each:
 * manifest bytes and schema; signature against the committed certificate;
 * the RFC 3161 token (openssl ts -verify) for the length-framed imprint; token
 * time inside the key window; key unchanged, known, pinned and not revoked;
 * previous-checkpoint links; byte-prefix continuity against the real ledger
 * blob at every commit (git show); the registry and gap-statement digests;
 * monotonic revocation history. Exit 0 PASS, 1 REFUSED, 2 BLOCKED.
 */
"use strict";

const path = require("node:path");
const { verifyCheckpoints } = require("./lib/g4/verify.cjs");

const FLAGS = {
  "--repo-root": "repoRoot",
  "--checkpoints": "checkpointsDir",
  "--trust-fingerprint": "trustFingerprint",
  "--trusted-head": "trustedHead",
  "--tsa-ca": "tsaCaFile",
  "--repository": "repository",
  "--commit": "expectedCommit",
};

/** The value after flag `i`. A missing value or another flag is an error, never a value. */
function valueOf(argv, i) {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`${argv[i]} needs a value`);
  return v;
}

const MODE_LINE = { release: "release", diagnostic: "diagnostic (NOT release evidence)" };

function parseArgs(argv) {
  const o = { repoRoot: path.resolve(__dirname, "..", "..", ".."), json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--json") o.json = true;
    else if (argv[i] === "--release") o.release = true;
    else if (FLAGS[argv[i]]) o[FLAGS[argv[i]]] = valueOf(argv, i++);
    else throw new Error(`unknown or incomplete argument: ${argv[i]}`);
  }
  return o;
}

function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`[g4-verify] ${err.message}\n`);
    return 2;
  }
  const r = verifyCheckpoints(o);
  if (o.json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  else {
    for (const c of r.checkpoints) process.stdout.write(`[g4-verify] ok ${c.id} commit ${c.commit.slice(0, 12)} ledger ${c.ledgerBytes} B token ${c.genTime} (${c.revocation})\n`);
    process.stdout.write(`[g4-verify] mode: ${MODE_LINE[r.mode]}\n`);
    for (const l of r.limitations) process.stdout.write(`[g4-verify] limitation: ${l}\n`);
    process.stdout.write(`[g4-verify] ${r.verdict} ${r.code}: ${r.detail}\n`);
  }
  return { PASS: 0, REFUSED: 1 }[r.verdict] ?? 2;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, parseArgs };
