"use strict";
/**
 * G4 (#638) falsification: RFC 3161 tokens, TSA trust, checkpoint head.
 * Uses a local throwaway test TSA (`openssl ts -reply`); no network.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const { sha256, witnessImprint } = require("../../../scripts/lib/g4/bytes.cjs");
const { createLocalTsa } = require("./g4TestPki.cjs");
const S = require("./g4Scenario.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";

function refused(r, code, verdict = "REFUSED") {
  assert.equal(r.verdict, verdict, `expected ${verdict} ${code}, got ${r.verdict} ${r.code}: ${r.detail}`);
  assert.equal(r.code, code, `expected ${code}, got ${r.code}: ${r.detail}`);
}

const cpFile = (dir, id, name) => path.join(S.cpDir(dir, id), name);

function editPolicy(dir, fn) {
  const p = path.join(dir, layout.TSA_POLICY_PATH);
  const policy = JSON.parse(fs.readFileSync(p, "utf8"));
  fn(policy);
  fs.writeFileSync(p, JSON.stringify(policy, null, 2) + "\n");
  S.commitAll(dir, "edit tsa policy");
}

const it = (name, fn) => test(name, { skip }, fn);

let base;
before(async () => { if (!skip) base = await S.buildBase(found.bin); });
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

it("missing token: BLOCKED, never PASS", () => {
  const dir = S.copyRepo(base);
  fs.rmSync(cpFile(dir, "g4-000002", layout.FILES.token));
  refused(S.verify(dir), "TOKEN_MISSING", "BLOCKED");
});

it("corrupted token bytes", () => {
  const dir = S.copyRepo(base);
  const p = cpFile(dir, "g4-000002", layout.FILES.token);
  const buf = fs.readFileSync(p);
  buf[buf.length - 20] ^= 0xff;
  fs.writeFileSync(p, buf);
  refused(S.verify(dir), "TOKEN_INVALID");
});

it("replayed token: cp1's valid token presented for cp2", () => {
  const dir = S.copyRepo(base);
  for (const f of [layout.FILES.token, layout.FILES.chain]) fs.copyFileSync(cpFile(dir, "g4-000001", f), cpFile(dir, "g4-000002", f));
  refused(S.verify(dir), "TOKEN_IMPRINT_MISMATCH");
});

it("unknown TSA: a valid token for the right imprint from a TSA outside the policy", async () => {
  const dir = S.copyRepo(base);
  const rogue = createLocalTsa(found.bin, path.join(base.work, "rogue-tsa"));
  const m = fs.readFileSync(cpFile(dir, "g4-000002", layout.FILES.manifest));
  const s = fs.readFileSync(cpFile(dir, "g4-000002", layout.FILES.signature));
  const tsq = path.join(base.work, "rogue.tsq");
  ts.buildQuery(found.bin, witnessImprint(m, s), tsq);
  fs.writeFileSync(cpFile(dir, "g4-000002", layout.FILES.token), await rogue.request(fs.readFileSync(tsq)));
  ts.extractChain(found.bin, cpFile(dir, "g4-000002", layout.FILES.token), cpFile(dir, "g4-000002", layout.FILES.chain));
  refused(S.verify(dir), "TOKEN_INVALID");
});

it("TSA policy not selected: BLOCKED", () => {
  const dir = S.copyRepo(base);
  editPolicy(dir, (p) => { p.status = "pending-owner-decision"; });
  refused(S.verify(dir), "TSA_POLICY_UNSELECTED", "BLOCKED");
});

it("TSA policy root fingerprint does not match the committed root", () => {
  const dir = S.copyRepo(base);
  editPolicy(dir, (p) => { p.trustedRoots[0].sha256 = "2".repeat(64); });
  refused(S.verify(dir), "TSA_ROOT_MISMATCH");
});

it("TSA offline at creation: BLOCKED, and no partial checkpoint is left", async () => {
  const dir = S.copyRepo(base);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "append");
  const offline = { request: async () => Buffer.alloc(0) };
  await assert.rejects(S.checkpoint(dir, offline, base.signer), (e) => e.verdict === "BLOCKED" && e.code === "TSA_OFFLINE");
  const left = fs.readdirSync(path.join(dir, layout.CHECKPOINTS_DIR));
  assert.deepEqual(left.sort(), ["g4-000001", "g4-000002"]);
});

it("deleted checkpoint head: undetectable without an external head; refused with one", () => {
  const dir = S.copyRepo(base);
  const head = `g4-000002:${sha256(fs.readFileSync(cpFile(dir, "g4-000002", layout.FILES.manifest)))}`;
  fs.rmSync(S.cpDir(dir, "g4-000002"), { recursive: true });
  S.commitAll(dir, "delete head checkpoint");
  const r = S.verify(dir);
  assert.equal(r.verdict, "PASS", "recorded limitation: head deletion alone verifies");
  assert.match(r.limitations[0], /truncation .* undetectable/);
  refused(S.verify(dir, { trustedHead: head }), "HEAD_MISMATCH");
});

it("deleted checkpoint head plus deleted ledger tail: undetectable without an external head", () => {
  const dir = S.copyRepo(base);
  const head = `g4-000002:${sha256(fs.readFileSync(cpFile(dir, "g4-000002", layout.FILES.manifest)))}`;
  fs.rmSync(S.cpDir(dir, "g4-000002"), { recursive: true });
  const lp = path.join(dir, layout.LEDGER_PATH);
  const text = fs.readFileSync(lp, "utf8");
  fs.writeFileSync(lp, text.slice(0, text.lastIndexOf(S.entryText(927))));
  S.commitAll(dir, "truncate tail and head");
  assert.equal(S.verify(dir).verdict, "PASS", "recorded limitation: coordinated truncation verifies");
  refused(S.verify(dir, { trustedHead: head }), "HEAD_MISMATCH");
});

it("deleted middle checkpoint: CHECKPOINT_GAP", () => {
  const dir = S.copyRepo(base);
  fs.rmSync(S.cpDir(dir, "g4-000001"), { recursive: true });
  refused(S.verify(dir), "CHECKPOINT_GAP");
});

it("checkpoint without its signature: CHECKPOINT_INCOMPLETE", () => {
  const dir = S.copyRepo(base);
  fs.rmSync(cpFile(dir, "g4-000002", layout.FILES.signature));
  refused(S.verify(dir), "CHECKPOINT_INCOMPLETE");
});

it("ledger prefix edited at HEAD after the newest checkpoint, with no new checkpoint", () => {
  const dir = S.copyRepo(base);
  const lp = path.join(dir, layout.LEDGER_PATH);
  fs.writeFileSync(lp, fs.readFileSync(lp, "utf8").replace("**Verdict**: PUBLISHED", "**Verdict**: VETO"));
  S.commitAll(dir, "edit at head");
  refused(S.verify(dir), "PREFIX_BROKEN");
});

it("no checkpoints at all: BLOCKED", () => {
  const dir = S.copyRepo(base);
  fs.rmSync(path.join(dir, layout.CHECKPOINTS_DIR), { recursive: true });
  refused(S.verify(dir), "NO_CHECKPOINTS", "BLOCKED");
});
