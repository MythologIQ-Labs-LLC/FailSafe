/**
 * Wave 0 (#521): the approved checksum set (SHA256SUMS.txt from the release
 * run) and its provenance.
 *
 * The accepted form is exactly what package-all-targets.cjs writes: eight lines
 * "<64 lowercase hex>  <vsixName(V, target)>" joined by LF with a trailing LF.
 * Anything else is malformed (exit 2), never a partial set.
 */
"use strict";

const crypto = require("crypto");
const path = require("path");
const { UsageError, SEMVER } = require("./evidence.cjs");

const SCRIPTS = path.resolve(__dirname, "..", "..", "..", "FailSafe", "extension", "scripts");
const { NATIVE_TARGETS } = require(path.join(SCRIPTS, "native-targets.cjs"));
const { vsixName } = require(path.join(SCRIPTS, "package-all-targets.cjs"));

const RELEASE_ASSET_URL = (tag) => `https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/download/${encodeURIComponent(tag)}/SHA256SUMS.txt`;
const LINE = /^([0-9a-f]{64}) {2}(\S+)$/;
const MAX_SUMS_BYTES = 64 * 1024;
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

class SumsError extends UsageError {}

/**
 * Reads a fetch response body with a running byte cap; returns null (and stops
 * reading) as soon as the cap is exceeded. Streams when the body is a stream.
 */
async function readCapped(res, cap) {
  const declared = Number(res.headers?.get?.("content-length") ?? 0);
  if (declared > cap) return null;
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const chunks = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > cap) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > cap ? null : buf;
}

/** @returns {{ entries: Record<string, { sha256: string, file: string }>, sha256: string }} */
function parseSums(text, version) {
  const raw = Buffer.isBuffer(text) ? text.toString("utf8") : String(text);
  const bad = (why) => { throw new SumsError(`malformed approved sums: ${why}`); };
  if (!SEMVER.test(version)) bad(`version ${version} is not x.y.z`);
  if (raw.includes("\r")) bad("contains a CR (CRLF line endings are not the form package-all-targets writes)");
  if (!raw.endsWith("\n")) bad("missing the final newline");
  const lines = raw.slice(0, -1).split("\n");
  const targets = Object.keys(NATIVE_TARGETS);
  if (lines.length !== targets.length) bad(`expected ${targets.length} lines, found ${lines.length}`);
  const byName = new Map(targets.map((t) => [vsixName(version, t), t]));
  const entries = {};
  lines.forEach((line, i) => {
    const m = LINE.exec(line);
    if (!m) bad(`line ${i + 1} is not "<64 lowercase hex>  <name>"`);
    const target = byName.get(m[2]);
    if (!target) bad(`line ${i + 1} names ${m[2]}, which is not a ${version} target VSIX`);
    if (entries[target]) bad(`target ${target} is listed twice`);
    entries[target] = { sha256: m[1], file: m[2] };
  });
  return { entries, sha256: sha256(Buffer.from(raw, "utf8")) };
}

/** "release-asset:TAG" | "run-artifact:RUN_ID" | "local:PATH" */
function parseSumsSource(value) {
  const m = /^(release-asset|run-artifact|local):(.+)$/.exec(String(value ?? ""));
  if (!m) throw new UsageError(`--sums-source must be release-asset:TAG, run-artifact:RUN_ID or local:PATH; got ${value ?? "(none)"}`);
  return { kind: m[1], ref: m[2] };
}

/**
 * release-asset: fetch the public GitHub Release asset and require identical bytes.
 * run-artifact: operator-attested (no GitHub authentication here). local: rehearsal only.
 * @returns {Promise<{ status: "pass"|"fail"|"inconclusive", verified: string, detail: string }>}
 */
async function verifySumsSource(source, sumsBytes, { fetch }) {
  if (source.kind === "run-artifact") return { status: "pass", verified: "attested", detail: `operator-attested vsix-targets artifact of run ${source.ref}` };
  if (source.kind === "local") return { status: "pass", verified: "local", detail: `local file (rehearsal only): ${source.ref}` };
  const url = RELEASE_ASSET_URL(source.ref);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    return { status: "inconclusive", verified: "fetched-equal", detail: `${url}: ${err.message}` };
  }
  if (!res.ok) return { status: "inconclusive", verified: "fetched-equal", detail: `${url}: HTTP ${res.status}` };
  const body = await readCapped(res, MAX_SUMS_BYTES);
  if (!body) return { status: "fail", verified: "fetched-equal", detail: `${url}: body over the ${MAX_SUMS_BYTES}-byte cap` };
  const equal = sha256(body) === sha256(sumsBytes);
  return {
    status: equal ? "pass" : "fail",
    verified: "fetched-equal",
    detail: equal ? `public release asset ${url} is byte-identical` : `public release asset ${url} differs from --sums (sha256 ${sha256(body)} vs ${sha256(sumsBytes)})`,
  };
}

module.exports = { SumsError, parseSums, parseSumsSource, verifySumsSource, readCapped, RELEASE_ASSET_URL, MAX_SUMS_BYTES, sha256 };
