/**
 * Wave 0 (#521): marketplace parity for one published version.
 *
 * Per marketplace, independently: the published target set must equal
 * NATIVE_TARGETS (no universal, none missing, none extra), every download must
 * be byte-identical to its approved SHA256SUMS line, and inventory must pass on
 * the downloaded bytes. Absence (not yet published, propagation, network) is
 * inconclusive, never a pass; an unrecognized response shape is inconclusive.
 *
 * Only the URL the API returns is allowlisted, before any request. fetch then
 * follows redirects (Open VSX serves downloads from blob storage); the final URL
 * is recorded, and integrity rests on the sha256 against the approved line.
 * Files are written as DOWNLOAD_DIR/<marketplace>/<vsixName(V, target)>.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { check } = require("./evidence.cjs");
const { inspectVsix } = require("./inventory.cjs");
const { sha256 } = require("./sums.cjs");

const SCRIPTS = path.resolve(__dirname, "..", "..", "..", "FailSafe", "extension", "scripts");
const { NATIVE_TARGETS } = require(path.join(SCRIPTS, "native-targets.cjs"));
const { vsixName } = require(path.join(SCRIPTS, "package-all-targets.cjs"));
const SMOKE_SCRIPT = path.join(SCRIPTS, "smoke-packaged-sqlite.cjs");

const VSM_QUERY_URL = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";
const VSM_HEADERS = { "Content-Type": "application/json", Accept: "application/json;api-version=7.2-preview.1" };
const VSM_BODY = { filters: [{ criteria: [{ filterType: 7, value: "MythologIQ.mythologiq-failsafe" }], pageSize: 1 }], flags: 147 };
const VSIX_PACKAGE = "Microsoft.VisualStudio.Services.VSIXPackage";
const VSIX_SHA_PROPERTY = "Microsoft.VisualStudio.Services.VsixSha256";
const OVSX_API = "https://open-vsx.org/api/MythologIQ/mythologiq-failsafe";
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const TARGETS = Object.keys(NATIVE_TARGETS);
const HOST_TARGET = "win32-x64";

function allowedHost(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname;
  return h === "open-vsx.org" || h === "marketplace.visualstudio.com" || h.endsWith(".gallerycdn.vsassets.io");
}

/** Download one target VSIX and judge it. Returns { checks, record, file, passed }. */
async function fetchTarget({ market, target, url, version, approved, downloadDir, fetch }) {
  const checks = [];
  const fail = (id, detail, status = "fail") => { checks.push(check(id, market, target, status, detail)); return { checks, record: null, file: null, passed: false }; };
  if (!url) return fail("download", "no download URL in the marketplace response");
  if (!allowedHost(url)) {
    let host = url;
    try { host = new URL(url).hostname; } catch { /* keep raw */ }
    return fail("download", `host not allowlisted: ${host} (not requested)`);
  }
  let res;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (err) {
    return fail("download", `${url}: ${err.message}`, "inconclusive");
  }
  if (!res.ok) return fail("download", `${url}: HTTP ${res.status}`, "inconclusive");
  const declared = Number(res.headers?.get?.("content-length") ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) return fail("download", `${url}: ${declared} bytes declared, over the ${MAX_DOWNLOAD_BYTES}-byte cap`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD_BYTES) return fail("download", `${url}: ${bytes.length} bytes, over the ${MAX_DOWNLOAD_BYTES}-byte cap`);
  const digest = sha256(bytes);
  const file = path.join(downloadDir, market, vsixName(version, target));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  const finalUrl = res.url || url;
  const record = { marketplace: market, target, apiUrl: url, finalUrl, sha256: digest, bytes: bytes.length };
  checks.push(check("download", market, target, "pass", finalUrl === url ? url : `${url} -> ${finalUrl}`, { file }));
  const line = approved.entries[target];
  const shaOk = Boolean(line) && line.sha256 === digest;
  checks.push(check("sha256", market, target, shaOk ? "pass" : "fail", shaOk ? `equals approved line ${line.file}` : `sha256 ${digest} differs from approved ${line?.sha256 ?? "(none)"}`, { sha256: digest, approved: line?.sha256 ?? null }));
  const inv = inspectVsix(bytes, version, { label: path.basename(file) });
  const problems = inv.checks.filter((c) => c.status !== "pass").map((c) => `${c.id}: ${c.detail}`);
  if (inv.target !== target) problems.push(`published as ${target} but the VSIX declares ${inv.target ?? "universal"}`);
  checks.push(check("inventory", market, target, problems.length ? "fail" : "pass", problems.join("; ") || "inventory passed on the downloaded bytes"));
  return { checks, record, file, passed: shaOk && problems.length === 0 };
}

function notRunTarget(market, target, why) {
  const ids = ["download", "sha256", "inventory", ...(market === "vscode-marketplace" ? ["vsix-sha256-property"] : [])];
  return ids.map((id) => check(id, market, target, "not-run", why));
}

