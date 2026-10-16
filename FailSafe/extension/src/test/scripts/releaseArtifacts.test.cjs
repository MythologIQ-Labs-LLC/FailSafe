"use strict";
// FX974: the authoritative release artifact set and the GitHub Release upload
// plan. The deep per-package checks (manifest, validate-vsix) are injected so
// each rule is exercised on its own; the real packages are checked at
// implement time with the CLI.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPTS = path.resolve(__dirname, "..", "..", "..", "scripts");
const { parseSums, verifySet, planRelease, expectedAssets, expectedNames } = require(path.join(SCRIPTS, "release-artifacts.cjs"));
const { NATIVE_TARGETS } = require(path.join(SCRIPTS, "native-targets.cjs"));

const V = "6.0.7";
const TARGETS = Object.keys(NATIVE_TARGETS);
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

/** A directory shaped like the build job's vsix-targets artifact. */
function makeSet({ version = V, mutate } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-set-"));
  const entries = expectedNames(version).map(({ target, name }) => {
    const bytes = Buffer.from(`package-${version}-${target}`);
    fs.writeFileSync(path.join(dir, name), bytes);
    return { target, file: name, sha256: sha256(bytes) };
  });
  const sums = entries.map((e) => `${e.sha256}  ${e.file}`).join("\n") + "\n";
  fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), sums);
  fs.writeFileSync(path.join(dir, "targets.json"), JSON.stringify({ version, targets: entries }));
  mutate?.(dir, entries);
  return dir;
}

/** Fake manifest reader: the target comes from the bytes the fake package holds. */
const fakeDeps = (over = {}) => ({
  readManifest: (file) => {
    const m = /^package-([^-]+)-(.+)$/.exec(fs.readFileSync(file, "utf8"));
    return { version: m?.[1], targetPlatform: m?.[2] };
  },
  validateVsix: () => null,
  ...over,
});

const rewriteSums = (dir, fn) => {
  const p = path.join(dir, "SHA256SUMS.txt");
  fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8")));
};

test("a complete eight-target set passes", () => {
  assert.deepEqual(verifySet(makeSet(), V, fakeDeps()), []);
});

test("a missing target fails and names the file", () => {
  const dir = makeSet({ mutate: (d) => fs.rmSync(path.join(d, `mythologiq-failsafe-${V}-darwin-arm64.vsix`)) });
  assert.deepEqual(verifySet(dir, V, fakeDeps()), [`mythologiq-failsafe-${V}-darwin-arm64.vsix is missing`]);
});

test("an extra package (a universal VSIX) fails", () => {
  const dir = makeSet({ mutate: (d) => fs.writeFileSync(path.join(d, `mythologiq-failsafe-${V}.vsix`), "universal") });
  assert.ok(verifySet(dir, V, fakeDeps()).includes(`unexpected package mythologiq-failsafe-${V}.vsix`));
});

test("seven or nine manifest lines fail", () => {
  const seven = makeSet({ mutate: (d) => rewriteSums(d, (t) => t.split("\n").slice(1).join("\n")) });
  assert.ok(verifySet(seven, V, fakeDeps()).some((e) => /does not list/.test(e)));
  const nine = makeSet({ mutate: (d) => rewriteSums(d, (t) => `${t}${"0".repeat(64)}  extra.vsix\n`) });
  assert.ok(verifySet(nine, V, fakeDeps()).includes("SHA256SUMS.txt lists unexpected file extra.vsix"));
});

test("CRLF line endings and a missing final newline fail", () => {
  assert.throws(() => parseSums(`${"a".repeat(64)}  x.vsix\r\n`), /CR characters/);
  assert.throws(() => parseSums(`${"a".repeat(64)}  x.vsix`), /does not end with a newline/);
  assert.throws(() => parseSums(`${"a".repeat(64)} x.vsix\n`), /malformed line/);
});

