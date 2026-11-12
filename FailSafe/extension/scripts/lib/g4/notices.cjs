"use strict";
/**
 * G4 (#638): independently timestamped revocation notices (owner item 7).
 *
 * Every committed version of tools/g4/revocations.json from version 2 onward
 * must carry an RFC 3161 token, tools/g4/revocation-notices/v<N>.tsr, over
 * noticeImprint(the registry bytes of that version), validated at token time.
 * Version 1 must hold no notice. A notice first published in version N must be
 * effective no later than that version's token time, so a revocation can never
 * be dated after the moment it was independently witnessed, and the version
 * tokens must be in time order.
 */
const { refuse, taggedImprint } = require("./bytes.cjs");
const { showBlob, commitsTouching } = require("./git.cjs");
const layout = require("./layout.cjs");
const registry = require("./registry.cjs");
const { verifyStampBlob } = require("./tsa-trust.cjs");

const NOTICE_TAG = "FailSafe-G4-revocations-v1\0";
const MAX_SKEW_MS = 5 * 60 * 1000;

/** The RFC 3161 message imprint for one registry version's exact bytes. */
function noticeImprint(registryBytes) {
  return taggedImprint(NOTICE_TAG, registryBytes);
}

/** Each distinct committed registry version, oldest first, as { version, bytes, parsed }. */
function committedVersions(ctx) {
  const seen = new Map();
  for (const c of commitsTouching(ctx.repoRoot, layout.REGISTRY_PATH) || []) {
    const bytes = showBlob(ctx.repoRoot, c, layout.REGISTRY_PATH);
    const parsed = registry.parse(bytes);
    if (!seen.has(parsed.version)) seen.set(parsed.version, { version: parsed.version, bytes, parsed });
  }
  return [...seen.values()].sort((a, b) => a.version - b.version);
}

function checkVersion(ctx, v, published, previousTime) {
  const what = `revocation registry version ${v.version}`;
  const genTime = verifyStampBlob(ctx, { rel: layout.noticeTokenPath(v.version), imprintHex: noticeImprint(v.bytes), what, missingCode: "REVOCATION_UNSTAMPED" });
  if (previousTime && Date.parse(genTime) < Date.parse(previousTime)) {
    throw refuse("REVOCATION_TIME_ORDER", `${what}: token time ${genTime} precedes the previous version's ${previousTime}`);
  }
  for (const n of v.parsed.revocations.slice(published)) {
    if (Date.parse(n.effectiveUtc) - Date.parse(genTime) > MAX_SKEW_MS) {
      throw refuse("REVOCATION_POSTDATED", `${what}: notice for ${n.fingerprintSha256.slice(0, 16)} is effective ${n.effectiveUtc}, after its token time ${genTime}`);
    }
  }
  return genTime;
}

/**
 * Throws unless every committed registry version carries a valid, consistent
 * notice token. Returns, for each revoked fingerprint, the token time of the
 * version that first published its notice (when the revocation was witnessed).
 * @returns {Map<string, string>}
 */
function verifyNotices(ctx) {
  let published = 0;
  let previousTime = null;
  const witnessed = new Map();
  for (const v of committedVersions(ctx)) {
    if (v.version === 1 && v.parsed.revocations.length > 0) {
      throw refuse("REVOCATION_UNSTAMPED", "revocation registry version 1 holds a notice; notices start at version 2, each with a token");
    }
    if (v.version >= 2) previousTime = checkVersion(ctx, v, published, previousTime);
    for (const n of v.parsed.revocations.slice(published)) if (!witnessed.has(n.fingerprintSha256)) witnessed.set(n.fingerprintSha256, previousTime);
    published = v.parsed.revocations.length;
  }
  return witnessed;
}

module.exports = { NOTICE_TAG, noticeImprint, verifyNotices };
