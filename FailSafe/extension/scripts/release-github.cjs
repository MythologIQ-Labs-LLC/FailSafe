/**
 * release-github — the GitHub and marketplace clients release-artifacts.cjs
 * uses (FX974): gh-backed, in-memory (rehearsal and tests), and the lookups
 * behind the one-set-per-release guard. Node built-ins only.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { NATIVE_TARGETS } = require("./native-targets.cjs");

/** The step name both publish jobs use; the guard looks for it in run history. */
const PUBLISH_STEP = "Publish every target VSIX";
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const ghExec = (args, opts = {}) => execFileSync("gh", args, { encoding: opts.binary ? "buffer" : "utf8", maxBuffer: 1 << 28 });

/**
 * Waits between release listings after creating a draft. GitHub can take a
 * few seconds to list a new draft (the v6.0.7 publish stopped on "found 0").
 */
const DRAFT_LIST_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * gh-backed release client. `exec` and `sleep` are injectable so the argument
 * contract and the draft-listing wait are testable.
 */
function ghClient(repo, exec = ghExec, { sleep = realSleep, draftListDelaysMs = DRAFT_LIST_DELAYS_MS } = {}) {
  const pages = (route) => JSON.parse(exec(["api", "--paginate", "--slurp", route])).flat();
  const draftsFor = async (tag) => (await pages(`repos/${repo}/releases?per_page=100`)).filter((r) => r.tag_name === tag);
  return {
    listReleases: async () => pages(`repos/${repo}/releases?per_page=100`),
    listAssets: async (id) => pages(`repos/${repo}/releases/${id}/assets?per_page=100`),
    createDraft: async (tag, notes) => {
      const notesArgs = notes && fs.existsSync(notes) && fs.statSync(notes).size > 0 ? ["--notes-file", notes] : ["--generate-notes"];
      exec(["release", "create", tag, "--repo", repo, "--draft", "--verify-tag", "--title", `${tag} — FailSafe`, ...notesArgs]);
      // Zero matches may be listing lag, so list again; more than one is never retried.
      let created = await draftsFor(tag);
      let waited = 0;
      for (const delay of draftListDelaysMs) {
        if (created.length !== 0) break;
        await sleep(delay);
        waited += delay;
        created = await draftsFor(tag);
      }
      if (created.length !== 1) {
        const lag = created.length === 0 ? ` (${draftListDelaysMs.length + 1} listings over ${waited / 1000} s)` : "";
        throw Object.assign(new Error(`expected one release for ${tag} after creating the draft, found ${created.length}${lag}`), { stop: true });
      }
      return created[0];
    },
    deleteAsset: async (id) => exec(["api", "-X", "DELETE", `repos/${repo}/releases/assets/${id}`]),
    // No --clobber: an existing name is never replaced (planRelease stopped on any conflict).
    uploadAsset: async (_id, file, tag) => exec(["release", "upload", tag, file, "--repo", repo]),
    downloadAsset: async (asset) => exec(["api", "-H", "Accept: application/octet-stream", `repos/${repo}/releases/assets/${asset.id}`], { binary: true }),
    publish: async (_id, tag) => exec(["release", "edit", tag, "--repo", repo, "--draft=false", "--latest"]),
  };
}

/** An in-memory GitHub: records the calls a real run would make. */
function memoryClient(initial = []) {
  const calls = [];
  const releases = initial.map((r) => ({ ...r, assets: [...(r.assets ?? [])] }));
  const find = (id) => releases.find((r) => r.id === id);
  return {
    calls,
    listReleases: async () => releases,
    listAssets: async (id) => find(id).assets,
    createDraft: async (tag) => { calls.push(["createDraft", tag]); const r = { id: releases.length + 1, tag_name: tag, draft: true, assets: [] }; releases.push(r); return r; },
    deleteAsset: async (assetId) => { calls.push(["deleteAsset", assetId]); for (const r of releases) r.assets = r.assets.filter((a) => a.id !== assetId); },
    uploadAsset: async (id, file) => {
      const name = path.basename(file);
      calls.push(["uploadAsset", name]);
      find(id).assets.push({ id: `${id}:${name}`, name, state: "uploaded", digest: `sha256:${sha256(fs.readFileSync(file))}` });
    },
    downloadAsset: async () => { throw new Error("in-memory assets always carry a digest"); },
    publish: async (id) => { calls.push(["publish", id]); find(id).draft = false; },
  };
}

/**
 * True when any job has a step named `name` that started: not queued, pending
 * or waiting, AND not skipped, AND with a start time. Matched on the step name
 * alone, so renaming a job cannot disable the guard.
 */