test("a package whose bytes differ from its manifest line fails", () => {
  const dir = makeSet({ mutate: (d) => fs.appendFileSync(path.join(d, `mythologiq-failsafe-${V}-linux-x64.vsix`), "x") });
  assert.deepEqual(verifySet(dir, V, fakeDeps()), [`mythologiq-failsafe-${V}-linux-x64.vsix does not match its SHA256SUMS.txt line`]);
});

test("a package named for one target but built for another fails (falsifier for the filename-target rule)", () => {
  const deps = fakeDeps({ readManifest: (file) => ({ version: V, targetPlatform: file.includes("win32-arm64") ? "win32-x64" : /-(\w+-\w+)\.vsix$/.exec(file)[1] }) });
  assert.deepEqual(verifySet(makeSet(), V, deps), [`mythologiq-failsafe-${V}-win32-arm64.vsix declares target win32-x64, expected win32-arm64`]);
});

test("a package declaring another version fails", () => {
  const deps = fakeDeps({ readManifest: (file) => ({ version: file.includes("alpine-x64") ? "6.0.6" : V, targetPlatform: /-(\w+-\w+)\.vsix$/.exec(file)[1] }) });
  assert.deepEqual(verifySet(makeSet(), V, deps), [`mythologiq-failsafe-${V}-alpine-x64.vsix declares version 6.0.6, expected ${V}`]);
});

test("targets.json naming another version or another sha fails", () => {
  const otherVersion = makeSet({ mutate: (d, e) => fs.writeFileSync(path.join(d, "targets.json"), JSON.stringify({ version: "6.0.6", targets: e })) });
  assert.ok(verifySet(otherVersion, V, fakeDeps()).includes(`targets.json names version 6.0.6, expected ${V}`));
  const otherSha = makeSet({ mutate: (d, e) => fs.writeFileSync(path.join(d, "targets.json"), JSON.stringify({ version: V, targets: e.map((x, i) => (i === 0 ? { ...x, sha256: "0".repeat(64) } : x)) })) });
  assert.ok(verifySet(otherSha, V, fakeDeps()).some((e) => /targets.json disagrees/.test(e)));
});

test("the existing per-package validation failing fails the set", () => {
  const deps = fakeDeps({ validateVsix: (f) => (f.includes("linux-arm64") ? "Native binary is x64, expected arm64" : null) });
  assert.deepEqual(verifySet(makeSet(), V, deps), [`mythologiq-failsafe-${V}-linux-arm64.vsix failed validation: Native binary is x64, expected arm64`]);
});

// ---- planRelease ----

const expected = () => expectedAssets(makeSet());
const asAssets = (map, names) => names.map((name) => ({ name, state: "uploaded", digest: `sha256:${map.get(name)}` }));
const neverHash = async () => { throw new Error("must not download"); };

test("no assets yet: all nine files are uploaded", async () => {
  const exp = expected();
  const plan = await planRelease(exp, [], neverHash);
  assert.equal(exp.size, 9);
  assert.deepEqual(plan.upload, [...exp.keys()]);
  assert.equal(plan.complete, false);
});

test("a partial earlier upload: only the missing files are uploaded", async () => {
  const exp = expected();
  const done = [...exp.keys()].slice(0, 3);
  const plan = await planRelease(exp, asAssets(exp, done), neverHash);
  assert.deepEqual(plan.present, done);
  assert.deepEqual(plan.upload, [...exp.keys()].slice(3));
  assert.deepEqual(plan.conflicts, []);
});

test("a present file with different bytes is a conflict, and nothing is uploaded over it (falsifier for the digest comparison)", async () => {
  const exp = expected();
  const name = [...exp.keys()][0];
  const assets = [{ name, state: "uploaded", digest: `sha256:${"0".repeat(64)}` }];
  const plan = await planRelease(exp, assets, neverHash);
  assert.deepEqual(plan.conflicts, [name]);
  assert.ok(!plan.upload.includes(name));
  assert.equal(plan.complete, false);
});

