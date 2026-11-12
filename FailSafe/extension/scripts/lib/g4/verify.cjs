"use strict";
/**
 * G4 (#638) verifier: walk every checkpoint from genesis to head.
 *
 * Fails closed at the first problem. The result is
 *   { verdict: "PASS"|"REFUSED"|"BLOCKED", code, mode: "release"|"diagnostic", detail,
 *     checkpoints, limitations }.
 * A PASS without an externally trusted head is reported as such: deletion of
 * the newest checkpoints together with the newest ledger tail is not
 * detectable from the repository alone.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { refuse, block, sha256, G4Refusal } = require("./bytes.cjs");
const { requireBlob, resolveCommit, assertCompleteHistory } = require("./git.cjs");
const layout = require("./layout.cjs");
const { readCheckpointFiles } = require("./checkpoint.cjs");
const { parseManifest } = require("./manifest.cjs");
const registry = require("./registry.cjs");
const ts = require("./timestamp.cjs");
const { POLICY_SCHEMA, buildTrust } = require("./tsa-trust.cjs");
const { verifyNotices } = require("./notices.cjs");
const { verifyWitness } = require("./verify-witness.cjs");
const { verifyLedger } = require("./verify-ledger.cjs");
const { assertReleasePreconditions } = require("./release-mode.cjs");

function buildContext(o, tmpDir) {
  const repoRoot = path.resolve(o.repoRoot);
  const head = resolveCommit(repoRoot, "HEAD");
  if (!head) throw block("REPO_UNREADABLE", `${repoRoot} has no HEAD commit`);
  assertCompleteHistory(repoRoot);
  assertReleasePreconditions(o, repoRoot, head);
  const currentRegistry = requireBlob(repoRoot, head, layout.REGISTRY_PATH, "REGISTRY_MISSING");
  registry.parse(currentRegistry);
  registry.assertGitHistoryMonotonic(repoRoot, layout.REGISTRY_PATH);
  const openssl = ts.requireOpenssl();
  const ctx = {
    repoRoot,
    head,
    tmpDir,
    currentRegistry,
    checkpointsDir: o.checkpointsDir || path.join(repoRoot, layout.CHECKPOINTS_DIR),
    trustFingerprint: o.trustFingerprint || null,
    expectedRepository: o.repository || null,
    acceptRecovery: o.acceptRecovery || [],
    openssl,
  };
  const trust = buildTrust({ repoRoot, head, bin: openssl, tmpDir, overrideCaFile: o.tsaCaFile });
  ctx.caFile = trust.file;
  ctx.archive = trust.archive;
  ctx.noticeWitnessed = verifyNotices(ctx);
  return ctx;
}

function verifyOne(ctx, entry, prev) {
  const files = readCheckpointFiles(entry.dir);
  if (!files.manifestBytes || !files.signatureBytes) throw refuse("CHECKPOINT_INCOMPLETE", `${entry.id}: manifest or signature missing`);
  const m = parseManifest(files.manifestBytes);
  if (m.checkpointId !== entry.id) throw refuse("MANIFEST_ID_MISMATCH", `${entry.id} holds manifest ${m.checkpointId}`);
  const repo = prev ? prev.manifest.repository : ctx.expectedRepository;
  if (repo && m.repository !== repo) throw refuse("REPOSITORY_MISMATCH", `${entry.id} names repository ${m.repository}, expected ${repo}`);
  const w = verifyWitness(ctx, m, files, prev);
  const l = verifyLedger(ctx, m, prev);
  return { id: m.checkpointId, manifest: m, manifestBytes: files.manifestBytes, ...w, ...l };
}

function checkSequence(entries) {
  if (entries.length === 0) throw block("NO_CHECKPOINTS", "no checkpoints to verify");
  entries.forEach((e, i) => {
    if (e.sequence !== i + 1) throw refuse("CHECKPOINT_GAP", `expected ${layout.checkpointId(i + 1)}, found ${e.id}`);
  });
}

/** The ledger at HEAD must still begin with the bytes the newest checkpoint attested. */
function checkHeadLedger(ctx, last) {
  const headLedger = requireBlob(ctx.repoRoot, ctx.head, last.manifest.ledger.path, "LEDGER_MISSING");
  const attested = requireBlob(ctx.repoRoot, last.manifest.commit, last.manifest.ledger.path, "LEDGER_MISSING");
  if (headLedger.length < attested.length || !headLedger.subarray(0, attested.length).equals(attested)) {
    throw refuse("PREFIX_BROKEN", `HEAD ledger does not begin with the ${attested.length} bytes attested by ${last.id}`);
  }
}

const UNANCHORED = "checkpoint head is not externally anchored; truncation of the newest checkpoints and ledger tail is undetectable";
const OVERRIDE = "--tsa-ca override in use: TSA trust did not come from the committed policy; NOT a release verification";

function checkHead(ctx, last, o) {
  registry.assertMonotonic(last.registryBytes, ctx.currentRegistry, `${last.id} -> HEAD registry`);
  checkHeadLedger(ctx, last);
  const notes = o.tsaCaFile ? [OVERRIDE] : [];
  if (!o.trustedHead) return [...notes, UNANCHORED];
  const [id, digest] = o.trustedHead.split(":");
  if (last.id !== id || sha256(last.manifestBytes) !== digest) {
    throw refuse("HEAD_MISMATCH", `trusted head ${o.trustedHead} but repository head is ${last.id}:${sha256(last.manifestBytes)}`);
  }
  return notes;
}

/** Unexpected errors are BLOCKED with a one-line reason, never a stack trace. */
function firstLine(err) {
  const msg = err && err.message ? err.message : String(err);
  return `unexpected error: ${msg.split(/\r?\n/)[0]}`;
}

function summarize(s) {
  return { id: s.id, commit: s.manifest.commit, ledgerBytes: s.manifest.ledger.byteLength, genTime: s.genTime, revocation: s.revocation };
}

/**
 * @param {{repoRoot:string, checkpointsDir?:string, trustFingerprint?:string,
 *   trustedHead?:string, tsaCaFile?:string, repository?:string, release?:boolean,
 *   expectedCommit?:string, acceptRecovery?:string[]}} o
 */
function verifyCheckpoints(o) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "g4-verify-"));
  const done = [];
  const mode = o.release ? "release" : "diagnostic";
  try {
    const ctx = buildContext(o, tmpDir);
    const entries = layout.listCheckpoints(ctx.checkpointsDir);
    checkSequence(entries);
    let prev = null;
    const recoveries = [];
    for (const e of entries) {
      prev = verifyOne(ctx, e, prev);
      done.push(summarize(prev));
      if (prev.limitation) recoveries.push(prev.limitation);
    }
    const limitations = [...recoveries, ...checkHead(ctx, prev, o)];
    return { verdict: "PASS", code: "OK", mode, detail: `${done.length} checkpoint(s) verified to ${prev.id}`, checkpoints: done, limitations };
  } catch (err) {
    const r = err instanceof G4Refusal ? err : block("INTERNAL_ERROR", firstLine(err));
    return { verdict: r.verdict, code: r.code, mode, detail: r.detail, checkpoints: done, limitations: [] };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { verifyCheckpoints, POLICY_SCHEMA };
