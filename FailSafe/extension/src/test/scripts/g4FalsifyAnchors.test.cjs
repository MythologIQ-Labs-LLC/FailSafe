"use strict";
/**
 * G4 (#638) falsification, audit #638 B1/N1: checks that only a checkpoint
 * anchor can catch. Each test isolates one verifier check (auditor mutation
 * number in the name): with that check deleted, the case would verify PASS.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const { buildManifestBytes } = require("../../../scripts/lib/g4/manifest.cjs");
const { writeSignedCheckpoint } = require("../../../scripts/lib/g4/checkpoint.cjs");
const { loadCertificate } = require("../../../scripts/lib/g4/signer.cjs");
const S = require("./g4Scenario.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";
const it = (name, fn) => test(name, { skip }, fn);

function refused(r, code, detailRe) {
  assert.notEqual(r.verdict, "PASS", `expected refusal ${code}, got PASS`);
  assert.equal(r.code, code, `expected ${code}, got ${r.code}: ${r.detail}`);
  if (detailRe) assert.match(r.detail, detailRe);
}

const manifestOf = (dir, id) => JSON.parse(fs.readFileSync(path.join(S.cpDir(dir, id), layout.FILES.manifest), "utf8"));

/** Registry v2 on a side branch with checkpoint g4-000003, merged back with the registry restored to v1. */
async function mergeHiddenRollback(base) {
  const dir = S.copyRepo(base);
  const main = S.git(dir, "rev-parse", "--abbrev-ref", "HEAD");
  S.git(dir, "checkout", "-q", "-b", "side");
  S.write(dir, layout.REGISTRY_PATH, S.registryBytes(2, [{ fingerprintSha256: "b".repeat(64), effectiveUtc: "2030-01-01T00:00:00Z", reason: "test" }]));
  const v2 = S.commitAll(dir, "registry v2");
  await S.checkpoint(dir, base.tsa, base.signer);
  S.git(dir, "checkout", "-q", main);
  S.git(dir, "merge", "-q", "--no-ff", "--no-commit", "side");
  S.git(dir, "checkout", "HEAD", "--", layout.REGISTRY_PATH);
  S.commitAll(dir, "merge side, registry back to v1");
  const listed = S.git(dir, "log", "--format=%H", "--", layout.REGISTRY_PATH).split("\n");
  assert.ok(!listed.includes(v2), "precondition: git log -- revocations.json must not list the v2 commit");
  return dir;
}

let base;
before(async () => { if (!skip) base = await S.buildBase(found.bin); });
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

it("M07: merge-hidden registry rollback at HEAD is refused by the checkpoint-to-HEAD anchor", async () => {
  const dir = await mergeHiddenRollback(base);
  refused(S.verify(dir), "REGISTRY_ROLLBACK", /g4-000003 -> HEAD registry/);
});

it("M06: merge-hidden rollback plus a forged next checkpoint binding v1 is refused checkpoint-to-checkpoint", async () => {
  const dir = await mergeHiddenRollback(base);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "append");
  await S.forgeNext(dir, base);
  assert.equal(manifestOf(dir, "g4-000004").revocationRegistry.version, 1);
  refused(S.verify(dir), "REGISTRY_ROLLBACK", /g4-000003 -> g4-000004/);
});

it("M18: genesis replaced by a validly signed and timestamped substitute, later chain kept", async () => {
  const dir = S.copyRepo(base);
  const m1 = manifestOf(dir, "g4-000001");
  const bytes = buildManifestBytes({ repoRoot: dir, commit: m1.commit, repository: m1.repository, sequence: 1,
    previous: null, keyFingerprint: base.signer.fingerprint, createdUtc: new Date().toISOString() });
  const stageRoot = path.join(base.work, `subst-${Date.now()}`);
  fs.mkdirSync(stageRoot);
  // The substitute is stamped BEFORE g4-000002 is (re)made, so token time order holds and only the link can catch it.
  fs.rmSync(S.cpDir(dir, "g4-000002"), { recursive: true });
  const r = await writeSignedCheckpoint({ checkpointsDir: stageRoot, id: "g4-000001", manifestBytes: bytes,
    signer: base.signer, certInfo: loadCertificate(base.signer.certificateDer), tsa: base.tsa });
  await S.checkpoint(dir, base.tsa, base.signer);
  fs.rmSync(S.cpDir(dir, "g4-000001"), { recursive: true });
  fs.cpSync(r.dir, S.cpDir(dir, "g4-000001"), { recursive: true });
  refused(S.verify(dir), "CHAIN_BROKEN", /g4-000002: previousCheckpoint does not name g4-000001/);
});

it("M21: historical-gap statement changed at a checkpointed commit", async () => {
  const dir = S.copyRepo(base);
  const oldDigest = manifestOf(dir, "g4-000002").historicalGapStatement.sha256;
  S.write(dir, layout.GAP_STATEMENT_PATH, Buffer.from("TEST gap statement, rewritten: the October VETOs are resolved\n"));
  S.commitAll(dir, "rewrite gap statement");
  await S.forgeNext(dir, base, { mutate: (m) => { m.historicalGapStatement.sha256 = oldDigest; } });
  refused(S.verify(dir), "GAP_STATEMENT_MISMATCH");
});

it("M31: a genesis over a ledger without the '### Entry #914: EPOCH' heading", async () => {
  const dir = path.join(base.work, "no-epoch");
  fs.mkdirSync(dir);
  const strip = (b) => Buffer.from(b.toString("utf8").replace("### Entry #914: EPOCH", "### Entry #914: EPOCX"), "utf8");
  S.initRepo(dir, base.tsa, base.signer, { ledger: strip });
  await S.checkpoint(dir, base.tsa, base.signer);
  refused(S.verify(dir), "GENESIS_EPOCH_MISSING");
});

it("M20: a later checkpoint whose token predates the previous checkpoint's token", async () => {
  const dir = S.copyRepo(base);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "append 928");
  const cp3 = S.writeUnstamped(dir, base.signer);
  S.commitAll(dir, "unstamped g4-000003");
  S.appendEntry(dir, 929);
  S.commitAll(dir, "append 929");
  const cp4 = S.writeUnstamped(dir, base.signer);
  await S.stampToken(base, cp4.cp, cp4.imprint);
  await new Promise((r) => setTimeout(r, 1100));
  await S.stampToken(base, cp3.cp, cp3.imprint);
  S.commitAll(dir, "tokens, out of order");
  refused(S.verify(dir), "CHAIN_TIME_ORDER", /g4-000004/);
});

it("M23: a token that verifies for the imprint bytes but uses SHA3-256, not SHA-256", async () => {
  const dir = S.copyRepo(base);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "append");
  const cp3 = S.writeUnstamped(dir, base.signer);
  await S.stampToken(base, cp3.cp, cp3.imprint, "-sha3-256");
  S.commitAll(dir, "sha3 token");
  refused(S.verify(dir), "TOKEN_INVALID", /token hash is sha3-256/);
});