test("an attachment that is not part of the set is reported and blocks completion", async () => {
  const exp = expected();
  const plan = await planRelease(exp, [...asAssets(exp, [...exp.keys()]), { name: "mythologiq-failsafe-6.0.7.vsix", state: "uploaded", digest: "sha256:00" }], neverHash);
  assert.deepEqual(plan.unexpected, ["mythologiq-failsafe-6.0.7.vsix"]);
  assert.equal(plan.complete, false);
});

test("an asset without a digest is hashed from its download before deciding", async () => {
  const exp = expected();
  const name = [...exp.keys()][1];
  const asked = [];
  const plan = await planRelease(exp, [{ name, state: "uploaded", digest: null }], async (asset) => { asked.push(asset.name); return exp.get(asset.name); });
  assert.deepEqual(asked, [name]);
  assert.deepEqual(plan.present, [name]);
});

test("all nine present and equal: complete, nothing to upload", async () => {
  const exp = expected();
  const plan = await planRelease(exp, asAssets(exp, [...exp.keys()]), neverHash);
  assert.deepEqual(plan.upload, []);
  assert.equal(plan.complete, true);
});

test("the manifest itself is one of the nine expected files", () => {
  const dir = makeSet();
  const exp = expectedAssets(dir);
  assert.equal(exp.get("SHA256SUMS.txt"), sha256(fs.readFileSync(path.join(dir, "SHA256SUMS.txt"))));
  assert.equal([...exp.keys()].filter((n) => n.endsWith(".vsix")).length, TARGETS.length);
});

// ---- publishRelease (the stateful sequence, with a recording fake client) ----

const { publishRelease, checkRemoteTag, alreadyPublished } = require(path.join(SCRIPTS, "release-artifacts.cjs"));
const { memoryClient } = require(path.join(SCRIPTS, "release-github.cjs"));
const TAG = `v${V}`;
const writes = (client) => client.calls.map((c) => c[0]);
const uploaded = (dir, names) => names.map((name, i) => ({ id: `a${i}`, name, state: "uploaded", digest: `sha256:${expectedAssets(dir).get(name)}` }));

test("no release yet: a draft is created, all nine files uploaded, then it is published", async () => {
  const dir = makeSet();
  const client = memoryClient();
  const r = await publishRelease({ dir, tag: TAG }, client);
  assert.equal(r.action, "published");
  assert.deepEqual(writes(client), ["createDraft", ...Array(9).fill("uploadAsset"), "publish"]);
});

test("a draft holding three files: only the other six are uploaded, then it is published", async () => {
  const dir = makeSet();
  const names = [...expectedAssets(dir).keys()];
  const client = memoryClient([{ id: 1, tag_name: TAG, draft: true, assets: uploaded(dir, names.slice(0, 3)) }]);
  await publishRelease({ dir, tag: TAG }, client);
  assert.deepEqual(client.calls.filter((c) => c[0] === "uploadAsset").map((c) => c[1]), names.slice(3));
  assert.equal(writes(client).at(-1), "publish");
});

test("a complete draft whose publish failed earlier: nothing is uploaded, it is published", async () => {
  const dir = makeSet();
  const client = memoryClient([{ id: 1, tag_name: TAG, draft: true, assets: uploaded(dir, [...expectedAssets(dir).keys()]) }]);
  await publishRelease({ dir, tag: TAG }, client);
  assert.deepEqual(writes(client), ["publish"]);
});

test("a complete published release is left untouched (zero writes)", async () => {
  const dir = makeSet();
  const client = memoryClient([{ id: 1, tag_name: TAG, draft: false, assets: uploaded(dir, [...expectedAssets(dir).keys()]) }]);
  const r = await publishRelease({ dir, tag: TAG }, client);
  assert.equal(r.action, "unchanged");
  assert.deepEqual(client.calls, []);
});

