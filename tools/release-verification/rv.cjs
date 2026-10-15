#!/usr/bin/env node
/**
 * Wave 0 (#521): FailSafe release verification CLI.
 *
 *   node tools/release-verification/rv.cjs inventory   --dir DIR --version V [--sums FILE --sums-source KIND:REF] [--artifact-kind local-dir|ci-artifact] --json OUT
 *   node tools/release-verification/rv.cjs marketplace --version V --sums FILE --sums-source KIND:REF --download-dir DIR [--market vscode|openvsx|both] --json OUT
 *   node tools/release-verification/rv.cjs lifecycle   --code DIR --root ROOT --from VSIX --to VSIX [--to-sha256 HEX] --json OUT
 *   node tools/release-verification/rv.cjs report      --in FILE... --out DIR
 *
 * Exit codes: 0 pass, 1 verification failed, 2 usage / malformed input / unsafe
 * environment, 3 inconclusive or incomplete. Inconclusive is never a pass.
 * See README.md for the required-check table and the qualification sequences.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { EXIT, SEMVER, UsageError, check, exitFor, makeEvidence, validateEvidence } = require("./lib/evidence.cjs");

const MIN_NODE = [22, 13, 0];

function checkNode(version) {
  const parts = String(version).split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    if ((parts[i] || 0) !== MIN_NODE[i]) return (parts[i] || 0) > MIN_NODE[i];
  }
  return true;
}

function parseArgs(argv, { values = [], multi = [] }) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const name = flag.replace(/^--/, "");
    if (!flag.startsWith("--") || (!values.includes(name) && !multi.includes(name))) throw new UsageError(`unknown argument ${flag}`);
    if (multi.includes(name)) {
      out[name] = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[name].push(argv[++i]);
      if (out[name].length === 0) throw new UsageError(`${flag} needs at least one value`);
    } else {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new UsageError(`${flag} needs a value`);
      out[name] = argv[++i];
    }
  }
  return out;
}

function need(args, ...names) {
  for (const n of names) if (args[n] === undefined) throw new UsageError(`--${n} is required`);
}

function needVersion(v) {
  if (!SEMVER.test(String(v))) throw new UsageError(`--version must be x.y.z; got ${v}`);
  return v;
}

/** Reads and parses --sums / --sums-source; both or neither unless `required`. */
async function loadApprovedSums(args, version, fetch, { required = false } = {}) {
  const { parseSums, parseSumsSource, verifySumsSource } = require("./lib/sums.cjs");
  if (args.sums === undefined && args["sums-source"] === undefined && !required) return { approved: null, approvedSums: null, sumsCheck: null };
  need(args, "sums", "sums-source");
  const source = parseSumsSource(args["sums-source"]);
  let bytes;
  try {
    bytes = fs.readFileSync(args.sums);
  } catch (err) {
    throw new UsageError(`cannot read --sums ${args.sums}: ${err.message}`);
  }
  const approved = parseSums(bytes, version);
  return { approved, source, bytes, path: args.sums, verify: () => verifySumsSource(source, bytes, { fetch }) };
}

async function sumsEvidence(loaded) {
  if (!loaded.approved) return { approvedSums: null, sumsCheck: null };
  const v = await loaded.verify();
  return {
    approvedSums: { path: path.resolve(loaded.path), sha256: loaded.approved.sha256, source: { kind: loaded.source.kind, ref: loaded.source.ref, verified: v.verified } },
    sumsCheck: check("approved-sums", "artifact", null, v.status, v.detail, { kind: loaded.source.kind, ref: loaded.source.ref, verified: v.verified }),
  };
}

