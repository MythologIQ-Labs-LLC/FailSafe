/**
 * Wave 0 (#521): evidence schema failsafe.release-verification/v1, exit codes,
 * and the strict validator every subcommand and the report share.
 *
 * Unknown fields at any level are a schema error, except inside a check's
 * `evidence` object, which is declared free-form. tools/release-verification/
 * evidence.schema.json documents the same shape for external readers; a test
 * keeps the two in step.
 */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const SCHEMA = "failsafe.release-verification/v1";
const EXIT = Object.freeze({ PASS: 0, FAIL: 1, USAGE: 2, INCONCLUSIVE: 3 });
const KINDS = ["inventory", "marketplace", "lifecycle"];
const SCOPES = ["artifact", "vscode-marketplace", "open-vsx", "lifecycle", "isolation"];
const STATUSES = ["pass", "fail", "not-run", "inconclusive"];
const ARTIFACT_KINDS = ["local-dir", "ci-artifact", "marketplace"];
const SUMS_KINDS = ["release-asset", "run-artifact", "local"];
const SUMS_VERIFIED = ["fetched-equal", "attested", "local"];
const MARKETS = ["vscode-marketplace", "open-vsx"];
const SEMVER = /^\d+\.\d+\.\d+$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** An input, argument or environment problem: exit 2, decided before any work. */
class UsageError extends Error {
  constructor(message) {
    super(message);
    this.exitCode = EXIT.USAGE;
  }
}

function check(id, scope, target, status, detail, evidence = null) {
  return { id, scope, target: target ?? null, status, detail: String(detail ?? ""), evidence };
}

/** Subcommand exit: any fail -> 1 (outranks inconclusive), any inconclusive -> 3, else 0. */
function exitFor(checks) {
  if (checks.some((c) => c.status === "fail")) return EXIT.FAIL;
  if (checks.some((c) => c.status === "inconclusive")) return EXIT.INCONCLUSIVE;
  return EXIT.PASS;
}

let cachedSha;
function toolInfo() {
  if (cachedSha === undefined) {
    const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: path.resolve(__dirname, "..", "..", ".."), encoding: "utf8" });
    cachedSha = r.status === 0 ? r.stdout.trim() : "unknown";
  }
  return { gitSha: cachedSha, node: process.versions.node, platform: process.platform, arch: process.arch };
}

function makeEvidence({ kind, version, artifactSource, approvedSums = null, vsix = null, checks, downloads = [], processes = null }) {
  return {
    schema: SCHEMA, kind, version, generatedAt: new Date().toISOString(), tool: toolInfo(),
    inputs: { artifactSource, approvedSums, vsix }, checks, downloads, processes,
  };
}

class SchemaError extends UsageError {}

function fail(where, message) {
  throw new SchemaError(`evidence schema: ${where}: ${message}`);
}

function exactKeys(obj, keys, where) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) fail(where, "must be an object");
  for (const k of Object.keys(obj)) if (!keys.includes(k)) fail(`${where}.${k}`, "unknown field");
  for (const k of keys) if (!(k in obj)) fail(`${where}.${k}`, "missing");
}
const str = (v, where) => { if (typeof v !== "string") fail(where, "must be a string"); };
const oneOf = (v, list, where) => { if (!list.includes(v)) fail(where, `must be one of ${list.join(", ")}; got ${JSON.stringify(v)}`); };
const hex = (v, where) => { if (typeof v !== "string" || !HEX64.test(v)) fail(where, "must be 64 lowercase hex"); };
const int = (v, where) => { if (!Number.isInteger(v) || v < 0) fail(where, "must be a non-negative integer"); };

function validateVsixInfo(v, where) {
  exactKeys(v, ["path", "sha256", "version", "targetPlatform"], where);
  str(v.path, `${where}.path`);
  hex(v.sha256, `${where}.sha256`);
  if (!SEMVER.test(String(v.version))) fail(`${where}.version`, "must be x.y.z");
  if (v.targetPlatform !== null) str(v.targetPlatform, `${where}.targetPlatform`);
}