test("a published release missing a file stops with zero writes; it is never filled in while public (falsifier for the published-incomplete stop)", async () => {
  const dir = makeSet();
  const names = [...expectedAssets(dir).keys()];
  const client = memoryClient([{ id: 1, tag_name: TAG, draft: false, assets: uploaded(dir, names.slice(1)) }]);
  await assert.rejects(publishRelease({ dir, tag: TAG }, client), /does not carry exactly the verified set/);
  assert.deepEqual(client.calls, []);
});

test("two releases for the tag stop the job with zero writes", async () => {
  const client = memoryClient([{ id: 1, tag_name: TAG, draft: true }, { id: 2, tag_name: TAG, draft: true }]);
  await assert.rejects(publishRelease({ dir: makeSet(), tag: TAG }, client), /2 releases exist/);
  assert.deepEqual(client.calls, []);
});

test("a file with other bytes on the draft stops the job: nothing uploaded, not published", async () => {
  const dir = makeSet();
  const names = [...expectedAssets(dir).keys()];
  const bad = [{ id: "x", name: names[0], state: "uploaded", digest: `sha256:${"f".repeat(64)}` }];
  const client = memoryClient([{ id: 1, tag_name: TAG, draft: true, assets: bad }]);
  await assert.rejects(publishRelease({ dir, tag: TAG }, client), /not the verified set/);
  assert.deepEqual(client.calls, []);
});

test("an interrupted upload (state starter) is deleted and re-sent", async () => {
  const dir = makeSet();
  const names = [...expectedAssets(dir).keys()];
  const client = memoryClient([{ id: 1, tag_name: TAG, draft: true, assets: [{ id: "s1", name: names[2], state: "starter", digest: null }] }]);
  await publishRelease({ dir, tag: TAG }, client);
  assert.deepEqual(client.calls[0], ["deleteAsset", "s1"]);
  assert.ok(client.calls.some((c) => c[0] === "uploadAsset" && c[1] === names[2]));
});

// ---- remote tag guard ----

const lsRemote = (lines) => () => lines.join("\n") + "\n";
const SHA = "a".repeat(40);

test("the remote tag at the built commit passes", () => {
  checkRemoteTag({ refType: "tag", tag: TAG, sha: SHA }, lsRemote([`${SHA}\trefs/tags/${TAG}`]));
});

test("the remote tag at another commit stops (falsifier for the remote tag comparison)", () => {
  assert.throws(() => checkRemoteTag({ refType: "tag", tag: TAG, sha: SHA }, lsRemote([`${"b".repeat(40)}\trefs/tags/${TAG}`])), /points at b+ on the remote/);
});

test("an annotated tag is compared by its peeled commit", () => {
  const lines = [`${"c".repeat(40)}\trefs/tags/${TAG}`, `${SHA}\trefs/tags/${TAG}^{}`];
  checkRemoteTag({ refType: "tag", tag: TAG, sha: SHA }, lsRemote(lines));
  assert.throws(() => checkRemoteTag({ refType: "tag", tag: TAG, sha: "c".repeat(40) }, lsRemote(lines)), /points at/);
});

test("a missing remote tag or a non-tag run stops", () => {
  assert.throws(() => checkRemoteTag({ refType: "tag", tag: TAG, sha: SHA }, lsRemote([])), /does not exist on the remote/);
  assert.throws(() => checkRemoteTag({ refType: "branch", tag: "main", sha: SHA }, lsRemote([])), /only from a tag run/);
});

// ---- one set per release (LD7) ----

const { publishStepStarted, ghClient, PUBLISH_STEP } = require(path.join(SCRIPTS, "release-github.cjs"));
const quiet = { history: async () => null, vscode: async () => null, openvsx: async () => null, release: async () => null };

test("a first build with no history and nothing served anywhere proceeds", async () => {
  assert.deepEqual(await alreadyPublished({ version: V, tag: TAG }, quiet), { published: false, found: [] });
});

