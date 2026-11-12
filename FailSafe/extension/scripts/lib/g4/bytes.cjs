"use strict";
/**
 * G4 ledger witness (#638): byte-level primitives.
 *
 * Every G4 digest is taken over exact bytes. Nothing here reserializes JSON.
 */
const crypto = require("node:crypto");

const DOMAIN_TAG = Buffer.from("FailSafe-G4-v1\0", "utf8");
const HEX64 = /^[0-9a-f]{64}$/;

class G4Refusal extends Error {
  /**
   * @param {"REFUSED"|"BLOCKED"} verdict
   * @param {string} code stable machine-readable refusal code
   * @param {string} detail human-readable receipt
   */
  constructor(verdict, code, detail) {
    super(`${verdict} ${code}: ${detail}`);
    this.verdict = verdict;
    this.code = code;
    this.detail = detail;
  }
}

const refuse = (code, detail) => new G4Refusal("REFUSED", code, detail);
const block = (code, detail) => new G4Refusal("BLOCKED", code, detail);

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function u64be(n) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(n));
  return out;
}

/**
 * The RFC 3161 message imprint:
 * SHA-256("FailSafe-G4-v1\0" || u64be(len m) || m || u64be(len s) || s).
 */
function witnessImprint(manifestBytes, signatureBytes) {
  const framed = Buffer.concat([
    DOMAIN_TAG,
    u64be(manifestBytes.length),
    manifestBytes,
    u64be(signatureBytes.length),
    signatureBytes,
  ]);
  return sha256(framed);
}

/**
 * Imprint for any other G4 record: SHA-256(tag || for each part: u64be(len) || part).
 * Each record kind has its own tag, so no token can be replayed across kinds.
 */
function taggedImprint(tag, ...parts) {
  const framed = [Buffer.from(tag, "utf8")];
  for (const p of parts) framed.push(u64be(p.length), p);
  return sha256(Buffer.concat(framed));
}

/** Strict UTF-8 decode: refuses a BOM and any invalid sequence. */
function decodeUtf8Strict(buf, what) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    throw refuse("ENCODING_BOM", `${what} starts with a UTF-8 BOM`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    throw refuse("ENCODING_INVALID", `${what} is not valid UTF-8`);
  }
}

function isHex64(v) {
  return typeof v === "string" && HEX64.test(v);
}

module.exports = {
  DOMAIN_TAG,
  G4Refusal,
  refuse,
  block,
  sha256,
  u64be,
  witnessImprint,
  taggedImprint,
  decodeUtf8Strict,
  isHex64,
};
