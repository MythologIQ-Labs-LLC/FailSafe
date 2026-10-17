#!/usr/bin/env node
/**
 * release-artifacts — the authoritative release artifact set (FX974).
 *
 * The release build packages every native target once and writes one
 * SHA256SUMS.txt. Each job that publishes or attaches packages checks that set
 * first (verify-set). The GitHub Release job attaches it with publishRelease:
 * draft first, only missing files uploaded, nothing ever replaced, published
 * only once all nine files match. Node built-ins only (publish jobs run no npm ci).
 *
 *   verify-set <dir> --version <v>          check-tag --tag <tag>
 *   publish-release <dir> --tag <tag> --repo <owner/name> [--notes <file>] [--sha <commit>]
 *   already-published --version <v> --tag <tag> --repo <r> --self-step <name> [--checks a,b]
 *   history-check --workflow <file> --ref <ref> --repo <r> --self-step <name>
 *   rehearse <dir> --tag <tag>              (in-memory GitHub client, no writes)
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { NATIVE_TARGETS } = require("./native-targets.cjs");
const { vsixName } = require("./package-all-targets.cjs");
const { extractPrefix } = require("./smoke-packaged-sqlite.cjs");
const { ghClient, liveLookups, rehearseRelease } = require("./release-github.cjs");

const SUMS = "SHA256SUMS.txt";
const SUMS_LINE = /^([0-9a-f]{64}) {2}([A-Za-z0-9._-]+)$/;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const stop = (message) => Object.assign(new Error(message), { stop: true });

/** SHA256SUMS.txt: LF only, "<lowercase sha>  <name>" per line, unique names, trailing LF. */
function parseSums(text) {
  if (text.includes("\r")) throw new Error(`${SUMS} contains CR characters`);
  if (!text.endsWith("\n")) throw new Error(`${SUMS} does not end with a newline`);
  const entries = new Map();
  for (const line of text.slice(0, -1).split("\n")) {
    const m = SUMS_LINE.exec(line);
    if (!m) throw new Error(`${SUMS} has a malformed line: ${JSON.stringify(line)}`);
    if (entries.has(m[2])) throw new Error(`${SUMS} lists ${m[2]} twice`);
    entries.set(m[2], m[1]);
  }
  return entries;
}

