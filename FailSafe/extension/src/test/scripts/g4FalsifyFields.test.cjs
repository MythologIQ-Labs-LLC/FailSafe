"use strict";
/**
 * G4 (#638) falsification, audit #638 N1/N3/N4/N6: manifest time skew,
 * enforced manifest fields, the --tsa-ca override and unexpected errors.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const S = require("./g4Scenario.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";
const it = (name, fn) => test(name, { skip }, fn);
const CLI = path.resolve(__dirname, "..", "..", "..", "scripts", "g4-verify-checkpoint.cjs");
const HOUR = 3600e3;

function refused(r, code, verdict = "REFUSED") {
  assert.equal(r.verdict, verdict, `expected ${verdict} ${code}, got ${r.verdict} ${r.code}: ${r.detail}`);
  assert.equal(r.code, code, `expected ${code}, got ${r.code}: ${r.detail}`);
}

async function forgedCase(mutate) {
  const dir = S.copyRepo(base);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "append");
  await S.forgeNext(dir, base, { mutate });
  return S.verify(dir);
}

let base;
before(async () => { if (!skip) base = await S.buildBase(found.bin); });
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

it("M19: createdUtc an hour after the token time is refused", async () => {
  refused(await forgedCase((m) => { m.createdUtc = new Date(Date.now() + HOUR).toISOString(); }), "MANIFEST_TIME");
});

it("M19: createdUtc two days before the token time is refused", async () => {
  refused(await forgedCase((m) => { m.createdUtc = new Date(Date.now() - 48 * HOUR).toISOString(); }), "MANIFEST_TIME");
});

it("N6: a manifest naming another key algorithm is refused even when validly signed", async () => {
  refused(await forgedCase((m) => { m.key.algorithm = "ECDSA-P384-SHA384"; }), "MANIFEST_MALFORMED");
});

it("N6: a checkpoint naming a different repository from the chain is refused", async () => {
  refused(await forgedCase((m) => { m.repository = "attacker/fork"; }), "REPOSITORY_MISMATCH");
});

it("N6: --repository pins the expected repository", () => {
  refused(S.verify(base.repo, { repository: "MythologIQ-Labs-LLC/FailSafe" }), "REPOSITORY_MISMATCH");
  assert.equal(S.verify(base.repo, { repository: "test/failsafe-g4" }).verdict, "PASS");
});

it("N3: --tsa-ca is reported as a non-release override, and --release refuses it", () => {
  const caFile = path.join(base.work, "tsa", "ca.crt");
  const r = S.verify(base.repo, { tsaCaFile: caFile });
  assert.equal(r.verdict, "PASS", r.detail);
  assert.match(r.limitations.join("\n"), /NOT a release verification/);
  refused(S.verify(base.repo, { tsaCaFile: caFile, release: true }), "TSA_OVERRIDE_NOT_RELEASE", "BLOCKED");
  refused(S.verify(base.repo, { release: true }), "RELEASE_INPUT_MISSING", "BLOCKED");
});

it("N4: an unexpected error is BLOCKED INTERNAL_ERROR (exit 2), one line, no stack trace", () => {
  const notADir = path.join(base.repo, layout.REGISTRY_PATH);
  const r = spawnSync(process.execPath, [CLI, "--repo-root", base.repo, "--checkpoints", notADir], { encoding: "utf8" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /^\[g4-verify\] mode: diagnostic \(NOT release evidence\)\n\[g4-verify\] BLOCKED INTERNAL_ERROR: unexpected error: [^\n]+\n$/);
  assert.doesNotMatch(r.stdout + r.stderr, /\n\s+at /);
});