function stepStarted(jobs, name) {
  return jobs.some((job) => (job.steps ?? []).some((step) =>
    step.name === name && !["queued", "pending", "waiting"].includes(step.status) && step.conclusion !== "skipped" && Boolean(step.started_at)));
}
const publishStepStarted = (jobs) => stepStarted(jobs, PUBLISH_STEP);
const stepRunning = (jobs, name) => jobs.some((job) => (job.steps ?? []).some((step) => step.name === name && step.status === "in_progress" && Boolean(step.started_at)));

/**
 * The runs of `workflow` for `ref`, every attempt's jobs, excluding the current
 * attempt. It must find the current run in the list (with at least the current
 * attempt), or it stops: an empty or mis-filtered list must never read as
 * "nothing published".
 */
async function publishHistory({ api, repo, workflow, ref, runId, attempt, selfStep, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), waitMs = 90000 }) {
  const runs = api(`repos/${repo}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(ref)}&per_page=100`).flatMap((p) => p.workflow_runs ?? p);
  const self = runs.find((r) => String(r.id) === String(runId));
  if (!self || Number(self.run_attempt) < Number(attempt)) {
    throw new Error(`the ${workflow} runs listed for ${ref} do not include this run (${runId} attempt ${attempt}); refusing to trust the history`);
  }
  // The same jobs request and parsing must see this very step running, or an
  // empty or misread jobs list could pass as "nothing published".
  const jobsOf = (id, n) => api(`repos/${repo}/actions/runs/${id}/attempts/${n}/jobs?per_page=100`).flatMap((p) => p.jobs ?? []);
  for (let waited = 0; ; waited += 5000) {
    const own = jobsOf(runId, attempt);
    if (stepRunning(own, selfStep)) break;
    if (waited >= waitMs) {
      const seen = own.flatMap((j) => j.steps ?? []).find((st) => st.name === selfStep);
      throw new Error(`the jobs of this attempt do not show the running step "${selfStep}" (last seen: ${seen ? `${seen.status}, started ${seen.started_at ?? "never"}` : "absent"}); refusing to trust the history`);
    }
    await sleep(5000);
  }
  for (const run of runs) {
    for (let n = 1; n <= Number(run.run_attempt); n++) {
      if (String(run.id) === String(runId) && n === Number(attempt)) continue;
      if (publishStepStarted(jobsOf(run.id, n))) return `run ${run.id} attempt ${n} started publishing`;
    }
  }
  return null;
}

/**
 * Live lookups for the one-set guard. Each returns a reason string when
 * something for this version may already be public, or null. Any HTTP answer
 * other than 200/404 throws (the guard then stops).
 */
function liveLookups({ repo, runId, attempt, selfStep, workflow = "release.yml", exec = ghExec, fetchImpl = fetch }) {
  const api = (route) => JSON.parse(exec(["api", "--paginate", "--slurp", route])).flat();
  const anyTarget = (label, urlFor) => async (version) => {
    for (const target of Object.keys(NATIVE_TARGETS)) {
      const status = (await fetchImpl(urlFor(version, target), { redirect: "follow" })).status;
      if (status === 200) return `${label} serves ${target} ${version}`;
      if (status !== 404) throw new Error(`${label} answered HTTP ${status}`);
    }
    return null;
  };
  return {
    history: async (_version, tag) => publishHistory({ api, repo, workflow, ref: tag, runId, attempt, selfStep }),
    vscode: anyTarget("VS Code Marketplace", (v, t) => `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/MythologIQ/vsextensions/mythologiq-failsafe/${v}/vspackage?targetPlatform=${t}`),
    openvsx: anyTarget("Open VSX", (v, t) => `https://open-vsx.org/api/MythologIQ/mythologiq-failsafe/${t}/${v}`),
    release: async (_version, tag) => ((await ghClient(repo, exec).listReleases()).some((r) => r.tag_name === tag) ? `a GitHub Release exists for ${tag}` : null),
  };
}

/**
 * The rehearsal: the GitHub Release sequence against an in-memory GitHub, for a
 * new release and for a draft holding an interrupted upload. No GitHub writes.
 */
async function rehearseRelease(dir, tag, { publishRelease, expectedAssets }) {
  const fresh = memoryClient();
  await publishRelease({ dir, tag }, fresh);
  const first = [...expectedAssets(dir).keys()][0];
  const partial = memoryClient([{ id: 7, tag_name: tag, draft: true, assets: [{ id: "s", name: first, state: "starter", digest: null }] }]);
  await publishRelease({ dir, tag }, partial);
  return { fresh: fresh.calls, partial: partial.calls };
}

module.exports = { PUBLISH_STEP, ghClient, memoryClient, stepStarted, publishStepStarted, publishHistory, liveLookups, rehearseRelease };
