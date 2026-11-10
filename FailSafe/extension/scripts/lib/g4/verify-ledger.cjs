"use strict";
/**
 * G4 (#638) verifier, part 2: what was attested.
 *
 * The named commit exists and is reachable from HEAD, the complete committed
 * ledger blob matches the manifest, every earlier checkpoint's ledger is a
 * byte-for-byte prefix of this one (read from Git at the earlier commit, not
 * from the manifest), and the registry and gap statement match their digests.
 */
const { refuse, sha256 } = require("./bytes.cjs");
const { requireBlob, resolveCommit, isAncestor } = require("./git.cjs");
const layout = require("./layout.cjs");
const { ledgerFacts } = require("./manifest.cjs");
const registry = require("./registry.cjs");

function checkCommit(ctx, m, prev) {
  if (resolveCommit(ctx.repoRoot, m.commit) !== m.commit) throw refuse("COMMIT_MISSING", `${m.checkpointId}: commit ${m.commit} not in repository`);
  if (!isAncestor(ctx.repoRoot, m.commit, ctx.head)) throw refuse("COMMIT_UNREACHABLE", `${m.checkpointId}: ${m.commit.slice(0, 12)} is not an ancestor of HEAD`);
  if (prev && !isAncestor(ctx.repoRoot, prev.manifest.commit, m.commit)) {
    throw refuse("CHAIN_COMMIT_ORDER", `${m.checkpointId}: previous checkpoint commit is not an ancestor`);
  }
}

function checkLedger(ctx, m) {
  if (m.ledger.path !== layout.LEDGER_PATH) throw refuse("LEDGER_PATH", `${m.checkpointId}: ledger path ${m.ledger.path}`);
  const buf = requireBlob(ctx.repoRoot, m.commit, m.ledger.path, "LEDGER_MISSING");
  const facts = ledgerFacts(buf);
  for (const k of ["sha256", "byteLength", "entryCount", "lastEntryNumber"]) {
    if (facts[k] !== m.ledger[k]) throw refuse("LEDGER_MISMATCH", `${m.checkpointId}: ledger ${k} is ${facts[k]}, manifest says ${m.ledger[k]}`);
  }
  return buf;
}

function checkGenesis(m, ledgerBuf) {
  if (m.sequence !== 1 || m.previousCheckpoint.genesis !== layout.GENESIS_MARKER || m.previousLedger !== null) {
    throw refuse("GENESIS_MISPLACED", `${m.checkpointId}: only sequence 1 may carry the genesis marker, and it must`);
  }
  if (!ledgerBuf.includes(Buffer.from(layout.GENESIS_EPOCH_HEADING, "utf8"))) {
    throw refuse("GENESIS_EPOCH_MISSING", `${m.checkpointId}: ledger lacks "${layout.GENESIS_EPOCH_HEADING}"`);
  }
}

function checkLink(m, prev) {
  const pc = m.previousCheckpoint;
  const ok = pc.checkpointId === prev.id && pc.manifestSha256 === sha256(prev.manifestBytes) && pc.witnessImprint === prev.imprint;
  if (!ok) throw refuse("CHAIN_BROKEN", `${m.checkpointId}: previousCheckpoint does not name ${prev.id} exactly`);
}

function checkPrefix(ctx, m, ledgerBuf, prev) {
  const pl = m.previousLedger;
  const want = prev.manifest.ledger;
  if (!pl || pl.commit !== prev.manifest.commit || pl.byteLength !== want.byteLength || pl.sha256 !== want.sha256) {
    throw refuse("CHAIN_BROKEN", `${m.checkpointId}: previousLedger does not restate ${prev.id}'s ledger`);
  }
  const prevBuf = requireBlob(ctx.repoRoot, pl.commit, want.path, "LEDGER_MISSING");
  if (sha256(prevBuf) !== want.sha256) throw refuse("LEDGER_MISMATCH", `${prev.id}: ledger at ${pl.commit.slice(0, 12)} changed`);
  const head = ledgerBuf.subarray(0, prevBuf.length);
  if (ledgerBuf.length < prevBuf.length || !head.equals(prevBuf)) {
    throw refuse("PREFIX_BROKEN", `${m.checkpointId}: first ${prevBuf.length} bytes differ from the ledger at ${prev.id}`);
  }
  if (!pl.prefixOfNew || pl.prefixOfNew.byteLength !== prevBuf.length || pl.prefixOfNew.sha256 !== sha256(head)) {
    throw refuse("PREFIX_BROKEN", `${m.checkpointId}: prefixOfNew evidence does not match the real bytes`);
  }
}

function checkBoundFiles(ctx, m, prev) {
  const reg = requireBlob(ctx.repoRoot, m.commit, layout.REGISTRY_PATH, "REGISTRY_MISSING");
  const parsed = registry.parse(reg);
  if (sha256(reg) !== m.revocationRegistry.sha256 || parsed.version !== m.revocationRegistry.version) {
    throw refuse("REGISTRY_MISMATCH", `${m.checkpointId}: registry at commit differs from the bound digest/version`);
  }
  if (prev) registry.assertMonotonic(prev.registryBytes, reg, `${prev.id} -> ${m.checkpointId}`);
  const gap = requireBlob(ctx.repoRoot, m.commit, layout.GAP_STATEMENT_PATH, "GAP_STATEMENT_MISSING");
  if (sha256(gap) !== m.historicalGapStatement.sha256) throw refuse("GAP_STATEMENT_MISMATCH", `${m.checkpointId}: gap statement changed`);
  return reg;
}

/** All ledger/continuity checks for one checkpoint. */
function verifyLedger(ctx, m, prev) {
  checkCommit(ctx, m, prev);
  const ledgerBuf = checkLedger(ctx, m);
  if (!prev) checkGenesis(m, ledgerBuf);
  else {
    checkLink(m, prev);
    checkPrefix(ctx, m, ledgerBuf, prev);
  }
  return { registryBytes: checkBoundFiles(ctx, m, prev) };
}

module.exports = { verifyLedger };
