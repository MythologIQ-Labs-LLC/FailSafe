/**
 * Wave 0 (#521): the evidence report (report.json + report.md).
 *
 * Mode comes from the kinds of evidence present, never from a flag or an input
 * field: MARKETPLACE VERIFICATION when a marketplace evidence file is among the
 * inputs, otherwise PRE-RELEASE REHEARSAL. Each mode has a fixed required-check
 * table (requiredChecks); both marketplaces are named literally, so evidence
 * covering one of them leaves the other's required checks absent.
 *
 * Status is a total function over every check present:
 *   any check failing (required or informational)            -> fail       (exit 1)
 *   else any required check absent, not-run or inconclusive  -> incomplete (exit 3)
 *   else verified (marketplace mode) / rehearsal-pass        ->            (exit 0)
 *
 * Binding: one version and one approved checksum set per report (exit 2
 * otherwise). The report re-derives what it can from raw records: the approved
 * set's sha256 against its file, every download record against its approved
 * line, and the lifecycle's installed bytes against the inventoried or
 * downloaded win32-x64 VSIX.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { EXIT, MARKETS, UsageError, validateEvidence } = require("./evidence.cjs");
const { parseSums } = require("./sums.cjs");
const { PER_TARGET_CHECKS } = require("./inventory.cjs");
const { STEPS } = require("./lifecycle.cjs");

const { NATIVE_TARGETS } = require(path.resolve(__dirname, "..", "..", "..", "FailSafe", "extension", "scripts", "native-targets.cjs"));

const REPORT_SCHEMA = "failsafe.release-verification.report/v1";
const REQUIRED_MARKETS = Object.freeze([...MARKETS]);
const TARGETS = Object.keys(NATIVE_TARGETS);
const HOST_TARGET = "win32-x64";
const RANK = { fail: 3, inconclusive: 2, "not-run": 1, pass: 0 };
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const keyOf = (c) => `${c.scope}/${c.id}/${c.target ?? "-"}`;

function lifecycleRequired() {
  return [
    `artifact/to-inventory/${HOST_TARGET}`,
    ...STEPS.map((s) => `lifecycle/${s.id}/${HOST_TARGET}`),
    `lifecycle/persistence/${HOST_TARGET}`,
    "isolation/home-registry/-",
    "report/lifecycle-binding/-",
  ];
}

/** The fixed required-check keys for a mode. */
function requiredChecks(mode) {
  if (mode === "pre-release-rehearsal") {
    return [
      "artifact/approved-sums/-", "report/approved-sums-file/-", "artifact/target-set/-",
      ...TARGETS.flatMap((t) => PER_TARGET_CHECKS.map((id) => `artifact/${id}/${t}`)),
      ...lifecycleRequired(),
    ];
  }
  return [
    "artifact/approved-sums/-", "report/approved-sums-file/-", "report/approved-sums-kind/-",
    ...REQUIRED_MARKETS.flatMap((m) => [
      `${m}/query/-`, `${m}/target-set/-`, ...(m === "open-vsx" ? [`${m}/extra-targets/-`] : []),
      ...TARGETS.flatMap((t) => ["listed", "download", "sha256", "inventory", "download-sha", ...(m === "vscode-marketplace" ? ["vsix-sha256-property"] : [])].map((id) => `${m}/${id}/${t}`)),
    ]),
    `vscode-marketplace/host-load/${HOST_TARGET}`,
    ...lifecycleRequired(),
  ];
}

function rc(scope, id, target, status, detail) {
  return { id, scope, target: target ?? null, status, detail, evidence: null };
}

/**
 * @param {{ file: string, text: string, evidence: object }[]} inputs
 * @throws {UsageError} exit 2 for schema errors, mixed versions, more than one approved set or lifecycle
 */