function writeEvidence(file, ev) {
  validateEvidence(ev);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(ev, null, 2)}\n`);
}

function summarize(io, label, checks) {
  const counts = checks.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
  for (const c of checks.filter((x) => x.status !== "pass")) io.log(`[${c.status.toUpperCase()}] ${c.scope}/${c.id}${c.target ? `/${c.target}` : ""}: ${c.detail}`);
  io.log(`[${label}] ${Object.entries(counts).map(([k, n]) => `${k}=${n}`).join(" ")}`);
}

async function cmdInventory(argv, io) {
  const args = parseArgs(argv, { values: ["dir", "version", "sums", "sums-source", "artifact-kind", "json"] });
  need(args, "dir", "version", "json");
  const version = needVersion(args.version);
  const artifactKind = args["artifact-kind"] ?? "local-dir";
  if (!["local-dir", "ci-artifact"].includes(artifactKind)) throw new UsageError("--artifact-kind must be local-dir or ci-artifact");
  const loaded = await loadApprovedSums(args, version, io.fetch);
  if (!fs.existsSync(args.dir) || !fs.statSync(args.dir).isDirectory()) throw new UsageError(`--dir ${args.dir} is not a directory`);
  const { inventoryDir } = require("./lib/inventory.cjs");
  const { approvedSums, sumsCheck } = await sumsEvidence(loaded);
  const { checks } = inventoryDir(args.dir, version, loaded.approved);
  const all = sumsCheck ? [sumsCheck, ...checks] : checks;
  writeEvidence(args.json, makeEvidence({ kind: "inventory", version, artifactSource: { kind: artifactKind, ref: path.resolve(args.dir) }, approvedSums, checks: all }));
  summarize(io, "inventory", all);
  return exitFor(all);
}

async function cmdMarketplace(argv, io) {
  const args = parseArgs(argv, { values: ["version", "sums", "sums-source", "download-dir", "market", "json"] });
  need(args, "version", "sums", "sums-source", "download-dir", "json");
  const version = needVersion(args.version);
  const market = args.market ?? "both";
  if (!["vscode", "openvsx", "both"].includes(market)) throw new UsageError("--market must be vscode, openvsx or both");
  const loaded = await loadApprovedSums(args, version, io.fetch, { required: true });
  if (loaded.source.kind === "local") throw new UsageError("marketplace verification needs approved sums from release-asset:TAG or run-artifact:RUN_ID, not local:PATH");
  const { runMarketplace } = require("./lib/marketplace.cjs");
  const { approvedSums, sumsCheck } = await sumsEvidence(loaded);
  const result = await runMarketplace({
    version, approved: loaded.approved, downloadDir: path.resolve(args["download-dir"]),
    markets: market === "both" ? ["vscode-marketplace", "open-vsx"] : [market === "vscode" ? "vscode-marketplace" : "open-vsx"],
    fetch: io.fetch, host: `${io.platform}-${io.arch}`, runSmoke: io.runSmoke,
  });
  const all = [sumsCheck, ...result.checks];
  writeEvidence(args.json, makeEvidence({ kind: "marketplace", version, artifactSource: { kind: "marketplace", ref: market }, approvedSums, checks: all, downloads: result.downloads }));
  summarize(io, "marketplace", all);
  return exitFor(all);
}

async function cmdLifecycle(argv, io) {
  const args = parseArgs(argv, { values: ["code", "root", "from", "to", "to-sha256", "json"] });
  need(args, "code", "root", "from", "to", "json");
  if (io.platform !== "win32" || io.arch !== "x64") throw new UsageError("lifecycle supports win32-x64 in Wave 0");
  const { runLifecycleCli } = require("./lib/lifecycle.cjs");
  const ev = await runLifecycleCli(args, io);
  writeEvidence(args.json, ev);
  summarize(io, "lifecycle", ev.checks);
  return exitFor(ev.checks);
}

async function cmdReport(argv, io) {
  const args = parseArgs(argv, { values: ["out"], multi: ["in"] });
  need(args, "in", "out");
  const { buildReport, writeReport } = require("./lib/report.cjs");
  const report = buildReport(args.in.map((f) => {
    let text;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch (err) {
      throw new UsageError(`cannot read ${f}: ${err.message}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new UsageError(`${f} is not JSON: ${err.message}`);
    }
    return { file: path.resolve(f), text, evidence: parsed };
  }));
  writeReport(args.out, report);
  io.log(`[report] mode=${report.mode} status=${report.status} -> ${path.resolve(args.out)}`);
  return report.exitCode;
}

const COMMANDS = { inventory: cmdInventory, marketplace: cmdMarketplace, lifecycle: cmdLifecycle, report: cmdReport };

/** @returns {Promise<number>} the exit code */
async function main(argv, ioIn = {}) {
  const io = {
    nodeVersion: process.versions.node, fetch: globalThis.fetch, platform: process.platform, arch: process.arch,
    log: (s) => console.log(s), error: (s) => console.error(s), runSmoke: undefined, ...ioIn,
  };
  if (!checkNode(io.nodeVersion)) {
    io.error(`rv requires Node 22.13 or later (node:sqlite); this is ${io.nodeVersion}`);
    return EXIT.USAGE;
  }
  const [cmd, ...rest] = argv;
  const run = COMMANDS[cmd];
  if (!run) {
    io.error(`usage: rv.cjs <${Object.keys(COMMANDS).join("|")}> ...`);
    return EXIT.USAGE;
  }
  try {
    return await run(rest, io);
  } catch (err) {
    if (err instanceof UsageError) {
      io.error(`[USAGE] ${err.message}`);
      return EXIT.USAGE;
    }
    io.error(`[ERROR] ${err.stack || err.message}`);
    return EXIT.INCONCLUSIVE;
  }
}

module.exports = { main, checkNode, parseArgs };

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