test("an earlier attempt that started publishing stops the build even while both marketplaces still answer 404 (falsifier: a 404 is not absence)", async () => {
  const r = await alreadyPublished({ version: V, tag: TAG }, { ...quiet, history: async () => "run 9 attempt 1 started publishing" });
  assert.deepEqual(r, { published: true, found: ["run 9 attempt 1 started publishing"] });
});

test("a marketplace serving the version or an existing GitHub Release stops the build", async () => {
  assert.equal((await alreadyPublished({ version: V, tag: TAG }, { ...quiet, openvsx: async () => "Open VSX serves linux-x64" })).published, true);
  assert.equal((await alreadyPublished({ version: V, tag: TAG }, { ...quiet, release: async () => "a GitHub Release exists" })).published, true);
});

test("any lookup error stops the build", async () => {
  await assert.rejects(alreadyPublished({ version: V, tag: TAG }, { ...quiet, vscode: async () => { throw new Error("HTTP 503"); } }), /could not check vscode/);
});

const job = (name, steps) => ({ name, steps });
const step = (status, conclusion) => ({ name: PUBLISH_STEP, status, conclusion, started_at: status === "queued" || status === "waiting" ? null : "2026-10-15T00:00:00Z" });

test("publish history: a started or finished publish step counts, in either publish job", () => {
  assert.equal(publishStepStarted([job("Publish to Open VSX", [step("in_progress", null)])]), true);
  assert.equal(publishStepStarted([job("Publish to VS Code Marketplace", [step("completed", "failure")])]), true);
  assert.equal(publishStepStarted([job("Publish to VS Code Marketplace", [step("completed", "success")])]), true);
});

test("publish history: a job cancelled awaiting approval, a skipped step, or a queued or waiting step does not count", () => {
  assert.equal(publishStepStarted([job("Publish to Open VSX", [])]), false);
  assert.equal(publishStepStarted([job("Publish to Open VSX", [step("completed", "skipped")])]), false);
  assert.equal(publishStepStarted([job("Publish to Open VSX", [step("queued", null)])]), false);
  assert.equal(publishStepStarted([job("Publish to Open VSX", [step("waiting", null)])]), false);
  assert.equal(publishStepStarted([job("Publish to Open VSX", [{ name: "Verify the target set before publishing", status: "completed", conclusion: "failure" }])]), false);
});

test("publish history: a step cancelled part-way counts, and a renamed job still counts (step name alone)", () => {
  assert.equal(publishStepStarted([job("Publish to Open VSX", [step("completed", "cancelled")])]), true);
  assert.equal(publishStepStarted([job("Publish (renamed)", [step("in_progress", null)])]), true);
});

test("gh argument contract: the tag is checked, the draft is created through the API, upload never clobbers, publish updates the id (v6.0.8 LD-4)", async () => {
  const seen = [];
  const verb = (a) => (a.includes("-X") ? a[a.indexOf("-X") + 1] : "GET");
  const exec = (args) => {
    seen.push(args);
    if (args[0] !== "api") return "";
    if (verb(args) === "POST") return JSON.stringify({ id: 5, tag_name: TAG, draft: true });
    if (verb(args) === "PATCH") return JSON.stringify({ id: 5, tag_name: TAG, draft: false });
    if (String(args[1]).includes("/git/ref/tags/")) return "{}";
    return JSON.stringify([[{ id: 5, tag_name: TAG, draft: true }]]);
  };
  const c = ghClient("o/r", exec);
  await c.createDraft(TAG, undefined);
  await c.uploadAsset(5, "/x/a.vsix", TAG);
  await c.publish(5, TAG);
  const ref = seen.findIndex((a) => a[0] === "api" && a[1] === `repos/o/r/git/ref/tags/${TAG}`);
  const post = seen.findIndex((a) => a[0] === "api" && verb(a) === "POST" && a.includes("repos/o/r/releases"));
  assert.ok(ref >= 0 && post > ref, "the tag ref is checked before the draft is created");
  assert.ok(seen[post].includes("draft=true") && seen[post].includes("generate_release_notes=true") && seen[post].includes(`tag_name=${TAG}`));
  const upload = seen.find((a) => a[0] === "release" && a[1] === "upload");
  assert.ok(!upload.includes("--clobber"));
  const patch = seen.find((a) => a[0] === "api" && verb(a) === "PATCH");
  assert.ok(patch.includes("repos/o/r/releases/5") && patch.includes("draft=false") && patch.includes("make_latest=true"));
  assert.equal(seen.filter((a) => a[0] === "release" && a[1] !== "upload").length, 0, "no tag-addressed create or edit");
  assert.ok(seen.filter((a) => a[0] === "api" && String(a.find((x) => String(x).includes("/releases?")) ?? "")).every((a) => a.includes("--paginate")));
});

