#!/usr/bin/env node
/**
 * verify-release-provenance — read-only check that a release's published bytes
 * match its checksum manifest (FX975). It never uploads, publishes or edits.
 *
 *   node scripts/verify-release-provenance.cjs --version 6.0.7 --sums SHA256SUMS.txt
 *        [--tag v6.0.7 --commit <sha>] [--local <dir>] [--github] [--vscode] [--openvsx]
 *
 * Each check reports pass, fail or inconclusive. A target a marketplace does
 * not serve yet is inconclusive, never pass. Exit 0 = every check passed,
 * 1 = any check failed, 3 = no failure but something inconclusive, 2 = usage.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { NATIVE_TARGETS } = require("./native-targets.cjs");
const os = require("os");
const { parseSums, verifySet, expectedAssets, readManifest } = require("./release-artifacts.cjs");
const { vsixName } = require("./package-all-targets.cjs");

const REPO = "MythologIQ-Labs-LLC/FailSafe";
const PUBLISHER = "MythologIQ";
const NAME = "mythologiq-failsafe";
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const result = (check, status, detail, target) => ({ check, status, detail, ...(target ? { target } : {}) });

/** HTTP GET -> { status, body: Buffer }; a network error is status 0. Injected in tests. */
async function httpGet(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
  } catch (e) {
    return { status: 0, body: Buffer.from(String(e && e.message)) };
  }
}

/** A response that says nothing about the bytes: not served yet, rate limited, server or network error. */
const unknown = (status) => status === 404 || status === 429 || status === 0 || status >= 500;

