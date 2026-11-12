"use strict";
/**
 * G4 (#638): the archived TSA CRLs in tools/g4/tsa-crls/ (owner item 9).
 *
 * - Append-only: every CRL blob ever added in the history reachable from HEAD,
 *   through any parent of any merge, must still be present at HEAD at the same
 *   path with the same bytes, and no commit may delete, change or retype one
 *   (TSA_CRL_HISTORY). Limit: checkpoints do not bind the CRL set, so a history
 *   rewrite (force-push) that drops a CRL is visible only by comparing with an
 *   earlier clone; branch protection is what forbids such rewrites.
 * - Each file holds exactly one PEM CRL and nothing else, and that CRL must
 *   verify against one pinned root (TSA_CRL_MALFORMED, TSA_CRL_UNTRUSTED).
 *   Only OpenSSL's canonical re-encoding of each CRL reaches the trust file, so
 *   a CRL file can never add a trust anchor.
 * - assertSignerNotRevoked() consults EVERY archived CRL from the signer's
 *   issuing root, not only the one current at the token time. RFC 3161 section
 *   4: only a revocation whose reasonCode is unspecified, affiliationChanged,
 *   superseded or cessationOfOperation leaves tokens made before it valid. Any
 *   other reason, or no reasonCode at all, invalidates every token of that
 *   signer, earlier ones included.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { refuse, block } = require("./bytes.cjs");
const { git, requireBlob } = require("./git.cjs");
const layout = require("./layout.cjs");
const ts = require("./timestamp.cjs");

const PEM_CRL = /-----BEGIN X509 CRL-----[\s\S]+?-----END X509 CRL-----/g;
const PEM_CERT = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
const KEEPS_EARLIER = new Set(["Unspecified", "Affiliation Changed", "Superseded", "Cessation Of Operation"]);
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

const normSerial = (s) => s.replace(/[^0-9a-f]/gi, "").replace(/^0+/, "").toUpperCase();

/** `git log` over the CRL directory, every merge diffed against every parent (-m). */
function crlLog(repoRoot, head, args) {
  // Explicit flags, so the verifying machine's log.diffMerges / log.showRoot settings cannot narrow the view.
  const res = git(repoRoot, ["log", head, "--diff-merges=separate", "--root", "--full-history", "--no-renames", ...args, "--", `${layout.TSA_CRLS_DIR}/`]);
  if (res.status !== 0) throw block("REPO_UNREADABLE", "git log failed for the TSA CRLs");
  return res.stdout.split(/\r?\n/).filter(Boolean);
}

/** Every CRL blob ever added must still be at HEAD, unchanged; nothing may ever delete or change one. */
function assertAppendOnly(repoRoot, head) {
  const changed = crlLog(repoRoot, head, ["--format=%H", "--diff-filter=DMT"]);
  if (changed.length) throw refuse("TSA_CRL_HISTORY", `an archived CRL was removed or changed at ${changed[0].slice(0, 12)}; archived CRLs are append-only`);
  const res = git(repoRoot, ["ls-tree", "-r", "--full-tree", head, "--", `${layout.TSA_CRLS_DIR}/`]);
  if (res.status !== 0) throw block("REPO_UNREADABLE", "git ls-tree failed for the TSA CRLs");
  const atHead = new Map(res.stdout.split(/\r?\n/).filter(Boolean).map((l) => [l.split("\t")[1], l.split("\t")[0].split(" ")[2]]));
  for (const line of crlLog(repoRoot, head, ["--format=", "--raw", "--no-abbrev", "--diff-filter=A"])) {
    const [meta, rel] = line.split("\t");
    const blob = meta.split(" ")[3];
    if (atHead.get(rel) !== blob) throw refuse("TSA_CRL_HISTORY", `archived CRL ${rel} (blob ${blob.slice(0, 12)}) is not at HEAD unchanged; archived CRLs are append-only`);
  }
}

function opensslDate(text) {
  const m = /(\w{3})\s+(\d+) (\d\d):(\d\d):(\d\d) (\d{4}) GMT/.exec(text);
  return m ? new Date(Date.UTC(+m[6], MONTHS[m[1]], +m[2], +m[3], +m[4], +m[5])).toISOString() : null;
}

/** Revoked entries of one canonical CRL, from `openssl crl -text`. */
function revokedEntries(bin, file) {
  const out = ts.run(bin, ["crl", "-in", file, "-noout", "-text"]).out;
  return out.split(/Serial Number:/).slice(1).map((chunk) => ({
    serial: normSerial(chunk.split(/\r?\n/)[0]),
    date: opensslDate((/Revocation Date: ([^\r\n]+)/.exec(chunk) || [])[1] || ""),
    keepsEarlier: KEEPS_EARLIER.has(((/CRL Reason Code:\s*\r?\n\s*([A-Za-z ]+?)\s*(\r?\n|$)/.exec(chunk)) || [])[1]),
  }));
}