/** Version and TargetPlatform from the <Identity> element of extension.vsixmanifest. */
function readManifest(file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vsixmanifest-"));
  try {
    extractPrefix(fs.readFileSync(file), "extension.vsixmanifest", dir);
    const identity = /<Identity\b[^>]*>/.exec(fs.readFileSync(path.join(dir, "extension.vsixmanifest"), "utf8"))?.[0] ?? "";
    return { version: /\sVersion="([^"]+)"/.exec(identity)?.[1], targetPlatform: /\sTargetPlatform="([^"]+)"/.exec(identity)?.[1] };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The existing per-package validation; a subprocess because validate-vsix calls process.exit. */
function validateVsix(file) {
  const r = spawnSync(process.execPath, [path.join(__dirname, "validate-vsix.cjs"), file], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  return r.status === 0 ? null : (r.stderr || r.stdout || "validate-vsix failed").trim();
}

const expectedNames = (version) => Object.keys(NATIVE_TARGETS).map((target) => ({ target, name: vsixName(version, target) }));

function checkTargetsJson(dir, version, sums) {
  const p = path.join(dir, "targets.json");
  if (!fs.existsSync(p)) return ["targets.json is missing"];
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  const errors = doc.version === version ? [] : [`targets.json names version ${doc.version}, expected ${version}`];
  const listed = new Map((doc.targets ?? []).map((t) => [t.file, t.sha256]));
  if (listed.size !== sums.size) errors.push(`targets.json lists ${listed.size} packages, ${SUMS} lists ${sums.size}`);
  for (const [name, sha] of sums) if (listed.get(name) !== sha) errors.push(`targets.json disagrees with ${SUMS} for ${name}`);
  return errors;
}

function checkPackages(dir, version, sums, deps) {
  const errors = [];
  for (const { target, name } of expectedNames(version)) {
    const file = path.join(dir, name);
    if (!sums.has(name)) { errors.push(`${SUMS} does not list ${name}`); continue; }
    if (!fs.existsSync(file)) { errors.push(`${name} is missing`); continue; }
    if (sha256(fs.readFileSync(file)) !== sums.get(name)) { errors.push(`${name} does not match its ${SUMS} line`); continue; }
    const m = deps.readManifest(file);
    if (m.version !== version) errors.push(`${name} declares version ${m.version}, expected ${version}`);
    if (m.targetPlatform !== target) errors.push(`${name} declares target ${m.targetPlatform}, expected ${target}`);
    const invalid = deps.validateVsix(file);
    if (invalid) errors.push(`${name} failed validation: ${invalid}`);
  }
  return errors;
}

/** Problems with the set in `dir`; empty means exactly the eight target packages for `version`. */
function verifySet(dir, version, deps = { readManifest, validateVsix }) {
  const sumsPath = path.join(dir, SUMS);
  if (!fs.existsSync(sumsPath)) return [`${SUMS} is missing`];
  let sums;
  try { sums = parseSums(fs.readFileSync(sumsPath, "utf8")); } catch (e) { return [e.message]; }
  const expected = new Set(expectedNames(version).map((e) => e.name));
  const errors = [];
  for (const name of sums.keys()) if (!expected.has(name)) errors.push(`${SUMS} lists unexpected file ${name}`);
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".vsix") && !expected.has(f)) errors.push(`unexpected package ${f}`);
  return [...errors, ...checkTargetsJson(dir, version, sums), ...checkPackages(dir, version, sums, deps)];
}

/** name -> sha256 for the nine files a release carries: the packages and the manifest itself. */
function expectedAssets(dir) {
  const text = fs.readFileSync(path.join(dir, SUMS), "utf8");
  const expected = parseSums(text);
  expected.set(SUMS, sha256(Buffer.from(text, "utf8")));
  return expected;
}

/** Compare current assets ({ name, digest: "sha256:<hex>" | null }) with the expected files. */
async function planRelease(expected, assets, hashOf) {
  const plan = { upload: [], present: [], conflicts: [], unexpected: [], complete: false };
  const byName = new Map(assets.map((a) => [a.name, a]));
  for (const a of assets) if (!expected.has(a.name)) plan.unexpected.push(a.name);
  for (const [name, sha] of expected) {
    const a = byName.get(name);
    if (!a) { plan.upload.push(name); continue; }
    const digest = typeof a.digest === "string" && a.digest.startsWith("sha256:") ? a.digest.slice(7) : await hashOf(a);
    (digest === sha ? plan.present : plan.conflicts).push(name);
  }
  plan.complete = plan.upload.length === 0 && plan.conflicts.length === 0 && plan.unexpected.length === 0;
  return plan;
}

/** The tag's commit as the remote reports it (peeled for an annotated tag) must be the built commit. */
function checkRemoteTag({ refType, tag, sha }, lsRemote) {
  if (refType !== "tag") throw stop(`a GitHub Release is created only from a tag run (this is a ${refType || "unknown"} run)`);
  const refs = new Map(lsRemote(tag).split("\n").filter(Boolean).map((l) => l.split(/\s+/).reverse()));
  const commit = refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`);
  if (!commit) throw stop(`tag ${tag} does not exist on the remote`);
  if (commit !== sha) throw stop(`tag ${tag} points at ${commit} on the remote, but these packages were built from ${sha}`);
}

/** Draft first, upload only what is missing, never replace, publish only a complete set. */
async function publishRelease({ dir, tag, notes }, client) {
  const expected = expectedAssets(dir);
  const matches = (await client.listReleases()).filter((r) => r.tag_name === tag);
  if (matches.length > 1) throw stop(`${matches.length} releases exist for ${tag}; resolve this by hand`);
  let release = matches[0];
  const hashOf = async (asset) => sha256(await client.downloadAsset(asset));
  if (release && !release.draft) {
    const assets = await client.listAssets(release.id);
    if (assets.some((x) => x.state !== "uploaded")) throw stop(`published release ${tag} has an incomplete upload; nothing was changed`);
    const plan = await planRelease(expected, assets, hashOf);
    if (!plan.complete) throw stop(`published release ${tag} does not carry exactly the verified set (${JSON.stringify(plan)}); nothing was changed`);
    return { action: "unchanged", plan };
  }
  if (!release) release = await client.createDraft(tag, notes);
  for (const a of await client.listAssets(release.id)) if (a.state !== "uploaded") await client.deleteAsset(a.id);
  let plan = await planRelease(expected, await client.listAssets(release.id), hashOf);
  if (plan.conflicts.length || plan.unexpected.length) throw stop(`release ${tag} holds files that are not the verified set (${JSON.stringify(plan)}); nothing was uploaded`);
  for (const name of plan.upload) {
    // Uploads go by tag (gh has no upload by id): re-list first, so no other release for the tag can receive one.
    const others = (await client.listReleases()).filter((r) => r.tag_name === tag && r.id !== release.id);
    if (others.length) throw stop(`another release for ${tag} (${others.map((r) => r.id).join(", ")}) appeared beside draft ${release.id}; nothing more was uploaded`);
    await client.uploadAsset(release.id, path.join(dir, name), tag);
  }
  plan = await planRelease(expected, await client.listAssets(release.id), hashOf);
  if (!plan.complete) throw stop(`release ${tag} is incomplete after upload (${JSON.stringify(plan)}); it stays a draft`);
  await client.publish(release.id, tag);
  return { action: "published", plan };
}

/**
 * One set per release (LD7): before packaging, stop if anything for this
 * version may already be public. Each lookup returns a reason or null; a lookup
 * that throws stops the build too. A marketplace 404 is never proof of absence,
 * which is why the Actions history lookup comes first.
 */
async function alreadyPublished({ version, tag }, lookups) {
  const found = [];
  for (const [name, probe] of Object.entries(lookups)) {
    let reason;
    try { reason = await probe(version, tag); } catch (e) { throw stop(`could not check ${name} for ${version} (${e.message}); not building`); }
    if (reason) found.push(reason);
  }
  return { published: found.length > 0, found };
}

const lsRemote = (t) => execFileSync("git", ["ls-remote", "origin", `refs/tags/${t}`, `refs/tags/${t}^{}`], { encoding: "utf8" });

const arg = (argv, name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

async function main(argv) {
  const [cmd, dir] = argv;
  if (cmd === "verify-set") {
    const version = arg(argv, "--version");
    const errors = verifySet(path.resolve(dir), version);
    for (const e of errors) console.error(`[FAIL] ${e}`);
    if (!errors.length) console.log(`[PASS] the eight ${version} target packages match ${SUMS} and targets.json`);
    return errors.length ? 1 : 0;
  }
  if (cmd === "check-tag") {
    checkRemoteTag({ refType: process.env.GITHUB_REF_TYPE, tag: arg(argv, "--tag"), sha: process.env.GITHUB_SHA }, lsRemote);
    console.log(`[PASS] ${arg(argv, "--tag")} still points at ${process.env.GITHUB_SHA} on the remote`);
    return 0;
  }
  if (cmd === "publish-release") {
    const repo = arg(argv, "--repo"), tag = arg(argv, "--tag");
    // --sha is the documented manual recovery (docs/RELEASE_RECOVERY.md): the
    // tag commit the operator approved, checked against the remote as in CI.
    const sha = arg(argv, "--sha") ?? process.env.GITHUB_SHA;
    checkRemoteTag({ refType: arg(argv, "--sha") ? "tag" : process.env.GITHUB_REF_TYPE, tag, sha }, lsRemote);
    if (arg(argv, "--sha")) {
      // The manual path must not skip parity: both marketplaces have to serve
      // these exact bytes before the GitHub Release does.
      const { run } = require("./verify-release-provenance.cjs");
      const parity = await run(["--version", tag.replace(/^v/, ""), "--sums", path.join(path.resolve(dir), SUMS), "--vscode", "--openvsx"]);
      if (parity.code !== 0) throw stop(`both marketplaces must serve these exact packages first (provenance exit ${parity.code}); nothing was attached`);
    }
    const result = await publishRelease({ dir: path.resolve(dir), tag, notes: arg(argv, "--notes") }, ghClient(repo));
    console.log(`[PASS] release ${tag}: ${result.action}; ${result.plan.present.length} files verified`);
    return 0;
  }
  if (cmd === "already-published") {
    const version = arg(argv, "--version"), tag = arg(argv, "--tag");
    const all = liveLookups({ repo: arg(argv, "--repo"), runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, selfStep: arg(argv, "--self-step") });
    // --checks: the rehearsal has no release.yml run of its own, so it skips history.
    const names = (arg(argv, "--checks") ?? "history,vscode,openvsx,release").split(",");
    const r = await alreadyPublished({ version, tag }, Object.fromEntries(names.map((n) => [n, all[n]])));
    if (r.published) {
      console.error(`[FAIL] not building ${version}: ${r.found.join("; ")}. A second build would produce different bytes. Re-run only the failed jobs of the attempt that published, or follow docs/RELEASE_RECOVERY.md.`);
      return 1;
    }
    console.log(`[PASS] nothing for ${version} has been published or started publishing; building is safe`);
    return 0;
  }
  if (cmd === "history-check") {
    // Read-only: proves this job's token can read Actions history (rehearsal).
    // The release guard's lookup and self-presence rule, on this workflow's own runs.
    const lookups = liveLookups({ repo: arg(argv, "--repo"), runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, workflow: arg(argv, "--workflow"), selfStep: arg(argv, "--self-step") });
    const reason = await lookups.history(undefined, arg(argv, "--ref"));
    console.log(`[PASS] ${arg(argv, "--workflow")} history for ${arg(argv, "--ref")} includes this run: ${reason ?? "no publish step started"}`);
    return 0;
  }
  if (cmd === "rehearse") {
    const calls = await rehearseRelease(path.resolve(dir), arg(argv, "--tag"), { publishRelease, expectedAssets });
    console.log(JSON.stringify(calls));
    return 0;
  }
  throw new Error(`unknown command ${cmd}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { console.error(`[FAIL] ${err.message}`); process.exitCode = 1; });
}

module.exports = { parseSums, readManifest, verifySet, expectedAssets, expectedNames, planRelease, checkRemoteTag, publishRelease, alreadyPublished, main };