// v6.0.8 LD-4.5: the tag's releases are re-listed before each upload.
function relistingClient({ addAfterFirstUpload = false, failSecondListing = false } = {}) {
  const client = memoryClient();
  let listings = 0;
  const listReleases = client.listReleases;
  client.listReleases = async () => {
    listings++;
    if (failSecondListing && listings === 2) throw new Error("HTTP 502 listing releases");
    return listReleases();
  };
  const uploadAsset = client.uploadAsset;
  let uploads = 0;
  client.uploadAsset = async (...args) => {
    await uploadAsset(...args);
    uploads++;
    if (addAfterFirstUpload && uploads === 1) (await listReleases()).push({ id: 99, tag_name: TAG, draft: false, assets: [] });
  };
  return client;
}

test("G8 a second release for the tag that appears during the uploads stops the run before the next upload", async () => {
  const client = relistingClient({ addAfterFirstUpload: true });
  await assert.rejects(publishRelease({ dir: makeSet(), tag: TAG }, client), /another release for v6\.0\.7 \(99\)/);
  assert.deepEqual(writes(client), ["createDraft", "uploadAsset"]);
});

test("G8b a re-listing that fails stops the run with nothing more uploaded", async () => {
  const client = relistingClient({ failSecondListing: true });
  await assert.rejects(publishRelease({ dir: makeSet(), tag: TAG }, client), /HTTP 502/);
  assert.deepEqual(writes(client), ["createDraft"]);
});

test("a published release holding an incomplete upload stops with zero writes", async () => {
  const dir = makeSet();
  const names = [...expectedAssets(dir).keys()];
  const assets = [...uploaded(dir, names.slice(1)), { id: "s", name: names[0], state: "starter", digest: null }];
  const client = memoryClient([{ id: 1, tag_name: TAG, draft: false, assets }]);
  await assert.rejects(publishRelease({ dir, tag: TAG }, client), /incomplete upload/);
  assert.deepEqual(client.calls, []);
});

test("release-artifacts.cjs and everything it requires load only Node built-ins", () => {
  const { builtinModules } = require("node:module");
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of fs.readFileSync(file, "utf8").matchAll(/require\("([^"]+)"\)/g)) {
      if (m[1].startsWith("./")) walk(path.join(path.dirname(file), m[1]));
      else assert.ok(builtinModules.includes(m[1].replace(/^node:/, "")), `${path.basename(file)} requires ${m[1]}`);
    }
  };
  walk(path.join(SCRIPTS, "release-artifacts.cjs"));
  assert.ok(seen.size >= 4);
});

// ---- history lookup self-presence (it must never pass while looking at nothing) ----

