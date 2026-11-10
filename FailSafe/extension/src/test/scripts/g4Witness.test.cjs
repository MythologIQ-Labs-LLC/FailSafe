"use strict";
/**
 * G4 (#638): unit checks for the witness primitives, the CLI against the real
 * repository (which has no witness yet), and the PowerShell signer tooling.
 * No TPM key is created or used: the signer is pointed at a key name that
 * does not exist and must fail closed.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const B = require("../../../scripts/lib/g4/bytes.cjs");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const registry = require("../../../scripts/lib/g4/registry.cjs");
const { parseManifest } = require("../../../scripts/lib/g4/manifest.cjs");
const { createTpmSigner } = require("../../../scripts/lib/g4/signer.cjs");
const { createTestSigner } = require("./g4TestPki.cjs");

const EXT = path.resolve(__dirname, "..", "..", "..");
const REPO = path.resolve(EXT, "..", "..");
const PS_SCRIPTS = ["sign-checkpoint.ps1", "enroll-tpm-key.ps1"].map((f) => path.join(REPO, "tools", "g4", f));
const found = ts.findOpenssl();

test("imprint is SHA-256 over the domain tag and u64be length-framed manifest and signature", () => {
  const m = Buffer.from("ab");
  const s = Buffer.from("c");
  const expected = crypto.createHash("sha256").update(Buffer.concat([
    Buffer.from("FailSafe-G4-v1\0"), Buffer.from([0, 0, 0, 0, 0, 0, 0, 2]), m, Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]), s,
  ])).digest("hex");
  assert.equal(B.witnessImprint(m, s), expected);
  assert.notEqual(B.witnessImprint(Buffer.from("a"), Buffer.from("bc")), expected, "framing must separate manifest and signature");
  assert.equal(B.DOMAIN_TAG.length, 15);
});

test("token genTime parsing accepts OpenSSL's text form, with and without fractions", () => {
  assert.equal(ts.parseGenTime("Time stamp: Nov 10 16:34:18 2026 GMT"), "2026-11-10T16:34:18.000Z");
  assert.equal(ts.parseGenTime("Time stamp: Jan  2 03:04:05.25 2027 GMT"), "2027-01-02T03:04:05.250Z");
  assert.equal(ts.parseGenTime("no time here"), null);
});

test("manifest reader refuses a BOM, invalid UTF-8, foreign schema and non-JSON", () => {
  const codes = [
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("{}")]),
    Buffer.from([0x7b, 0xff, 0x7d]),
    Buffer.from('{"schema":"other"}'),
    Buffer.from("not json"),
  ].map((b) => { try { parseManifest(b); return "PASS"; } catch (e) { return e.code; } });
  assert.deepEqual(codes, ["ENCODING_BOM", "ENCODING_INVALID", "MANIFEST_MALFORMED", "MANIFEST_MALFORMED"]);
});

test("registry monotonicity: append is allowed; rollback, silent edit and removal are refused", () => {
  const fp = "a".repeat(64);
  const reg = (v, rev) => Buffer.from(JSON.stringify({ schema: registry.SCHEMA, version: v, revocations: rev }));
  const n1 = { fingerprintSha256: fp, effectiveUtc: "2026-01-01T00:00:00Z" };
  const code = (a, b) => { try { registry.assertMonotonic(a, b, "t"); return "OK"; } catch (e) { return e.code; } };
  assert.equal(code(reg(1, []), reg(2, [n1])), "OK");
  assert.equal(code(reg(2, [n1]), reg(1, [])), "REGISTRY_ROLLBACK");
  assert.equal(code(reg(1, []), reg(1, [n1])), "REGISTRY_EDITED");
  assert.equal(code(reg(2, [n1]), reg(3, [])), "REGISTRY_EDITED");
});

test("committed registry and TSA policy start empty and unselected", () => {
  const reg = registry.parse(fs.readFileSync(path.join(REPO, "tools", "g4", "revocations.json")));
  assert.equal(reg.version, 1);
  assert.deepEqual(reg.revocations, []);
  const policy = JSON.parse(fs.readFileSync(path.join(REPO, "tools", "g4", "tsa-policy.json"), "utf8"));
  assert.equal(policy.status, "pending-owner-decision");
  assert.deepEqual(policy.trustedRoots, []);
});

test("the CLI never reports PASS for the real repository, which has no witness yet", { skip: found ? false : "openssl unavailable" }, () => {
  const r = spawnSync(process.execPath, [path.join(EXT, "scripts", "g4-verify-checkpoint.cjs"), "--repo-root", REPO], { encoding: "utf8" });
  assert.ok(r.status === 1 || r.status === 2, `exit ${r.status}: ${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /\[g4-verify\] (BLOCKED|REFUSED) /);
});

const psSkip = process.platform !== "win32" ? "Windows PowerShell only" : false;

test("both PowerShell scripts parse with no errors (enroll-tpm-key.ps1 is never run)", { skip: psSkip }, () => {
  for (const f of PS_SCRIPTS) {
    const cmd = `$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${f}',[ref]$t,[ref]$e);$e.Count`;
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { encoding: "utf8" });
    assert.equal(r.stdout.trim(), "0", `${path.basename(f)}: ${r.stdout}${r.stderr}`);
  }
});

test("the TPM signer fails closed for a key name that does not exist, writing no signature", { skip: psSkip || (found ? false : "openssl unavailable") }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g4-tpm-"));
  try {
    const testCert = createTestSigner(found.bin, dir, "tpm-shape");
    const cerPath = path.join(dir, "tpm-shape.test-only.cer");
    fs.writeFileSync(cerPath, testCert.certificateDer);
    const signer = createTpmSigner({ keyName: `FailSafe-G4-NONEXISTENT-${crypto.randomUUID()}`, certificatePath: cerPath, scriptPath: PS_SCRIPTS[0] });
    assert.throws(() => signer.sign(Buffer.from("{}\n")), (e) => e.code === "SIGNER_FAILED" && /does not exist/.test(e.detail));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
