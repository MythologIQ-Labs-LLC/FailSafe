"use strict";
/**
 * G4 (#638) falsification: ledger bytes, manifest, commit and prefix continuity.
 * Every case runs on a disposable temp copy of the real committed ledger.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const { sha256 } = require("../../../scripts/lib/g4/bytes.cjs");
const S = require("./g4Scenario.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";

function refused(r, code) {
  assert.notEqual(r.verdict, "PASS", `expected refusal ${code}, got PASS`);
  assert.equal(r.code, code, `expected ${code}, got ${r.code}: ${r.detail}`);
}

const ledgerPath = (dir) => path.join(dir, layout.LEDGER_PATH);

function editLedger(dir, fn) {
  const p = ledgerPath(dir);
  fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8")), "utf8");
}

function editManifest(dir, id, fn) {
  const p = path.join(S.cpDir(dir, id), layout.FILES.manifest);
  fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8")), "utf8");
}

const it = (name, fn) => test(name, { skip }, fn);

let base;
before(async () => { if (!skip) base = await S.buildBase(found.bin); });
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

it("baseline: the untouched chain verifies, and names its unanchored head", () => {
  const r = S.verify(base.repo);
  assert.equal(r.verdict, "PASS", r.detail);
  assert.equal(r.checkpoints.length, 2);
  assert.match(r.limitations[0], /not externally anchored/);
  const head = `g4-000002:${sha256(fs.readFileSync(path.join(base.cp2.dir, layout.FILES.manifest)))}`;
  const anchored = S.verify(base.repo, { trustedHead: head });
  assert.equal(anchored.verdict, "PASS", anchored.detail);
  assert.deepEqual(anchored.limitations, []);
});

it("edited Verdict text via history rewrite (old objects pruned): COMMIT_MISSING", () => {
  const dir = S.copyRepo(base);
  editLedger(dir, (t) => t.replace("**Verdict**: PUBLISHED", "**Verdict**: VETO"));
  S.git(dir, "checkout", "-q", "--orphan", "rewritten");
  S.commitAll(dir, "rewritten history");
  S.git(dir, "branch", "-D", S.git(dir, "for-each-ref", "--format=%(refname:short)", "refs/heads/").split("\n").find((b) => b !== "rewritten"));
  S.git(dir, "reflog", "expire", "--expire=now", "--all");
  S.git(dir, "gc", "-q", "--prune=now");
  refused(S.verify(dir), "COMMIT_MISSING");
});

it("edited Verdict text via history rewrite (old objects kept): COMMIT_UNREACHABLE", () => {
  const dir = S.copyRepo(base);
  editLedger(dir, (t) => t.replace("**Verdict**: PUBLISHED", "**Verdict**: VETO"));
  S.git(dir, "checkout", "-q", "--orphan", "rewritten");
  S.commitAll(dir, "rewritten history");
  refused(S.verify(dir), "COMMIT_UNREACHABLE");
});

it("edited Decision text with the manifest re-pointed but not re-signed: SIGNATURE_INVALID", () => {
  const dir = S.copyRepo(base);
  editLedger(dir, (t) => t.replace("RELEASE PUBLISHED: FailSafe v6.0.12", "RELEASE WITHDRAWN: FailSafe v6.0.12"));
  const c = S.commitAll(dir, "edit decision");
  const m = JSON.parse(fs.readFileSync(path.join(S.cpDir(dir, "g4-000002"), layout.FILES.manifest), "utf8"));
  const buf = fs.readFileSync(ledgerPath(dir));
  editManifest(dir, "g4-000002", (t) => t.replace(m.commit, c).replace(m.ledger.sha256, sha256(buf)));
  refused(S.verify(dir), "SIGNATURE_INVALID");
});

it("edited Verdict text in an earlier entry, then a validly signed new checkpoint: PREFIX_BROKEN", async () => {
  const dir = S.copyRepo(base);
  editLedger(dir, (t) => t.replace("**Verdict**: PUBLISHED", "**Verdict**: VETO") + S.entryText(928));
  S.commitAll(dir, "edit + append");
  await S.forgeNext(dir, base);
  refused(S.verify(dir), "PREFIX_BROKEN");
});

it("the honest builder itself refuses to checkpoint a broken prefix", async () => {
  const dir = S.copyRepo(base);
  editLedger(dir, (t) => t.replace("**Verdict**: PUBLISHED", "**Verdict**: VETO"));
  S.commitAll(dir, "edit");
  await assert.rejects(S.checkpoint(dir, base.tsa, base.signer), (e) => e.code === "PREFIX_BROKEN");
});

it("earlier entry deleted, then a validly signed new checkpoint: PREFIX_BROKEN", async () => {
  const dir = S.copyRepo(base);
  editLedger(dir, (t) => {
    const a = t.indexOf("### Entry #925:");
    const b = t.indexOf("### Entry #926:");
    return t.slice(0, a) + t.slice(b) + S.entryText(928);
  });
  S.commitAll(dir, "delete #925");
  await S.forgeNext(dir, base);
  refused(S.verify(dir), "PREFIX_BROKEN");
});

it("entries reordered, then a validly signed new checkpoint: PREFIX_BROKEN", async () => {
  const dir = S.copyRepo(base);
  editLedger(dir, (t) => {
    const a = t.indexOf("### Entry #925:");
    const b = t.indexOf("### Entry #926:");
    const c = t.indexOf("### Entry #927:");
    return t.slice(0, a) + t.slice(b, c) + t.slice(a, b) + t.slice(c);
  });
  S.commitAll(dir, "swap #925/#926");
  await S.forgeNext(dir, base);
  refused(S.verify(dir), "PREFIX_BROKEN");
});

it("one byte of the earliest ledger prefix modified, with a valid key signature: PREFIX_BROKEN", async () => {
  const dir = S.copyRepo(base);
  const p = ledgerPath(dir);
  const buf = fs.readFileSync(p);
  buf[40] = buf[40] === 0x20 ? 0x21 : 0x20;
  fs.writeFileSync(p, Buffer.concat([buf, Buffer.from(S.entryText(928))]));
  S.commitAll(dir, "flip byte 40");
  await S.forgeNext(dir, base);
  refused(S.verify(dir), "PREFIX_BROKEN");
});

it("edited manifest (entry count) and whitespace-only reserialization: SIGNATURE_INVALID", () => {
  const a = S.copyRepo(base);
  editManifest(a, "g4-000001", (t) => t.replace(/"entryCount": (\d+)/, (_, n) => `"entryCount": ${Number(n) + 1}`));
  refused(S.verify(a), "SIGNATURE_INVALID");
  const b = S.copyRepo(base);
  editManifest(b, "g4-000001", (t) => JSON.stringify(JSON.parse(t)) + "\n");
  refused(S.verify(b), "SIGNATURE_INVALID");
});

it("changed commit in the manifest: SIGNATURE_INVALID", () => {
  const dir = S.copyRepo(base);
  const m1 = JSON.parse(fs.readFileSync(path.join(base.cp1.dir, layout.FILES.manifest), "utf8"));
  const m2 = JSON.parse(fs.readFileSync(path.join(base.cp2.dir, layout.FILES.manifest), "utf8"));
  editManifest(dir, "g4-000002", (t) => t.replace(`"commit": "${m2.commit}"`, `"commit": "${m1.commit}"`));
  refused(S.verify(dir), "SIGNATURE_INVALID");
});

it("a validly signed checkpoint naming a ledger digest that the commit does not hold: LEDGER_MISMATCH", async () => {
  const dir = S.copyRepo(base);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "append 928");
  await S.forgeNext(dir, base, { mutate: (m) => { m.ledger.sha256 = "0".repeat(64); } });
  refused(S.verify(dir), "LEDGER_MISMATCH");
});

it("M01: broken prefix where prefixOfNew honestly states the real (different) prefix digest: PREFIX_BROKEN", async () => {
  const dir = S.copyRepo(base);
  editLedger(dir, (t) => t.replace("**Verdict**: PUBLISHED", "**Verdict**: VETOED") + S.entryText(928));
  S.commitAll(dir, "edit + append");
  const buf = fs.readFileSync(ledgerPath(dir));
  await S.forgeNext(dir, base, { mutate: (m) => {
    m.previousLedger.prefixOfNew.sha256 = sha256(buf.subarray(0, m.previousLedger.byteLength));
  } });
  refused(S.verify(dir), "PREFIX_BROKEN");
  assert.match(S.verify(dir).detail, /first \d+ bytes differ/);
});

it("M02b: intact prefix but a false prefixOfNew digest in a validly signed manifest: PREFIX_BROKEN", async () => {
  const dir = S.copyRepo(base);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "append 928");
  await S.forgeNext(dir, base, { mutate: (m) => { m.previousLedger.prefixOfNew.sha256 = "3".repeat(64); } });
  const r = S.verify(dir);
  refused(r, "PREFIX_BROKEN");
  assert.match(r.detail, /prefixOfNew evidence/);
});