const { publishHistory } = require(path.join(SCRIPTS, "release-github.cjs"));
const fakeApi = (runs, jobsByKey = {}) => (route) => {
  if (/\/runs\?branch=/.test(route)) return [{ workflow_runs: runs }];
  const m = /runs\/(\d+)\/attempts\/(\d+)\/jobs/.exec(route);
  return [{ jobs: jobsByKey[`${m[1]}/${m[2]}`] ?? [] }];
};
const SELF = "Refuse to rebuild a version that is already published";
const running = [job("Build & Test", [{ name: SELF, status: "in_progress", conclusion: null, started_at: "2026-10-15T00:00:00Z" }])];
const ctx = (runs, jobs, over = {}) => ({ api: fakeApi(runs, { "100/2": running, "100/1": running, ...jobs }), repo: "o/r", workflow: "release.yml", ref: TAG, runId: 100, attempt: 2, selfStep: SELF, sleep: async () => {}, ...over });

test("the current run missing from the filtered list stops (falsifier for the self-presence rule)", async () => {
  await assert.rejects(publishHistory(ctx([], {})), /do not include this run/);
});

test("the current run listed with a lower attempt than this one stops", async () => {
  await assert.rejects(publishHistory(ctx([{ id: 100, run_attempt: 1 }], {})), /do not include this run/);
});

test("with the current run present, an earlier attempt that started publishing is found; the current attempt is ignored", async () => {
  const started = [job("Publish to Open VSX", [{ name: PUBLISH_STEP, status: "completed", conclusion: "failure", started_at: "2026-10-15T00:00:00Z" }])];
  assert.equal(await publishHistory(ctx([{ id: 100, run_attempt: 2 }], { "100/1": started, "100/2": [...started, ...running] })), "run 100 attempt 1 started publishing");
  assert.equal(await publishHistory(ctx([{ id: 100, run_attempt: 1 }], { "100/1": [...started, ...running] }, { attempt: 1 })), null, "the current attempt itself is never counted");
});

test("a step reported cancelled but never started (no started_at) does not count", () => {
  assert.equal(publishStepStarted([job("Publish to Open VSX", [{ name: PUBLISH_STEP, status: "completed", conclusion: "cancelled", started_at: null }])]), false);
});

test("the current attempt's jobs not showing the running step stops (falsifier for step-level self-presence)", async () => {
  await assert.rejects(publishHistory(ctx([{ id: 100, run_attempt: 2 }], { "100/2": [] })), /do not show the running step/);
  const queuedSelf = [job("Build & Test", [{ name: SELF, status: "queued", conclusion: null, started_at: null }])];
  await assert.rejects(publishHistory(ctx([{ id: 100, run_attempt: 2 }], { "100/2": queuedSelf })), /do not show the running step/);
});

test("the running step appearing on a later read within the wait proceeds", async () => {
  let reads = 0;
  const api = (route) => {
    if (/\/runs\?branch=/.test(route)) return [{ workflow_runs: [{ id: 100, run_attempt: 2 }] }];
    if (/runs\/100\/attempts\/2\/jobs/.test(route)) return [{ jobs: ++reads < 3 ? [] : running }];
    return [{ jobs: [] }];
  };
  assert.equal(await publishHistory({ api, repo: "o/r", workflow: "release.yml", ref: TAG, runId: 100, attempt: 2, selfStep: SELF, sleep: async () => {} }), null);
  assert.equal(reads, 3);
});

test("the runs route uses the workflow-file parameter", async () => {
  const routes = [];
  const api = (route) => { routes.push(route); return /\/runs\?branch=/.test(route) ? [{ workflow_runs: [{ id: 100, run_attempt: 2 }] }] : [{ jobs: running }]; };
  await publishHistory({ api, repo: "o/r", workflow: "native-vsix-qualification.yml", ref: "release/v6.0.7-rc1", runId: 100, attempt: 2, selfStep: SELF, sleep: async () => {} });
  assert.match(routes[0], /actions\/workflows\/native-vsix-qualification\.yml\/runs\?branch=release%2Fv6\.0\.7-rc1/);
});
