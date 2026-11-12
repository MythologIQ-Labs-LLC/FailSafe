#!/usr/bin/env node
/**
 * G4 (#638): create a revocation-notice token or a key-transition record.
 * OWNER WORKSTATION ONLY. Nothing is committed; review, then commit the new files.
 *
 *   node FailSafe/extension/scripts/g4-record.cjs notice --tsa-url <URL>
 *     Timestamps the revocation registry committed at HEAD (version 2 or later)
 *     and writes tools/g4/revocation-notices/v<N>.tsr.
 *
 *   node FailSafe/extension/scripts/g4-record.cjs transition --kind rotation|recovery
 *     --from <old fingerprint> --to <new fingerprint> --after g4-NNNNNN
 *     --cert <signing key's committed .cer> --key-name <TPM key name> --tsa-url <URL>
 *     [--repository MythologIQ-Labs-LLC/FailSafe]
 *     Writes tools/g4/transitions/<old fingerprint>.{json,sig,tsr}. A rotation is
 *     signed by the OLD key; a recovery, where the old key is lost, by the NEW key.
 *     A recovery is accepted by the verifier only after the old key is revoked and
 *     only with --accept-recovery <after>:<sha256 of the .json>, which the owner
 *     records offline; continuity across it is reported as NOT verified.
 *
 * Every operation that uses a TPM key, a revocation or a transition needs the
 * owner's explicit authorization of that operation; this tool does not grant it.
 */
"use strict";

const path = require("node:path");
const { stampRegistry, writeTransition } = require("./lib/g4/records.cjs");
const { createTpmSigner } = require("./lib/g4/signer.cjs");
const { postQuery } = require("./lib/g4/timestamp.cjs");
const { G4Refusal } = require("./lib/g4/bytes.cjs");

const FLAGS = { "--tsa-url": "tsaUrl", "--kind": "kind", "--from": "from", "--to": "to", "--after": "after", "--cert": "cert", "--key-name": "keyName", "--repository": "repository", "--repo-root": "repoRoot" };

function parseArgs(argv) {
  const o = { command: argv[0], repoRoot: path.resolve(__dirname, "..", "..", ".."), repository: "MythologIQ-Labs-LLC/FailSafe" };
  for (let i = 1; i < argv.length; i += 1) {
    if (FLAGS[argv[i]] && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) o[FLAGS[argv[i]]] = argv[++i];
    else throw new Error(`unknown or incomplete argument: ${argv[i]}`);
  }
  if (!o.tsaUrl) throw new Error("--tsa-url is required");
  if (o.command === "transition" && !["rotation", "recovery"].includes(o.kind)) throw new Error("--kind must be rotation or recovery");
  if (o.command === "transition" && !(o.from && o.to && o.after && o.cert && o.keyName)) throw new Error("transition needs --from, --to, --after, --cert and --key-name");
  if (!["notice", "transition"].includes(o.command)) throw new Error("the first argument must be notice or transition");
  return o;
}

function httpTsa(url) {
  return {
    async request(tsq) {
      let res;
      try {
        res = await postQuery(url, tsq);
      } catch (err) {
        throw new G4Refusal("BLOCKED", "TSA_OFFLINE", `${url}: ${err.message}`);
      }
      if (res.status !== 200) throw new G4Refusal("BLOCKED", "TSA_OFFLINE", `${url} answered HTTP ${res.status}`);
      return res.body;
    },
  };
}

async function main(argv) {
  const o = parseArgs(argv);
  const tsa = httpTsa(o.tsaUrl);
  if (o.command === "notice") return stampRegistry({ repoRoot: o.repoRoot, tsa });
  const signer = createTpmSigner({ keyName: o.keyName, certificatePath: path.resolve(o.repoRoot, o.cert), scriptPath: path.join(o.repoRoot, "tools", "g4", "sign-checkpoint.ps1") });
  return writeTransition({ repoRoot: o.repoRoot, kind: o.kind, fromFingerprint: o.from, toFingerprint: o.to, afterCheckpoint: o.after, repository: o.repository, signer, tsa });
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (files) => { process.stdout.write(`[g4-record] wrote ${files.join(", ")} (not committed)\n`); },
    (err) => {
      process.stderr.write(`[g4-record] ${err.message}\n`);
      process.exitCode = err instanceof G4Refusal && err.verdict === "REFUSED" ? 1 : 2;
    },
  );
}

module.exports = { parseArgs };
