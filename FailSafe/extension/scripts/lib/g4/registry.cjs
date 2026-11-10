"use strict";
/**
 * G4 (#638): revocation registry (`tools/g4/revocations.json`).
 *
 * The registry is append-only and versioned. Every change bumps `version` by
 * at least one and keeps every earlier notice byte-for-byte (as parsed JSON).
 * A checkpoint binds the registry SHA-256 and version; the verifier refuses a
 * current registry that is older than, or diverges from, the latest bound one.
 */
const { refuse, decodeUtf8Strict, isHex64, sha256 } = require("./bytes.cjs");
const { showBlob, commitsTouching } = require("./git.cjs");

const SCHEMA = "failsafe-g4-revocations/v1";

function parse(buf) {
  let r;
  try {
    r = JSON.parse(decodeUtf8Strict(buf, "revocation registry"));
  } catch (err) {
    if (err && err.code) throw err;
    throw refuse("REGISTRY_MALFORMED", "revocation registry is not JSON");
  }
  if (!r || r.schema !== SCHEMA || !Number.isInteger(r.version) || r.version < 1 || !Array.isArray(r.revocations)) {
    throw refuse("REGISTRY_MALFORMED", "revocation registry schema/version/revocations");
  }
  for (const n of r.revocations) {
    if (!isHex64(n.fingerprintSha256) || Number.isNaN(Date.parse(n.effectiveUtc))) {
      throw refuse("REGISTRY_MALFORMED", "a revocation notice lacks fingerprintSha256/effectiveUtc");
    }
  }
  return r;
}

/** Refuses unless `next` is the same registry or an append-only successor of `prev`. */
function assertMonotonic(prev, next, where) {
  const a = parse(prev);
  const b = parse(next);
  if (b.version < a.version) throw refuse("REGISTRY_ROLLBACK", `${where}: version ${b.version} < ${a.version}`);
  if (b.version === a.version) {
    if (sha256(prev) !== sha256(next)) throw refuse("REGISTRY_EDITED", `${where}: version ${a.version} content changed`);
    return;
  }
  const kept = a.revocations.every((n, i) => JSON.stringify(n) === JSON.stringify(b.revocations[i]));
  if (!kept) throw refuse("REGISTRY_EDITED", `${where}: an earlier notice was removed or edited`);
}

/** Every committed version of the registry must be a monotonic successor of the one before. */
function assertGitHistoryMonotonic(repoRoot, registryPath) {
  const commits = commitsTouching(repoRoot, registryPath);
  if (!commits || commits.length === 0) throw refuse("REGISTRY_MISSING", `${registryPath} has no committed history`);
  let prev = null;
  for (const c of commits) {
    const buf = showBlob(repoRoot, c, registryPath);
    if (buf === null) throw refuse("REGISTRY_DELETED", `${registryPath} was deleted at ${c}`);
    if (prev) assertMonotonic(prev, buf, `git history at ${c.slice(0, 12)}`);
    prev = buf;
  }
  return commits.length;
}

/** The first notice revoking `fingerprint`, or null. */
function revocationFor(buf, fingerprint) {
  return parse(buf).revocations.find((n) => n.fingerprintSha256 === fingerprint) || null;
}

module.exports = { SCHEMA, parse, assertMonotonic, assertGitHistoryMonotonic, revocationFor };