function buildReport(inputs) {
  if (!inputs.length) throw new UsageError("report needs at least one --in file");
  for (const i of inputs) {
    try {
      validateEvidence(i.evidence);
    } catch (err) {
      throw new UsageError(`${i.file}: ${err.message}`);
    }
  }
  const lifecycles = inputs.filter((i) => i.evidence.kind === "lifecycle");
  const others = inputs.filter((i) => i.evidence.kind !== "lifecycle");
  if (lifecycles.length > 1) throw new UsageError(`one lifecycle file per report; got ${lifecycles.map((i) => i.file).join(", ")}`);
  const versions = [...new Set(others.map((i) => i.evidence.version))];
  if (versions.length > 1) throw new UsageError(`mixed versions across inputs: ${others.map((i) => `${i.file}=${i.evidence.version}`).join(", ")}`);
  const version = versions[0] ?? lifecycles[0].evidence.version;
  const sumsSeen = new Map();
  for (const i of inputs) {
    const s = i.evidence.inputs.approvedSums;
    if (s) sumsSeen.set(s.sha256, [...(sumsSeen.get(s.sha256) ?? []), i.file]);
  }
  if (sumsSeen.size > 1) {
    throw new UsageError(`more than one approved checksum set across inputs: ${[...sumsSeen.entries()].map(([sha, files]) => `${sha} (${files.join(", ")})`).join(" vs ")}`);
  }
  const mode = inputs.some((i) => i.evidence.kind === "marketplace") ? "marketplace-verification" : "pre-release-rehearsal";

  const merged = new Map();
  const put = (c, file) => {
    const k = keyOf(c);
    const prev = merged.get(k);
    if (!prev || RANK[c.status] > RANK[prev.status]) merged.set(k, { ...c, key: k, file });
  };
  for (const i of inputs) for (const c of i.evidence.checks) put(c, i.file);

  // Approved set: its file must still hash to the recorded value.
  const sumsInput = inputs.find((i) => i.evidence.inputs.approvedSums);
  const approvedSums = sumsInput ? sumsInput.evidence.inputs.approvedSums : null;
  let entries = null;
  if (approvedSums) {
    let text = null;
    try {
      text = fs.readFileSync(approvedSums.path);
    } catch (err) {
      put(rc("report", "approved-sums-file", null, "inconclusive", `cannot read ${approvedSums.path}: ${err.message}`), "report");
    }
    if (text) {
      const actual = sha256(text);
      if (actual !== approvedSums.sha256) put(rc("report", "approved-sums-file", null, "fail", `${approvedSums.path} sha256 ${actual} differs from the recorded ${approvedSums.sha256}`), "report");
      else {
        try {
          entries = parseSums(text, version).entries;
          put(rc("report", "approved-sums-file", null, "pass", `${approvedSums.path} matches the recorded sha256`), "report");
        } catch (err) {
          put(rc("report", "approved-sums-file", null, "fail", err.message), "report");
        }
      }
    }
    if (mode === "marketplace-verification") {
      const okKind = ["release-asset", "run-artifact"].includes(approvedSums.source.kind);
      put(rc("report", "approved-sums-kind", null, okKind ? "pass" : "fail", okKind ? `${approvedSums.source.kind} (${approvedSums.source.verified})` : `approved sums of kind ${approvedSums.source.kind} cannot back a marketplace verification`), "report");
    }
  }

  // Every download record against its approved line.
  const downloads = inputs.filter((i) => i.evidence.kind === "marketplace").flatMap((i) => i.evidence.downloads);
  if (mode === "marketplace-verification") {
    for (const m of REQUIRED_MARKETS) {
      for (const t of TARGETS) {
        const d = downloads.find((x) => x.marketplace === m && x.target === t);
        if (!d) continue;
        if (!entries) put(rc(m, "download-sha", t, "inconclusive", "the approved set could not be read"), "report");
        else put(rc(m, "download-sha", t, entries[t]?.sha256 === d.sha256 ? "pass" : "fail", entries[t]?.sha256 === d.sha256 ? "download record equals the approved line" : `download record ${d.sha256} differs from approved ${entries[t]?.sha256 ?? "(none)"}`), "report");
      }
    }
  }

  // The lifecycle must have run on the bytes this report covers.
  const life = lifecycles[0]?.evidence;
  if (life) {
    const to = life.inputs.vsix.to;
    let expected = null;
    let source;
    if (mode === "marketplace-verification") {
      expected = downloads.find((x) => x.marketplace === "vscode-marketplace" && x.target === HOST_TARGET)?.sha256 ?? null;
      source = `the vscode-marketplace ${HOST_TARGET} download`;
    } else {
      expected = merged.get(`artifact/archive/${HOST_TARGET}`)?.evidence?.sha256 ?? null;
      source = `the inventoried ${HOST_TARGET} VSIX`;
    }
    const problems = [];
    if (!expected) put(rc("report", "lifecycle-binding", null, "inconclusive", `no sha256 for ${source}`), "report");
    else {
      if (to.sha256 !== expected) problems.push(`to sha256 ${to.sha256} differs from ${source} ${expected}`);
      if (to.version !== version) problems.push(`to version ${to.version} is not ${version}`);
      put(rc("report", "lifecycle-binding", null, problems.length ? "fail" : "pass", problems.join("; ") || `lifecycle ran on ${source}`), "report");
    }
  }

  // Informational: what Wave 0 cannot run, listed but never required.
  const why = "no runner in Wave 0 (Phase 5 not approved)";
  for (const t of TARGETS.filter((x) => x !== HOST_TARGET)) {
    put(rc("informational", "host-load", t, "not-run", why), "report");
    put(rc("informational", "lifecycle", t, "not-run", why), "report");
  }

  const requiredKeys = requiredChecks(mode);
  const requiredSet = new Set(requiredKeys);
  const required = requiredKeys.map((k) => ({ key: k, status: merged.get(k)?.status ?? "absent", detail: merged.get(k)?.detail ?? "absent from the inputs" }));
  const missing = required.filter((r) => r.status === "absent").map((r) => r.key);
  const all = [...merged.values()];
  let status;
  if (all.some((c) => c.status === "fail")) status = "fail";
  else if (required.some((r) => r.status !== "pass")) status = "incomplete";
  else status = mode === "marketplace-verification" ? "verified" : "rehearsal-pass";
  const exitCode = status === "fail" ? EXIT.FAIL : status === "incomplete" ? EXIT.INCONCLUSIVE : EXIT.PASS;
  return {
    schema: REPORT_SCHEMA, mode, status, exitCode, version,
    claims: { marketplaceVerified: status === "verified" },
    approvedSums,
    approvedSumsCheck: merged.get("artifact/approved-sums/-")?.status ?? null,
    inputs: inputs.map((i) => ({ file: i.file, kind: i.evidence.kind, version: i.evidence.version, sha256: sha256(i.text), gitSha: i.evidence.tool.gitSha })),
    required, missing,
    informational: all.filter((c) => !requiredSet.has(c.key) && (c.scope === "informational" || ["operator-registry", "residual-processes"].includes(c.id))),
    checks: all,
  };
}

