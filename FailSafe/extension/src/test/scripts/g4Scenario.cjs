"use strict";
/**
 * G4 (#638) TEST ONLY: disposable Git repositories for the falsification suite.
 *
 * The ledger is a copy of the real committed `docs/META_LEDGER.md` blob,
 * written into a temp repository. The live ledger is never modified.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const { createCheckpoint, writeSignedCheckpoint, loadPrevious } = require("../../../scripts/lib/g4/checkpoint.cjs");
const { ledgerFacts } = require("../../../scripts/lib/g4/manifest.cjs");
const { loadCertificate } = require("../../../scripts/lib/g4/signer.cjs");
const { verifyCheckpoints, POLICY_SCHEMA } = require("../../../scripts/lib/g4/verify.cjs");
const { sha256, witnessImprint } = require("../../../scripts/lib/g4/bytes.cjs");
const { createLocalTsa, createTestSigner } = require("./g4TestPki.cjs");

const REAL_REPO = path.resolve(__dirname, "..", "..", "..", "..", "..");
const ROOT_PEM_PATH = "tools/g4/tsa-roots/g4-test-only-root.pem";

function git(dir, ...args) {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function realLedgerBlob() {
  const r = spawnSync("git", ["-C", REAL_REPO, "show", `HEAD:${layout.LEDGER_PATH}`], { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("cannot read the real ledger blob");
  return r.stdout;
}

function registryBytes(version, revocations = []) {
  return Buffer.from(JSON.stringify({ schema: "failsafe-g4-revocations/v1", version, revocations }, null, 2) + "\n");
}

function write(dir, rel, bytes) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), bytes);
}

function commitAll(dir, msg) {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", msg);
  return git(dir, "rev-parse", "HEAD");
}

function entryText(n) {
  return `\n### Entry #${n}: TEST - G4 falsification fixture\n\n**Verdict**: PASS\n\n**Decision**: test-only appended entry ${n}.\n\n---\n`;
}

function appendEntry(dir, n) {
  fs.appendFileSync(path.join(dir, layout.LEDGER_PATH), entryText(n));
}

function initRepo(dir, tsa, signer) {
  git(dir, "init", "-q");
  for (const [k, v] of [["core.autocrlf", "false"], ["user.name", "g4-test"], ["user.email", "g4-test@invalid"], ["commit.gpgsign", "false"]]) git(dir, "config", k, v);
  write(dir, layout.LEDGER_PATH, realLedgerBlob());
  write(dir, layout.REGISTRY_PATH, registryBytes(1));
  write(dir, layout.GAP_STATEMENT_PATH, Buffer.from("TEST historical gap statement\n"));
  write(dir, ROOT_PEM_PATH, tsa.rootPem);
  const rootSha = sha256(new crypto.X509Certificate(tsa.rootPem).raw);
  const policy = { schema: POLICY_SCHEMA, status: "selected", trustedRoots: [{ name: "G4 TEST ONLY root", certificatePath: ROOT_PEM_PATH, sha256: rootSha }] };
  write(dir, layout.TSA_POLICY_PATH, Buffer.from(JSON.stringify(policy, null, 2) + "\n"));
  addKey(dir, signer);
  return commitAll(dir, "test: base");
}

function addKey(dir, signer) {
  write(dir, path.posix.join(layout.KEYS_DIR, `${signer.fingerprint}.cer`), signer.certificateDer);
}

/** Checkpoint HEAD of `dir`, then commit the checkpoint files. */
async function checkpoint(dir, tsa, signer, extra = {}) {
  const commit = git(dir, "rev-parse", "HEAD");
  const r = await createCheckpoint({ repoRoot: dir, commit, repository: "test/failsafe-g4", signer, tsa, ...extra });
  commitAll(dir, `test: checkpoint ${r.id}`);
  return r;
}

/** Shared PKI plus a base repo with two good checkpoints (genesis and one successor). */
async function buildBase(bin) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "g4-falsify-"));
  const tsa = createLocalTsa(bin, path.join(work, "tsa"));
  const signer = createTestSigner(bin, path.join(work, "keys"), "A");
  const repo = path.join(work, "base");
  fs.mkdirSync(repo);
  initRepo(repo, tsa, signer);
  const cp1 = await checkpoint(repo, tsa, signer);
  appendEntry(repo, 927);
  commitAll(repo, "test: entry 927");
  const cp2 = await checkpoint(repo, tsa, signer);
  return { work, bin, tsa, signer, repo, cp1, cp2 };
}

function forgedManifest(dir, previous, signer) {
  const pm = previous.manifest;
  const read = (rel) => fs.readFileSync(path.join(dir, rel));
  const regBuf = read(layout.REGISTRY_PATH);
  return {
    schema: layout.MANIFEST_SCHEMA, checkpointId: layout.checkpointId(pm.sequence + 1), sequence: pm.sequence + 1,
    repository: pm.repository, commit: git(dir, "rev-parse", "HEAD"),
    ledger: { path: layout.LEDGER_PATH, ...ledgerFacts(read(layout.LEDGER_PATH)) },
    previousCheckpoint: { checkpointId: pm.checkpointId, manifestSha256: sha256(previous.manifestBytes),
      witnessImprint: witnessImprint(previous.manifestBytes, previous.signatureBytes) },
    // The lie: claim the new ledger still begins with the previous ledger bytes.
    previousLedger: { commit: pm.commit, byteLength: pm.ledger.byteLength, sha256: pm.ledger.sha256,
      prefixOfNew: { byteLength: pm.ledger.byteLength, sha256: pm.ledger.sha256 } },
    revocationRegistry: { path: layout.REGISTRY_PATH, sha256: sha256(regBuf), version: JSON.parse(regBuf).version },
    historicalGapStatement: { path: layout.GAP_STATEMENT_PATH, sha256: sha256(read(layout.GAP_STATEMENT_PATH)) },
    key: { fingerprintSha256: signer.fingerprint, algorithm: "ECDSA-P256-SHA256", signatureEncoding: "ieee-p1363" },
    createdUtc: new Date().toISOString(),
  };
}

/**
 * Attacker model: holds a signing key and TSA access, and writes the next
 * checkpoint over HEAD without the honest builder's prefix refusal.
 */
async function forgeNext(dir, base, { signer = base.signer, mutate } = {}) {
  const checkpointsDir = path.join(dir, layout.CHECKPOINTS_DIR);
  const { previous } = loadPrevious(checkpointsDir);
  const m = forgedManifest(dir, previous, signer);
  if (mutate) mutate(m);
  const manifestBytes = Buffer.from(JSON.stringify(m, null, 2) + "\n");
  const certInfo = loadCertificate(signer.certificateDer);
  const r = await writeSignedCheckpoint({ checkpointsDir, id: m.checkpointId, manifestBytes, signer, certInfo, tsa: base.tsa });
  commitAll(dir, `test: forged ${r.id}`);
  return r;
}

let copies = 0;
/** A disposable copy of the base repository. */
function copyRepo(base) {
  copies += 1;
  const dest = path.join(base.work, `case-${copies}`);
  fs.cpSync(base.repo, dest, { recursive: true });
  return dest;
}

const verify = (dir, opts = {}) => verifyCheckpoints({ repoRoot: dir, ...opts });
const cpDir = (dir, id) => path.join(dir, layout.CHECKPOINTS_DIR, id);

module.exports = {
  git, write, commitAll, appendEntry, entryText, registryBytes, addKey, checkpoint, forgeNext, initRepo, buildBase, copyRepo, verify, cpDir,
};
