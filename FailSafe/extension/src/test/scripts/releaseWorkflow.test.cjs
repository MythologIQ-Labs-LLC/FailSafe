"use strict";
// FX974: release.yml and the rehearsal keep the safety properties the release
// artifact change depends on. Parsed with js-yaml, so the assertions follow the
// job graph and step order, not text that happens to appear in the file.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const REPO = path.resolve(__dirname, "..", "..", "..", "..", "..");
const { PUBLISH_STEP } = require(path.resolve(__dirname, "..", "..", "..", "scripts", "release-github.cjs"));
const load = (f) => yaml.load(fs.readFileSync(path.join(REPO, ".github", "workflows", f), "utf8"));
const wf = load("release.yml");
const qual = load("native-vsix-qualification.yml");
const jobs = wf.jobs;
const steps = (job, w = wf) => w.jobs[job].steps;
const runOf = (s) => String(s.run ?? "");
const indexOf = (job, pred, w = wf) => steps(job, w).findIndex(pred);
const usesCheckout = (s) => String(s.uses ?? "").startsWith("actions/checkout@");
const downloadsSet = (s) => String(s.uses ?? "").startsWith("actions/download-artifact@") && s.with?.name === "vsix-targets";
const argAfter = (run, flag) => (new RegExp(`${flag} "([^"]+)"`).exec(run) ?? [])[1];
const unconditional = (s) => s.if === undefined && s["continue-on-error"] === undefined;

test("both publish jobs keep the production gate, their pinned --skip-duplicate commands and the shared step name", () => {
  for (const [job, cmd] of [["publish-vscode", "@vscode/vsce@3.9.2 publish --skip-duplicate --packagePath"], ["publish-openvsx", "ovsx@1.2.0 publish --skip-duplicate"]]) {
    assert.equal(jobs[job].environment, "production", job);
    const publish = steps(job).find((s) => s.name === PUBLISH_STEP);
    assert.ok(publish, `${job} names its publish step "${PUBLISH_STEP}"`);
    assert.ok(runOf(publish).includes(cmd), job);
    assert.ok(!steps(job).some((s) => String(s.uses ?? "").startsWith("actions/setup-node@")), `${job} adds no setup-node`);
  }
});

test("each publish job checks out, downloads, checks the remote tag and verifies the set, in that order, before publishing", () => {
  for (const job of ["publish-vscode", "publish-openvsx"]) {
    const order = [usesCheckout, downloadsSet, (s) => runOf(s).includes("release-artifacts.cjs check-tag"), (s) => runOf(s).includes("release-artifacts.cjs verify-set"), (s) => s.name === PUBLISH_STEP]
      .map((pred) => indexOf(job, pred));
    assert.ok(order.every((i) => i >= 0), `${job}: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `${job} step order ${order}`);
    assert.ok(steps(job).filter((s) => runOf(s).includes("release-artifacts.cjs")).every(unconditional), job);
  }
});

test("every job that downloads the set verifies it before publishing or attaching", () => {
  const consumers = Object.keys(jobs).filter((j) => (jobs[j].steps ?? []).some(downloadsSet));
  assert.deepEqual(consumers.sort(), ["github-release", "publish-openvsx", "publish-vscode"]);
  for (const job of consumers) {
    const verify = indexOf(job, (s) => runOf(s).includes("release-artifacts.cjs verify-set"));
    const act = indexOf(job, (s) => s.name === PUBLISH_STEP || runOf(s).includes("publish-release"));
    assert.ok(verify >= 0 && act > verify, `${job}: verify-set (${verify}) runs before publishing (${act})`);
  }
});

test("the GitHub Release job runs after both marketplaces, waits for their bytes, and never clobbers", () => {
  const job = jobs["github-release"];
  assert.deepEqual([...job.needs].sort(), ["publish-openvsx", "publish-vscode"]);
  assert.equal(job.concurrency["cancel-in-progress"], false);
  const wait = indexOf("github-release", (s) => runOf(s).includes("verify-release-provenance.cjs") && runOf(s).includes("--vscode") && runOf(s).includes("--openvsx") && runOf(s).includes("--wait"));
  const attach = indexOf("github-release", (s) => runOf(s).includes("release-artifacts.cjs publish-release"));
  assert.ok(wait >= 0 && attach > wait);
  assert.ok(!fs.readFileSync(path.join(REPO, ".github", "workflows", "release.yml"), "utf8").includes("--clobber"));
});

test("checkouts in jobs that hold a secret, contents write or the guard token do not persist credentials", () => {
  for (const job of ["build", "publish-vscode", "publish-openvsx", "github-release"]) {
    for (const s of steps(job).filter(usesCheckout)) assert.equal(s.with?.["persist-credentials"], false, job);
  }
});

test("only the build job packages; its guard runs first, unconditionally, naming itself; the set is kept 90 days", () => {
  const packagers = Object.keys(jobs).filter((j) => (jobs[j].steps ?? []).some((s) => runOf(s).includes("package-all-targets.cjs")));
  assert.deepEqual(packagers, ["build"]);
  const guardAt = indexOf("build", (s) => runOf(s).includes("release-artifacts.cjs already-published"));
  const pack = indexOf("build", (s) => runOf(s).includes("package-all-targets.cjs"));
  assert.ok(guardAt >= 0 && guardAt < pack);
  const guard = steps("build")[guardAt];
  assert.ok(unconditional(guard) && jobs.build["continue-on-error"] === undefined, "guard has no if:/continue-on-error");
  assert.ok(guard.name && !guard.name.includes("${{"), "the guard step has a static name");
  assert.equal(argAfter(runOf(guard), "--self-step"), guard.name, "self-presence names the guard step itself");
  assert.deepEqual(jobs.build.permissions, { contents: "read", actions: "read" });
  const upload = steps("build").find((s) => String(s.uses ?? "").startsWith("actions/upload-artifact@") && s.with?.name === "vsix-targets");
  assert.equal(upload.with["retention-days"], 90);
});

test("runs for the same tag are serialized, never cancelled", () => {
  assert.equal(wf.concurrency?.["cancel-in-progress"], false);
  assert.match(String(wf.concurrency?.group), /github\.ref/);
});

test("the rehearsal proves the guard's lookups on real data before any tag exists", () => {
  const job = qual.jobs["package-all"];
  assert.deepEqual(job.permissions, { contents: "read", actions: "read" });
  const history = steps("package-all", qual).find((s) => runOf(s).includes("release-artifacts.cjs history-check"));
  assert.ok(history && unconditional(history));
  assert.equal(argAfter(runOf(history), "--workflow"), "native-vsix-qualification.yml");
  assert.equal(argAfter(runOf(history), "--self-step"), history.name);
  assert.match(runOf(history), /--ref "\$\{GITHUB_REF_NAME\}"/);
  const lookups = steps("package-all", qual).find((s) => runOf(s).includes("release-artifacts.cjs already-published"));
  assert.ok(lookups && unconditional(lookups));
  assert.equal(argAfter(runOf(lookups), "--checks"), "vscode,openvsx,release");
});
