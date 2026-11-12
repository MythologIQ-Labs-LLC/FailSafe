"use strict";
/**
 * G4 (#638): TSA trust and token-time validation (owner item 9).
 *
 * Trust is the committed roots named by tools/g4/tsa-policy.json, each file
 * exactly one certificate whose DER SHA-256 is pinned, plus the committed CRLs
 * in tools/g4/tsa-crls/ (archived revocation evidence). Both are read from Git
 * at HEAD. A token is valid only when OpenSSL verifies its signature, its
 * imprint and its chain to a pinned root AT THE TOKEN'S OWN genTime, with the
 * TSA signer checked against a committed CRL that was current at that time.
 * A checkpoint therefore stays verifiable after its TSA signer expires, and a
 * signer revoked before the token's time is refused.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { refuse, block, sha256 } = require("./bytes.cjs");
const { requireBlob, showBlob } = require("./git.cjs");
const layout = require("./layout.cjs");
const ts = require("./timestamp.cjs");
const { loadCrlArchive, assertSignerNotRevoked } = require("./crl-archive.cjs");

const POLICY_SCHEMA = "failsafe-g4-tsa-policy/v1";
const PEM_CERT = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
const CRL_UNUSABLE = /unable to get certificate CRL|CRL has expired|CRL is not yet valid/i;

function readPolicy(repoRoot, head) {
  const raw = requireBlob(repoRoot, head, layout.TSA_POLICY_PATH, "TSA_POLICY_MISSING");
  let p;
  try {
    p = JSON.parse(raw.toString("utf8"));
  } catch {
    throw refuse("TSA_POLICY_MALFORMED", "tsa-policy.json is not JSON");
  }
  if (p.schema !== POLICY_SCHEMA || p.status !== "selected" || !Array.isArray(p.trustedRoots) || p.trustedRoots.length === 0) {
    throw block("TSA_POLICY_UNSELECTED", "no TSA trust root is selected in tools/g4/tsa-policy.json");
  }
  return p;
}

/** A root file holds exactly one certificate and nothing else, and its DER SHA-256 is the pinned one. */
function rootPem(repoRoot, head, r) {
  const text = requireBlob(repoRoot, head, r.certificatePath, "TSA_POLICY_MISSING").toString("utf8");
  const certs = text.match(PEM_CERT) || [];
  if (certs.length !== 1 || text.replace(PEM_CERT, "").trim() !== "") {
    throw refuse("TSA_ROOT_MALFORMED", `${r.name}: a root file must hold exactly one certificate and nothing else`);
  }
  let der;
  try {
    der = new crypto.X509Certificate(certs[0]).raw;
  } catch {
    throw refuse("TSA_POLICY_MALFORMED", "a trusted TSA root does not parse");
  }
  if (sha256(der) !== r.sha256) throw refuse("TSA_ROOT_MISMATCH", `${r.name}: root fingerprint differs from policy`);
  return certs[0];
}

/**
 * One CAfile for OpenSSL: the pinned roots (or a diagnostic --tsa-ca override)
 * followed by the canonical archived CRLs (crl-archive.cjs).
 * @returns {{file:string, archive:object}}
 */
function buildTrust({ repoRoot, head, bin, tmpDir, overrideCaFile }) {
  const rootPems = overrideCaFile
    ? fs.readFileSync(overrideCaFile, "utf8").match(PEM_CERT) || []
    : readPolicy(repoRoot, head).trustedRoots.map((r) => rootPem(repoRoot, head, r));
  const archive = loadCrlArchive({ repoRoot, head, bin, tmpDir, rootPems });
  const file = path.join(tmpDir, "tsa-trust.pem");
  fs.writeFileSync(file, [...rootPems, ...archive.crls.map((c) => c.pem)].join("\n") + "\n");
  return { file, archive };
}

function tokenFailure(what, out) {
  const why = `${what}: openssl ts -verify: ${out.split(/\r?\n/).slice(-2).join(" | ")}`;
  if (/imprint mismatch/i.test(out)) return refuse("TOKEN_IMPRINT_MISMATCH", why);
  if (/certificate revoked/i.test(out)) return refuse("TSA_SIGNER_REVOKED", why);
  if (CRL_UNUSABLE.test(out)) return block("TSA_REVOCATION_EVIDENCE_MISSING", why);
  return refuse("TOKEN_INVALID", why);
}

function readTokenInfo(bin, tsrPath, what) {
  try {
    return ts.tokenInfo(bin, tsrPath);
  } catch (err) {
    throw refuse("TOKEN_INVALID", `${what}: token does not parse: ${String(err.detail || err.message).split(/\r?\n/).pop()}`);
  }
}

/**
 * Validate one RFC 3161 token for `imprintHex` at its own genTime.
 * @returns {string} the token's genTime (ISO)
 */
function verifyStamp(ctx, { imprintHex, tsrPath, chainPath, what }) {
  const info = readTokenInfo(ctx.openssl, tsrPath, what);
  if (!info.granted) throw refuse("TOKEN_INVALID", `${what}: token status is not granted`);
  if (info.hashAlgorithm !== "sha256") throw refuse("TOKEN_INVALID", `${what}: token hash is ${info.hashAlgorithm}`);
  if (!info.genTime) throw refuse("TOKEN_INVALID", `${what}: token time unreadable`);
  const r = ts.verifyToken(ctx.openssl, { imprintHex, tsrPath, caFile: ctx.caFile, untrustedFile: chainPath, atTime: info.genTime });
  if (!r.ok) throw tokenFailure(what, r.out);
  assertSignerNotRevoked(ctx, { tsrPath, chainPath, genTime: info.genTime, what });
  return info.genTime;
}

/** Validate a token held only as a committed blob at HEAD. Missing is `missingCode`. */
function verifyStampBlob(ctx, { rel, imprintHex, what, missingCode }) {
  const buf = showBlob(ctx.repoRoot, ctx.head, rel);
  if (!buf) throw refuse(missingCode, `${what}: no RFC 3161 token at ${rel}`);
  const file = path.join(ctx.tmpDir, `blob-${sha256(Buffer.from(rel))}.tsr`);
  fs.writeFileSync(file, buf);
  return verifyStamp(ctx, { imprintHex, tsrPath: file, chainPath: null, what });
}

module.exports = { POLICY_SCHEMA, buildTrust, verifyStamp, verifyStampBlob };