/** Throws SchemaError (exit 2) naming the first offending field. */
function validateEvidence(ev) {
  exactKeys(ev, ["schema", "kind", "version", "generatedAt", "tool", "inputs", "checks", "downloads", "processes"], "$");
  if (ev.schema !== SCHEMA) fail("$.schema", `must be ${SCHEMA}`);
  oneOf(ev.kind, KINDS, "$.kind");
  if (!SEMVER.test(String(ev.version))) fail("$.version", "must be x.y.z");
  str(ev.generatedAt, "$.generatedAt");
  exactKeys(ev.tool, ["gitSha", "node", "platform", "arch"], "$.tool");
  for (const k of ["gitSha", "node", "platform", "arch"]) str(ev.tool[k], `$.tool.${k}`);
  exactKeys(ev.inputs, ["artifactSource", "approvedSums", "vsix"], "$.inputs");
  exactKeys(ev.inputs.artifactSource, ["kind", "ref"], "$.inputs.artifactSource");
  oneOf(ev.inputs.artifactSource.kind, ARTIFACT_KINDS, "$.inputs.artifactSource.kind");
  str(ev.inputs.artifactSource.ref, "$.inputs.artifactSource.ref");
  const sums = ev.inputs.approvedSums;
  if (sums !== null) {
    exactKeys(sums, ["path", "sha256", "source"], "$.inputs.approvedSums");
    str(sums.path, "$.inputs.approvedSums.path");
    hex(sums.sha256, "$.inputs.approvedSums.sha256");
    exactKeys(sums.source, ["kind", "ref", "verified"], "$.inputs.approvedSums.source");
    oneOf(sums.source.kind, SUMS_KINDS, "$.inputs.approvedSums.source.kind");
    str(sums.source.ref, "$.inputs.approvedSums.source.ref");
    oneOf(sums.source.verified, SUMS_VERIFIED, "$.inputs.approvedSums.source.verified");
  } else if (ev.kind === "marketplace") {
    fail("$.inputs.approvedSums", "is mandatory for kind marketplace");
  }
  const vsix = ev.inputs.vsix;
  if (vsix !== null) {
    exactKeys(vsix, ["from", "to"], "$.inputs.vsix");
    validateVsixInfo(vsix.from, "$.inputs.vsix.from");
    validateVsixInfo(vsix.to, "$.inputs.vsix.to");
    if (ev.kind === "lifecycle" && vsix.to.version !== ev.version) fail("$.version", "a lifecycle file's version must equal inputs.vsix.to.version");
  } else if (ev.kind === "lifecycle") {
    fail("$.inputs.vsix", "is mandatory for kind lifecycle");
  }
  if (!Array.isArray(ev.checks)) fail("$.checks", "must be an array");
  ev.checks.forEach((c, i) => {
    const w = `$.checks[${i}]`;
    exactKeys(c, ["id", "scope", "target", "status", "detail", "evidence"], w);
    str(c.id, `${w}.id`);
    oneOf(c.scope, SCOPES, `${w}.scope`);
    if (c.target !== null) str(c.target, `${w}.target`);
    oneOf(c.status, STATUSES, `${w}.status`);
    str(c.detail, `${w}.detail`);
    if (c.evidence !== null && (typeof c.evidence !== "object" || Array.isArray(c.evidence))) fail(`${w}.evidence`, "must be an object or null");
  });
  if (!Array.isArray(ev.downloads)) fail("$.downloads", "must be an array");
  ev.downloads.forEach((d, i) => {
    const w = `$.downloads[${i}]`;
    exactKeys(d, ["marketplace", "target", "apiUrl", "finalUrl", "sha256", "bytes"], w);
    oneOf(d.marketplace, MARKETS, `${w}.marketplace`);
    str(d.target, `${w}.target`);
    str(d.apiUrl, `${w}.apiUrl`);
    str(d.finalUrl, `${w}.finalUrl`);
    hex(d.sha256, `${w}.sha256`);
    int(d.bytes, `${w}.bytes`);
  });
  if (ev.processes !== null) {
    exactKeys(ev.processes, ["owned", "residual"], "$.processes");
    for (const k of ["owned", "residual"]) {
      if (!Array.isArray(ev.processes[k])) fail(`$.processes.${k}`, "must be an array");
      ev.processes[k].forEach((p, i) => {
        exactKeys(p, ["pid", "exe"], `$.processes.${k}[${i}]`);
        int(p.pid, `$.processes.${k}[${i}].pid`);
        str(p.exe, `$.processes.${k}[${i}].exe`);
      });
    }
  }
  return ev;
}

module.exports = {
  SCHEMA, EXIT, KINDS, SCOPES, STATUSES, ARTIFACT_KINDS, SUMS_KINDS, SUMS_VERIFIED, MARKETS, SEMVER, HEX64,
  UsageError, SchemaError, check, exitFor, toolInfo, makeEvidence, validateEvidence,
};