/** The pinned root (index) that signed `file`, or -1. */
function issuingRoot(bin, file, rootFiles) {
  return rootFiles.findIndex((rf) => /verify OK/.test(ts.run(bin, ["crl", "-in", file, "-CAfile", rf, "-noout"]).out));
}

function loadOne(ctx, rel, i) {
  const text = requireBlob(ctx.repoRoot, ctx.head, rel, "TSA_CRL_MALFORMED").toString("latin1");
  const blocks = text.match(PEM_CRL) || [];
  if (!rel.endsWith(".crl") || blocks.length !== 1 || text.replace(PEM_CRL, "").trim() !== "") {
    throw refuse("TSA_CRL_MALFORMED", `${rel} must hold exactly one PEM CRL and nothing else`);
  }
  const raw = path.join(ctx.tmpDir, `crl-raw-${i}.pem`);
  const canon = path.join(ctx.tmpDir, `crl-${i}.pem`);
  fs.writeFileSync(raw, blocks[0] + "\n");
  if (!ts.run(ctx.bin, ["crl", "-in", raw, "-outform", "PEM", "-out", canon]).ok) throw refuse("TSA_CRL_MALFORMED", `${rel} does not parse as a CRL`);
  const root = issuingRoot(ctx.bin, canon, ctx.rootFiles);
  if (root < 0) throw refuse("TSA_CRL_UNTRUSTED", `${rel} is not signed by a pinned TSA root`);
  return { rel, root, pem: fs.readFileSync(canon, "utf8"), revoked: revokedEntries(ctx.bin, canon) };
}

/**
 * Load and check every archived CRL at HEAD.
 * @param {{repoRoot:string, head:string, bin:string, tmpDir:string, rootPems:string[]}} o
 * @returns {{rootPems:string[], crls:object[]}}
 */
function loadCrlArchive(o) {
  assertAppendOnly(o.repoRoot, o.head);
  const rootFiles = o.rootPems.map((pem, i) => {
    const f = path.join(o.tmpDir, `root-${i}.pem`);
    fs.writeFileSync(f, pem);
    return f;
  });
  const res = git(o.repoRoot, ["ls-tree", "-r", "-z", "--name-only", o.head, "--", `${layout.TSA_CRLS_DIR}/`]);
  if (res.status !== 0) throw block("REPO_UNREADABLE", "git ls-tree failed for the TSA CRLs");
  const ctx = { ...o, rootFiles };
  return { rootPems: o.rootPems, crls: res.stdout.split("\0").filter(Boolean).map((rel, i) => loadOne(ctx, rel, i)) };
}

/** Non-CA certificates embedded in the token (and the committed chain, if any). */
function signerCerts(bin, tsrPath, chainPath, tmpDir) {
  const out = path.join(tmpDir, `signer-${crypto.randomBytes(6).toString("hex")}.pem`);
  ts.extractChain(bin, tsrPath, out);
  const text = fs.readFileSync(out, "utf8") + (chainPath && fs.existsSync(chainPath) ? fs.readFileSync(chainPath, "utf8") : "");
  return (text.match(PEM_CERT) || []).map((p) => new crypto.X509Certificate(p)).filter((c) => !c.ca);
}

/** Throws TSA_SIGNER_REVOKED if any archived CRL revokes the token's signer for this token time. */
function assertSignerNotRevoked(ctx, { tsrPath, chainPath, genTime, what }) {
  const roots = ctx.archive.rootPems.map((p) => new crypto.X509Certificate(p));
  const signers = signerCerts(ctx.openssl, tsrPath, chainPath, ctx.tmpDir);
  if (signers.length === 0) throw refuse("TOKEN_INVALID", `${what}: the token carries no TSA signer certificate`);
  for (const cert of signers) {
    const issuer = roots.findIndex((r) => cert.checkIssued(r) && cert.verify(r.publicKey));
    for (const crl of ctx.archive.crls.filter((c) => c.root === issuer)) {
      const hit = crl.revoked.find((e) => e.serial === normSerial(cert.serialNumber));
      if (hit && (!hit.keepsEarlier || !hit.date || Date.parse(hit.date) <= Date.parse(genTime))) {
        const why = hit.keepsEarlier ? `revoked ${hit.date}` : "revoked with a reason (or none) that invalidates every token";
        throw refuse("TSA_SIGNER_REVOKED", `${what}: TSA signer ${hit.serial} is ${why} in ${crl.rel}; token time ${genTime}`);
      }
    }
  }
}

module.exports = { loadCrlArchive, assertSignerNotRevoked };