function markdown(r) {
  const banner = r.mode === "marketplace-verification" ? "# MARKETPLACE VERIFICATION" : "# PRE-RELEASE REHEARSAL - NOT A MARKETPLACE VERIFICATION";
  // Backslashes first, so an input ending in a backslash cannot cancel the pipe escape.
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const lines = [banner, "", `FailSafe ${r.version}: status **${r.status}** (exit ${r.exitCode}); marketplaceVerified: ${r.claims.marketplaceVerified}.`, ""];
  if (r.mode !== "marketplace-verification") lines.push("This report covers local or CI artifacts. It says nothing about what the marketplaces serve.", "");
  lines.push(r.approvedSums ? `Approved sums: ${r.approvedSums.source.kind}:${r.approvedSums.source.ref} (${r.approvedSums.source.verified}; approved-sums check: ${r.approvedSumsCheck ?? "absent"}), sha256 ${r.approvedSums.sha256}` : "Approved sums: none in the inputs", "");
  lines.push("## Inputs", "", "| File | Kind | Version | sha256 |", "|---|---|---|---|", ...r.inputs.map((i) => `| ${esc(i.file)} | ${i.kind} | ${i.version} | ${i.sha256} |`), "");
  const failing = r.checks.filter((c) => c.status === "fail");
  lines.push("## Failing checks", "", ...(failing.length ? failing.map((c) => `- ${c.key}: ${esc(c.detail)}`) : ["None."]), "");
  const open = r.required.filter((x) => x.status !== "pass");
  lines.push("## Required checks not passing", "", ...(open.length ? open.map((x) => `- ${x.key} (${x.status}): ${esc(x.detail)}`) : ["None."]), "");
  lines.push(`## Required checks (${r.required.filter((x) => x.status === "pass").length}/${r.required.length} pass)`, "", "| Check | Status | Detail |", "|---|---|---|", ...r.required.map((x) => `| ${x.key} | ${x.status} | ${esc(x.detail)} |`), "");
  lines.push("## Informational (never required)", "", ...r.informational.map((c) => `- ${c.key} (${c.status}): ${esc(c.detail)}`), "");
  return `${lines.join("\n")}\n`;
}

function writeReport(dir, r) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "report.json"), `${JSON.stringify(r, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "report.md"), markdown(r));
}

module.exports = { REPORT_SCHEMA, REQUIRED_MARKETS, requiredChecks, buildReport, writeReport, markdown, keyOf };