async function getJson(fetch, url, init) {
  try {
    const res = await fetch(url, init);
    if (res.status === 404) return { status: 404 };
    if (!res.ok) return { status: res.status, error: `HTTP ${res.status}` };
    return { status: 200, json: await res.json() };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

async function vscodeMarketplace({ version, approved, downloadDir, fetch }) {
  const market = "vscode-marketplace";
  const checks = [];
  const downloads = [];
  const files = {};
  const incomplete = (detail) => {
    checks.push(check("query", market, null, "inconclusive", detail), check("target-set", market, null, "inconclusive", detail));
    for (const t of TARGETS) checks.push(check("listed", market, t, "inconclusive", detail), ...notRunTarget(market, t, detail));
    return { checks, downloads, files };
  };
  const q = await getJson(fetch, VSM_QUERY_URL, { method: "POST", headers: VSM_HEADERS, body: JSON.stringify(VSM_BODY) });
  if (q.status !== 200) return incomplete(`extensionquery: ${q.error ?? `HTTP ${q.status}`}`);
  if (!Array.isArray(q.json?.results)) return incomplete("extensionquery: unrecognized response shape (no results[])");
  const ext = q.json.results[0]?.extensions?.[0];
  if (!ext) return incomplete("extensionquery: MythologIQ.mythologiq-failsafe not found");
  if (!Array.isArray(ext.versions)) return incomplete("extensionquery: unrecognized response shape (no versions[])");
  if (ext.versionsTruncated === true) return incomplete("extensionquery: versionsTruncated is true; the version list is incomplete");
  const entries = ext.versions.filter((v) => v.version === version);
  if (entries.length === 0) return incomplete(`${version} is not listed on the VS Code Marketplace`);
  checks.push(check("query", market, null, "pass", `${entries.length} entries for ${version}`));
  const universal = entries.filter((e) => !e.targetPlatform);
  const listed = new Set(entries.filter((e) => e.targetPlatform).map((e) => e.targetPlatform));
  const missing = TARGETS.filter((t) => !listed.has(t));
  const extra = [...listed].filter((t) => !TARGETS.includes(t));
  const problems = [];
  if (universal.length) problems.push("universal published");
  if (missing.length) problems.push(`missing: ${missing.join(", ")}`);
  if (extra.length) problems.push(`extra: ${extra.join(", ")}`);
  checks.push(check("target-set", market, null, problems.length ? "fail" : "pass", problems.join("; ") || `exactly the ${TARGETS.length} NATIVE_TARGETS`));
  for (const t of TARGETS) {
    const entry = entries.find((e) => e.targetPlatform === t);
    if (!entry) {
      checks.push(check("listed", market, t, "fail", `${t} is not published for ${version}`), ...notRunTarget(market, t, "not listed"));
      continue;
    }
    checks.push(check("listed", market, t, "pass", `${version} ${t}`));
    const url = (entry.files ?? []).find((f) => f.assetType === VSIX_PACKAGE)?.source;
    const r = await fetchTarget({ market, target: t, url, version, approved, downloadDir, fetch });
    checks.push(...r.checks);
    if (!r.record) {
      checks.push(...notRunTarget(market, t, "download did not complete").filter((c) => !r.checks.some((x) => x.id === c.id)));
      continue;
    }
    downloads.push(r.record);
    if (r.passed) files[t] = r.file;
    const prop = (entry.properties ?? []).find((p) => p.key === VSIX_SHA_PROPERTY)?.value;
    if (prop === undefined) checks.push(check("vsix-sha256-property", market, t, "pass", "property absent"));
    else checks.push(check("vsix-sha256-property", market, t, prop === r.record.sha256 ? "pass" : "fail", prop === r.record.sha256 ? "VsixSha256 equals the downloaded bytes" : `VsixSha256 ${prop} differs from the downloaded ${r.record.sha256}`));
  }
  return { checks, downloads, files };
}

async function openVsx({ version, approved, downloadDir, fetch }) {
  const market = "open-vsx";
  const checks = [];
  const downloads = [];
  const per = {};
  for (const t of [...TARGETS, "universal"]) per[t] = await getJson(fetch, `${OVSX_API}/${t}/${version}`);
  const root = await getJson(fetch, `${OVSX_API}/${version}`);
  const rootKeys = root.status === 200 && root.json?.downloads && typeof root.json.downloads === "object" ? Object.keys(root.json.downloads) : null;
  const errors = Object.entries(per).filter(([, r]) => r.status !== 200 && r.status !== 404);
  const published = Object.entries(per).filter(([, r]) => r.status === 200).map(([t]) => t);

  if (published.length === 0 && errors.length === 0 && !rootKeys) {
    const why = `${version} is not published on Open VSX (every request 404)`;
    checks.push(check("query", market, null, "inconclusive", why), check("target-set", market, null, "inconclusive", why), check("extra-targets", market, null, "inconclusive", why));
    for (const t of TARGETS) checks.push(check("listed", market, t, "inconclusive", why), ...notRunTarget(market, t, why));
    return { checks, downloads };
  }
  checks.push(check("query", market, null, errors.length ? "inconclusive" : "pass", errors.length ? `request errors: ${errors.map(([t, r]) => `${t} ${r.error}`).join(", ")}` : `${published.length} target requests answered 200`));

  const missingFail = [];
  const missingIncon = [];
  for (const t of TARGETS) {
    const r = per[t];
    if (r.status === 200) {
      const url = r.json?.files?.download;
      if (!url) {
        checks.push(check("listed", market, t, "inconclusive", "unrecognized response shape (no files.download)"), ...notRunTarget(market, t, "no download URL"));
        missingIncon.push(t);
        continue;
      }
      checks.push(check("listed", market, t, "pass", `${version} ${t}`));
      const d = await fetchTarget({ market, target: t, url, version, approved, downloadDir, fetch });
      checks.push(...d.checks);
      if (d.record) downloads.push(d.record);
      else checks.push(...notRunTarget(market, t, "download did not complete").filter((c) => !d.checks.some((x) => x.id === c.id)));
    } else if (r.status === 404 && !(rootKeys ?? []).includes(t)) {
      checks.push(check("listed", market, t, "fail", `${t} is not published for ${version}`), ...notRunTarget(market, t, "not listed"));
      missingFail.push(t);
    } else {
      const why = r.status === 404 ? `root lists ${t} but its per-target request 404s (propagation)` : `request error: ${r.error}`;
      checks.push(check("listed", market, t, "inconclusive", why), ...notRunTarget(market, t, why));
      missingIncon.push(t);
    }
  }
  const universal = per.universal.status === 200 || (rootKeys ?? []).includes("universal");
  const problems = [];
  if (universal) problems.push("universal published");
  if (missingFail.length) problems.push(`missing: ${missingFail.join(", ")}`);
  const setStatus = problems.length ? "fail" : missingIncon.length ? "inconclusive" : "pass";
  checks.push(check("target-set", market, null, setStatus, problems.join("; ") || (missingIncon.length ? `unresolved: ${missingIncon.join(", ")}` : `exactly the ${TARGETS.length} NATIVE_TARGETS`)));
  if (!rootKeys) checks.push(check("extra-targets", market, null, "inconclusive", `root ${OVSX_API}/${version}: ${root.status === 404 ? "404" : root.error ?? "no downloads map"}; extra targets cannot be ruled out`));
  else {
    const extra = rootKeys.filter((k) => !TARGETS.includes(k) && k !== "universal");
    checks.push(check("extra-targets", market, null, extra.length ? "fail" : "pass", extra.length ? `extra: ${extra.join(", ")}` : "no target outside NATIVE_TARGETS"));
  }
  return { checks, downloads };
}

function defaultRunSmoke(file) {
  const r = spawnSync(process.execPath, [SMOKE_SCRIPT, file], { encoding: "utf8" });
  return { status: r.status, output: `${r.stdout}${r.stderr}`.trim() };
}

/** @returns {Promise<{ checks: object[], downloads: object[] }>} */
async function runMarketplace({ version, approved, downloadDir, markets, fetch, host, runSmoke = defaultRunSmoke }) {
  const checks = [];
  const downloads = [];
  let vsmFiles = {};
  if (markets.includes("vscode-marketplace")) {
    const r = await vscodeMarketplace({ version, approved, downloadDir, fetch });
    checks.push(...r.checks);
    downloads.push(...r.downloads);
    vsmFiles = r.files;
  }
  if (markets.includes("open-vsx")) {
    const r = await openVsx({ version, approved, downloadDir, fetch });
    checks.push(...r.checks);
    downloads.push(...r.downloads);
  }
  // The host load belongs to the vscode-marketplace run; an Open-VSX-only run emits nothing for it,
  // so a separate vscode-marketplace file's result is not masked when the report merges them.
  if (markets.includes("vscode-marketplace")) checks.push(await hostLoad({ host, file: vsmFiles[HOST_TARGET], runSmoke }));
  return { checks, downloads };
}

async function hostLoad({ host, file, runSmoke }) {
  const result = (status, detail) => check("host-load", "vscode-marketplace", HOST_TARGET, status, detail);
  if (host !== HOST_TARGET) return result("not-run", `host is ${host}; Wave 0 runs the packaged-binary load on ${HOST_TARGET} only`);
  if (!file) return result("not-run", `the ${HOST_TARGET} download did not pass sha256 and inventory; it is not loaded`);
  const r = await runSmoke(file);
  return result(r.status === 0 ? "pass" : "fail", r.output || `smoke exit ${r.status}`);
}

module.exports = { runMarketplace, allowedHost, VSM_QUERY_URL, VSM_HEADERS, VSM_BODY, OVSX_API, MAX_DOWNLOAD_BYTES };
