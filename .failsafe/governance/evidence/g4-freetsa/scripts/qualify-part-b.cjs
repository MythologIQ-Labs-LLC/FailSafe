"use strict";
/** Part B: the real G4 verifier, --release mode, with the exact candidate policy and root. */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Q = require("./qualify-freetsa.cjs");
const { createCheckpoint } = require(path.join(Q.EXT, "scripts/lib/g4/checkpoint.cjs"));
const { postQuery } = require(path.join(Q.EXT, "scripts/lib/g4/timestamp.cjs"));

const DIR = path.join(Q.OUT, "part-b");
const REPOSITORY = "test/failsafe-g4";
const MOZILLA_BUNDLE = "C:\\Program Files\\Git\\mingw64\\etc\\ssl\\certs\\ca-bundle.crt";
let copies = 0;

const head = (dir) => S().git(dir, "rev-parse", "HEAD");
function S() { return Q.S; }

/** A throwaway repository carrying the exact candidate policy and root bytes. */
function initRepo(dir, signer) {
  fs.mkdirSync(dir, { recursive: true });
  S().initRepo(dir, { rootPem: Q.ROOT_PEM }, signer);
  fs.rmSync(path.join(dir, "tools/g4/tsa-roots"), { recursive: true, force: true });
  S().write(dir, Q.ROOT_REL, Q.ROOT_PEM);
  S().write(dir, Q.layout.TSA_POLICY_PATH, Q.POLICY);
  return S().commitAll(dir, "test: exact candidate FreeTSA policy and root");
}

function releaseOpts(dir, signer, last) {
  const manifest = fs.readFileSync(path.join(S().cpDir(dir, last), Q.layout.FILES.manifest));
  return { release: true, trustFingerprint: signer.fingerprint, trustedHead: `${last}:${Q.sha256(manifest)}`, repository: REPOSITORY, expectedCommit: head(dir) };
}

function expectVerify(name, dir, opts, want) {
  const r = S().verify(dir, opts);
  const got = `${r.verdict} ${r.code}${r.verdict === "PASS" ? ` mode:${r.mode} limitations:${r.limitations.length}` : ""}`;
  Q.record("B", name, want, got, r.detail);
  return r;
}

/** Copy the base repository, apply `change`, commit it, and verify in release mode. */
function variant(base, name, change, want, extraOpts = {}) {
  copies += 1;
  const dir = path.join(DIR, `case-${copies}`);
  fs.cpSync(base.repo, dir, { recursive: true });
  change(dir);
  S().commitAll(dir, `test: ${name}`);
  expectVerify(name, dir, { ...releaseOpts(dir, base.signer, "g4-000002"), ...extraOpts }, want);
}

function editPolicy(dir, fn) {
  const p = JSON.parse(fs.readFileSync(path.join(dir, Q.layout.TSA_POLICY_PATH)));
  fn(p);
  fs.writeFileSync(path.join(dir, Q.layout.TSA_POLICY_PATH), JSON.stringify(p, null, 2) + "\n");
}

function policyRejections(base) {
  const forged = fs.readFileSync(path.join(Q.OUT, "part-a", "forged-root-same-dn.pem"));
  variant(base, "policy status pending", (d) => editPolicy(d, (p) => { p.status = "pending-owner-decision"; }), "BLOCKED TSA_POLICY_UNSELECTED");
  variant(base, "policy selected with no root", (d) => editPolicy(d, (p) => { p.trustedRoots = []; }), "BLOCKED TSA_POLICY_UNSELECTED");
  variant(base, "policy digest one hex digit off", (d) => editPolicy(d, (p) => { p.trustedRoots[0].sha256 = p.trustedRoots[0].sha256.replace(/.$/, (c) => (c === "0" ? "1" : "0")); }), "REFUSED TSA_ROOT_MISMATCH");
  variant(base, "root file missing", (d) => fs.rmSync(path.join(d, Q.ROOT_REL)), "REFUSED TSA_POLICY_MISSING");
  variant(base, "root swapped for a same-DN forged root, digest updated", (d) => {
    fs.writeFileSync(path.join(d, Q.ROOT_REL), forged);
    editPolicy(d, (p) => { p.trustedRoots[0].sha256 = Q.sha256(new crypto.X509Certificate(forged).raw); });
  }, "REFUSED TOKEN_INVALID");
}