/** TargetPlatform declared by downloaded VSIX bytes. */
function targetOf(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provenance-"));
  try {
    const f = path.join(dir, "p.vsix");
    fs.writeFileSync(f, bytes);
    return readManifest(f).targetPlatform;
  } catch {
    return undefined;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function checkTag(tag, commit, git) {
  const resolved = git(["rev-parse", `refs/tags/${tag}^{commit}`]);
  return resolved === commit
    ? result("tag", "pass", `${tag} -> ${commit}`)
    : result("tag", "fail", `${tag} -> ${resolved || "(missing)"}, expected ${commit}`);
}

/** The release's attachments are exactly the nine files, byte-equal to the manifest. */
async function checkGithub(tag, sums, sumsText, deps) {
  const expected = new Map(sums);
  expected.set("SHA256SUMS.txt", sha256(Buffer.from(sumsText, "utf8")));
  const release = await deps.githubRelease(tag);
  if (!release) return [result("github", "inconclusive", `no published GitHub Release for ${tag} (a draft is not visible without a token)`)];
  const out = [];
  for (const a of release.assets) if (!expected.has(a.name)) out.push(result("github", "fail", `unexpected attachment ${a.name}`));
  for (const [name, sha] of expected) {
    const a = release.assets.find((x) => x.name === name);
    if (!a) { out.push(result("github", "fail", `${name} is not attached`)); continue; }
    const r = await deps.get(a.browser_download_url);
    if (r.status !== 200) { out.push(result("github", "inconclusive", `${name}: HTTP ${r.status}`)); continue; }
    out.push(sha256(r.body) === sha
      ? result("github", "pass", `${name} matches`)
      : result("github", "fail", `${name} differs from the manifest`));
  }
  if (release.draft) out.push(result("github", "inconclusive", `${tag} is still a draft`));
  return out;
}

function vscodeUrl(version, target) {
  return `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${PUBLISHER}/vsextensions/${NAME}/${version}/vspackage?targetPlatform=${target}`;
}

async function checkVscode(version, sums, deps, skip = new Set()) {
  const out = [];
  for (const target of Object.keys(NATIVE_TARGETS)) {
    if (skip.has(`vscode-marketplace:${target}`)) { out.push(result("vscode-marketplace", "pass", `${target} matches`, target)); continue; }
    const name = vsixName(version, target);
    const r = await deps.get(vscodeUrl(version, target));
    if (r.status !== 200) { out.push(result("vscode-marketplace", unknown(r.status) ? "inconclusive" : "fail", `${target}: HTTP ${r.status}`)); continue; }
    if (sha256(r.body) === sums.get(name)) { out.push(result("vscode-marketplace", "pass", `${target} matches`, target)); continue; }
    const served = deps.targetOf(r.body);
    out.push(result("vscode-marketplace", "fail", served !== target
      ? `${target}: the marketplace served a ${served ?? "unreadable"} package (wrong target)`
      : `${target}: published bytes differ from ${name}`));
  }
  return out;
}

async function checkOpenVsx(version, sums, deps, skip = new Set()) {
  const out = [];
  for (const target of Object.keys(NATIVE_TARGETS)) {
    if (skip.has(`open-vsx:${target}`)) { out.push(result("open-vsx", "pass", `${target} matches`, target)); continue; }
    const name = vsixName(version, target);
    const meta = await deps.get(`https://open-vsx.org/api/${PUBLISHER}/${NAME}/${target}/${version}`);
    if (meta.status !== 200) { out.push(result("open-vsx", unknown(meta.status) ? "inconclusive" : "fail", `${target}: HTTP ${meta.status}`)); continue; }
    const doc = JSON.parse(meta.body.toString("utf8"));
    if (doc.targetPlatform !== target || doc.version !== version) {
      out.push(result("open-vsx", "fail", `${target}: Open VSX reports ${doc.targetPlatform} ${doc.version}`));
      continue;
    }
    const bytes = await deps.get(doc.files.download);
    if (bytes.status !== 200) { out.push(result("open-vsx", unknown(bytes.status) ? "inconclusive" : "fail", `${target}: download HTTP ${bytes.status}`)); continue; }
    const declared = (await deps.get(doc.files.sha256)).body.toString("utf8").trim().split(/\s+/)[0];
    const actual = sha256(bytes.body);
    if (actual !== sums.get(name)) out.push(result("open-vsx", "fail", `${target}: published bytes differ from ${name}`));
    else if (declared !== actual) out.push(result("open-vsx", "fail", `${target}: Open VSX's own sha256 disagrees with its bytes`));
    else out.push(result("open-vsx", "pass", `${target} matches`, target));
  }
  return out;
}

/**
 * Re-check the marketplaces until every target passes, any target fails, or the
 * deadline passes. Targets that passed are not downloaded again.
 */
async function pollMarkets(markets, waitSeconds, deps) {
  const passed = new Set();
  const deadline = deps.now() + waitSeconds * 1000;
  for (;;) {
    const results = await markets(passed);
    for (const r of results) if (r.status === "pass" && r.target) passed.add(`${r.check}:${r.target}`);
    const code = summarize(results);
    if (code !== 3 || deps.now() + deps.intervalMs > deadline) return results;
    await deps.sleep(deps.intervalMs);
  }
}

function summarize(results) {
  if (results.some((r) => r.status === "fail")) return 1;
  if (results.some((r) => r.status === "inconclusive")) return 3;
  return 0;
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function defaultDeps() {
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });
  return {
    get: httpGet,
    targetOf,
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    intervalMs: 120000,
    git: (args) => { try { return execFileSync("git", args, { encoding: "utf8" }).trim(); } catch { return ""; } },
    githubRelease: async (tag) => {
      try { return JSON.parse(gh(["api", `repos/${REPO}/releases/tags/${tag}`])); } catch { return null; }
    },
  };
}

async function run(argv, deps = defaultDeps()) {
  const version = arg(argv, "--version");
  const sumsFile = arg(argv, "--sums");
  if (!version || !sumsFile) throw Object.assign(new Error("usage: --version <v> --sums <SHA256SUMS.txt> [checks]"), { code: 2 });
  const sumsText = fs.readFileSync(sumsFile, "utf8");
  const sums = parseSums(sumsText);
  const results = [];
  if (argv.includes("--tag")) results.push(checkTag(arg(argv, "--tag"), arg(argv, "--commit"), deps.git));
  if (argv.includes("--local")) {
    const errors = verifySet(path.resolve(arg(argv, "--local")), version);
    results.push(...(errors.length ? errors.map((e) => result("local", "fail", e)) : [result("local", "pass", "eight packages match")]));
    const local = expectedAssets(path.resolve(arg(argv, "--local")));
    for (const [name, sha] of sums) if (local.get(name) !== sha) results.push(result("local", "fail", `${name}: local manifest differs from --sums`));
  }
  if (argv.includes("--github")) results.push(...await checkGithub(arg(argv, "--tag") ?? `v${version}`, sums, sumsText, deps));
  const markets = async (skip) => [
    ...(argv.includes("--vscode") ? await checkVscode(version, sums, deps, skip) : []),
    ...(argv.includes("--openvsx") ? await checkOpenVsx(version, sums, deps, skip) : []),
  ];
  const waitSeconds = Number(arg(argv, "--wait") ?? 0);
  results.push(...(waitSeconds > 0 ? await pollMarkets(markets, waitSeconds, deps) : await markets(new Set())));
  if (results.length === 0) throw Object.assign(new Error("no check selected"), { code: 2 });
  return { results, code: summarize(results) };
}

if (require.main === module) {
  run(process.argv.slice(2)).then(({ results, code }) => {
    for (const r of results) console.log(`[${r.status.toUpperCase()}] ${r.check}: ${r.detail}`);
    process.exitCode = code;
  }, (err) => { console.error(err.message); process.exitCode = err.code === 2 ? 2 : 1; });
}

module.exports = { run, checkTag, checkGithub, checkVscode, checkOpenVsx, pollMarkets, summarize, vscodeUrl };
