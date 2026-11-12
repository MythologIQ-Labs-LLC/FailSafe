#!/usr/bin/env node
/**
 * G4 ledger witness: create the next checkpoint (#638). OWNER WORKSTATION ONLY.
 *
 *   node FailSafe/extension/scripts/g4-create-checkpoint.cjs
 *     --cert tools/g4/keys/<fingerprint>.cer --tsa-url <owner-selected TSA URL>
 *     [--key-name FailSafe-G4-Ledger-Witness] [--commit HEAD]
 *     [--repository MythologIQ-Labs-LLC/FailSafe] [--repo-root <dir>]
 *
 * Builds the manifest over the committed ledger blob at --commit, signs it with
 * the TPM key through tools/g4/sign-checkpoint.ps1, requests an RFC 3161 token
 * for the framed imprint, and writes tools/g4/checkpoints/g4-NNNNNN/. It does
 * not commit. Run g4-verify-checkpoint.cjs afterwards, then commit the new
 * directory. The only signer this CLI offers is the TPM signer; the software
 * signer exists for tests only.
 */
"use strict";

const path = require("node:path");
const { createCheckpoint } = require("./lib/g4/checkpoint.cjs");
const { createTpmSigner } = require("./lib/g4/signer.cjs");
const { postQuery } = require("./lib/g4/timestamp.cjs");
const { G4Refusal } = require("./lib/g4/bytes.cjs");

const FLAGS = { "--cert": "cert", "--tsa-url": "tsaUrl", "--key-name": "keyName", "--commit": "commit", "--repository": "repository", "--repo-root": "repoRoot" };

function parseArgs(argv) {
  const o = {
    repoRoot: path.resolve(__dirname, "..", "..", ".."),
    keyName: "FailSafe-G4-Ledger-Witness",
    commit: "HEAD",
    repository: "MythologIQ-Labs-LLC/FailSafe",
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (FLAGS[argv[i]] && argv[i + 1] !== undefined) o[FLAGS[argv[i]]] = argv[++i];
    else throw new Error(`unknown or incomplete argument: ${argv[i]}`);
  }
  if (!o.cert || !o.tsaUrl) throw new Error("--cert and --tsa-url are required");
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
  const signer = createTpmSigner({
    keyName: o.keyName,
    certificatePath: path.resolve(o.repoRoot, o.cert),
    scriptPath: path.join(o.repoRoot, "tools", "g4", "sign-checkpoint.ps1"),
  });
  const r = await createCheckpoint({ repoRoot: o.repoRoot, commit: o.commit, repository: o.repository, signer, tsa: httpTsa(o.tsaUrl) });
  process.stdout.write(`[g4-create] wrote ${path.relative(o.repoRoot, r.dir)} imprint ${r.imprint}\n`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => {
      process.stderr.write(`[g4-create] ${err.message}\n`);
      process.exitCode = err instanceof G4Refusal && err.verdict === "REFUSED" ? 1 : 2;
    },
  );
}

module.exports = { parseArgs };