function tokenRejections(base) {
  const cp = (d, id, f) => path.join(S().cpDir(d, id), Q.layout.FILES[f]);
  variant(base, "g4-000001's token substituted into g4-000002", (d) => {
    for (const f of ["token", "chain", "query"]) fs.copyFileSync(cp(d, "g4-000001", f), cp(d, "g4-000002", f));
  }, "REFUSED TOKEN_IMPRINT_MISMATCH");
  variant(base, "g4-000002 token with one byte flipped", (d) => {
    const b = fs.readFileSync(cp(d, "g4-000002", "token"));
    b[b.length - 1] ^= 0x01;
    fs.writeFileSync(cp(d, "g4-000002", "token"), b);
  }, "REFUSED TOKEN_INVALID");
  expectVerify("release mode refuses a --tsa-ca override", base.repo, { ...releaseOpts(base.repo, base.signer, "g4-000002"), tsaCaFile: MOZILLA_BUNDLE }, "BLOCKED TSA_OVERRIDE_NOT_RELEASE");
  expectVerify("diagnostic mode with only public roots (no fallback)", base.repo, { tsaCaFile: MOZILLA_BUNDLE }, "REFUSED TOKEN_INVALID");
}

/** The CLI's TSA adapter, reproduced: the CLI cannot reach the TSA without a TPM key. */
function httpTsa(url) {
  return { async request(tsq) {
    const res = await postQuery(url, tsq, 5000);
    if (res.status !== 200) throw new Q.G4Refusal("BLOCKED", "TSA_OFFLINE", `${url} answered HTTP ${res.status}`);
    return res.body;
  } };
}

async function localServer(handler) {
  const server = Q.http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/tsr`, close: () => new Promise((r) => server.close(r)) };
}

async function expectNoCheckpoint(base, name, tsa) {
  const dir = path.join(DIR, `outage-${++copies}`);
  fs.cpSync(base.repo, dir, { recursive: true });
  let got = "created";
  try {
    await createCheckpoint({ repoRoot: dir, commit: head(dir), repository: REPOSITORY, signer: base.signer, tsa });
  } catch (e) {
    got = e instanceof Q.G4Refusal ? `${e.verdict} ${e.code}` : `ERROR ${String(e.message).split("\n")[0]}`;
  }
  const left = fs.readdirSync(path.join(dir, Q.layout.CHECKPOINTS_DIR)).filter((n) => n !== "g4-000001" && n !== "g4-000002");
  Q.record("B", `outage (${name}): no checkpoint or staging directory written`, "[]", JSON.stringify(left), got);
}

async function outages(base) {
  const closed = await localServer(() => {});
  const closedUrl = closed.url;
  await closed.close();
  await expectNoCheckpoint(base, "connection refused", httpTsa(closedUrl));
  await expectNoCheckpoint(base, "unresolvable host", httpTsa("https://freetsa-g4-outage.invalid/tsr"));
  const cases = [["HTTP 503", (q, s) => { s.statusCode = 503; s.end("down"); }], ["HTTP 200 empty body", (q, s) => s.end()],
    ["HTTP 200 garbage", (q, s) => s.end(crypto.randomBytes(300))], ["no answer within the timeout", () => {}]];
  for (const [name, handler] of cases) {
    const srv = await localServer(handler);
    await expectNoCheckpoint(base, name, httpTsa(srv.url));
    srv.close();
  }
}

async function run() {
  fs.mkdirSync(DIR, { recursive: true });
  const signer = Q.createTestSigner(Q.BIN, path.join(DIR, "ephemeral-test-signer"), "qualify");
  const repo = path.join(DIR, "base");
  initRepo(repo, signer);
  const tsa = { request: Q.freetsa };
  await S().checkpoint(repo, tsa, signer, { repository: REPOSITORY });
  S().appendEntry(repo, 9001);
  S().commitAll(repo, "test: entry 9001");
  await S().checkpoint(repo, tsa, signer, { repository: REPOSITORY });
  const base = { repo, signer };
  expectVerify("release verification, real FreeTSA tokens, exact policy and root", repo, releaseOpts(repo, signer, "g4-000002"), "PASS OK mode:release limitations:0");
  expectVerify("release verification against a stale trusted head (g4-000001)", repo, releaseOpts(repo, signer, "g4-000001"), "REFUSED HEAD_MISMATCH");
  policyRejections(base);
  tokenRejections(base);
  await outages(base);
}

module.exports = { run };
