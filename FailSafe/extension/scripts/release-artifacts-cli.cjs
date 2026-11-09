"use strict";
// CLI commands of release-artifacts.cjs, split out for the Section 4 razor. Each command takes
// argv (command first) and returns an exit code; release-artifacts.cjs passes its exports in.
const path = require("path");
const { execFileSync } = require("child_process");
const { ghClient, liveLookups, rehearseRelease } = require("./release-github.cjs");

const lsRemote = (t) => execFileSync("git", ["ls-remote", "origin", `refs/tags/${t}`, `refs/tags/${t}^{}`], { encoding: "utf8" });

const arg = (argv, name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

function verifySetCommand(argv, { verifySet, SUMS }) {
  const [, dir] = argv;
  const version = arg(argv, "--version");
  const errors = verifySet(path.resolve(dir), version);
  for (const e of errors) console.error(`[FAIL] ${e}`);
  if (!errors.length) console.log(`[PASS] the ${version} release set matches ${SUMS} and targets.json`);
  return errors.length ? 1 : 0;
}

function checkTagCommand(argv, { checkRemoteTag }) {
  checkRemoteTag({ refType: process.env.GITHUB_REF_TYPE, tag: arg(argv, "--tag"), sha: process.env.GITHUB_SHA }, lsRemote);
  console.log(`[PASS] ${arg(argv, "--tag")} still points at ${process.env.GITHUB_SHA} on the remote`);
  return 0;
}

async function publishReleaseCommand(argv, { verifySet, checkRemoteTag, publishRelease, stop, SUMS }) {
  const [, dir] = argv;
  const repo = arg(argv, "--repo"), tag = arg(argv, "--tag");
  // --sha is the documented manual recovery (docs/RELEASE_RECOVERY.md): the
  // tag commit the operator approved, checked against the remote as in CI.
  const sha = arg(argv, "--sha") ?? process.env.GITHUB_SHA;
  const errors = verifySet(path.resolve(dir), tag.replace(/^v/, ""));
  if (errors.length) throw stop(`release artifact set rejected: ${errors.join("; ")}`);
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

async function alreadyPublishedCommand(argv, { alreadyPublished }) {
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

async function historyCheckCommand(argv) {
  // Read-only: proves this job's token can read Actions history (rehearsal).
  // The release guard's lookup and self-presence rule, on this workflow's own runs.
  const lookups = liveLookups({ repo: arg(argv, "--repo"), runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, workflow: arg(argv, "--workflow"), selfStep: arg(argv, "--self-step") });
  const reason = await lookups.history(undefined, arg(argv, "--ref"));
  console.log(`[PASS] ${arg(argv, "--workflow")} history for ${arg(argv, "--ref")} includes this run: ${reason ?? "no publish step started"}`);
  return 0;
}

async function rehearseCommand(argv, { publishRelease, expectedAssets }) {
  const [, dir] = argv;
  const calls = await rehearseRelease(path.resolve(dir), arg(argv, "--tag"), { publishRelease, expectedAssets });
  console.log(JSON.stringify(calls));
  return 0;
}

/** The command table; `core` is release-artifacts.cjs's exports. */
function commands(core) {
  return {
    "verify-set": (argv) => verifySetCommand(argv, core),
    "check-tag": (argv) => checkTagCommand(argv, core),
    "publish-release": (argv) => publishReleaseCommand(argv, core),
    "already-published": (argv) => alreadyPublishedCommand(argv, core),
    "history-check": (argv) => historyCheckCommand(argv),
    "rehearse": (argv) => rehearseCommand(argv, core),
  };
}

module.exports = { commands };
