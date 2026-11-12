# G4 ledger witness: operations (v6.0.13, #638)

**Status:** the tooling is implemented and tested against a throwaway local test TSA and ephemeral software test keys. **No owner key exists and no checkpoint exists.** The owner selected the FreeTSA public service on 2026-11-12 (`docs/releases/V6_0_13_G4_TSA_OWNER_SELECTION_2026-11-12.md`). On this repository the verifier returns `BLOCKED TSA_POLICY_UNSELECTED` until the separately audited single-root policy is merged, and `BLOCKED NO_CHECKPOINTS` after that until a genesis checkpoint exists. See `docs/releases/V6_0_13_G4_OWNER_DECISIONS.md` for the remaining owner actions.

Design authority: the "G4: complete-ledger-byte witness" section and the Iteration 3 refinements of `.failsafe/governance/plans/plan-v6012-release-governance.md` (audits #917 to #919), and the owner decision `docs/releases/V6_0_12_G4_DISPOSITION.md`.

## Components

| Path | Role |
|---|---|
| `FailSafe/extension/scripts/lib/g4/manifest.cjs` | Builds the manifest bytes (the only serializer) and reads them strictly |
| `FailSafe/extension/scripts/lib/g4/signer.cjs` | Signer interface: `createTpmSigner` (production) and `createSoftwareTestSigner` (tests only); signature verification |
| `FailSafe/extension/scripts/lib/g4/timestamp.cjs` | RFC 3161 query, token inspection and verification through the OpenSSL CLI |
| `FailSafe/extension/scripts/lib/g4/checkpoint.cjs` | Creates one checkpoint directory (staged, then renamed into place) |
| `FailSafe/extension/scripts/lib/g4/verify*.cjs`, `registry.cjs` | The verifier |
| `FailSafe/extension/scripts/g4-create-checkpoint.cjs` | CLI: create the next checkpoint (TPM signer only) |
| `FailSafe/extension/scripts/g4-verify-checkpoint.cjs` | CLI: verify the whole chain |
| `FailSafe/extension/scripts/g4-tsa-probe.cjs` | Manual live-TSA interoperability probe (random digests only) |
| `tools/g4/sign-checkpoint.ps1` | Signs SHA-256(manifest) with the named TPM key (`CngKey.Open` + `ECDsaCng.SignHash`) |
| `tools/g4/enroll-tpm-key.ps1` | Creates the TPM key and exports the public certificate. **Owner only; never run by automation** |
| `tools/g4/revocations.json` | Append-only revocation registry (version 1, empty) |
| `tools/g4/tsa-policy.json` | Trusted TSA roots (`pending-owner-decision`, none) |
| `tools/g4/HISTORICAL_GAPS.md` | Historical-gap statement, bound into every manifest by SHA-256 |
| `tools/g4/keys/<sha256>.cer` | Committed public certificates (none yet) |
| `tools/g4/checkpoints/g4-NNNNNN/` | `manifest.json`, `manifest.sig`, `timestamp.tsq`, `timestamp.tsr`, `tsa-chain.pem` |

`.gitattributes` marks these files `binary` or `-text`, so line-ending conversion never changes a digest. The verifier reads the ledger, registry, gap statement and TSA policy from Git objects (`git show <commit>:<path>`), never from the checked-out working tree.

## Formats

**Manifest** (`manifest.json`): UTF-8 JSON, no BOM, written once as `JSON.stringify(m, null, 2) + "\n"`. The verifier hashes, verifies and timestamps the persisted bytes and never reserializes them. Fields, in order: `schema`, `checkpointId` (`g4-NNNNNN`), `sequence`, `repository`, `commit` (40-hex), `ledger` {`path`, `sha256`, `byteLength`, `entryCount`, `lastEntryNumber`} over the complete committed blob, `previousCheckpoint` (`{"genesis": "after clean epoch #914"}`, or {`checkpointId`, `manifestSha256`, `witnessImprint`}), `previousLedger` (`null` at genesis; otherwise {`commit`, `byteLength`, `sha256`, `prefixOfNew` {`byteLength`, `sha256`}}), `revocationRegistry` {`path`, `sha256`, `version`}, `historicalGapStatement` {`path`, `sha256`}, `key` {`fingerprintSha256`, `algorithm`, `signatureEncoding`}, `createdUtc`.

`entryCount` counts `### Entry #N` headings; `lastEntryNumber` is the number in the last such heading. The ledger has duplicate and missing numbers in its history, so the count and the last number differ. That is expected.

**Signature** (`manifest.sig`): ECDSA P-256 over SHA-256(manifest bytes), IEEE P1363 `r||s`, 64 bytes. That is what `ECDsaCng.SignHash` returns.

**Key fingerprint**: SHA-256 of the DER certificate.

**Timestamp imprint**: SHA-256(`"FailSafe-G4-v1\0"` ‖ u64be(len manifest) ‖ manifest ‖ u64be(len sig) ‖ sig). It is requested with `openssl ts -query -digest <imprint> -sha256 -cert`.

**Revocation registry**: `{"schema": "failsafe-g4-revocations/v1", "version": N, "revocations": [{"fingerprintSha256", "effectiveUtc", "reason", ...}]}`. Each change bumps `version` and keeps every earlier notice unchanged.

**TSA policy**: `{"schema": "failsafe-g4-tsa-policy/v1", "status": "selected", "trustedRoots": [{"name", "certificatePath", "sha256"}]}`. `sha256` is the DER fingerprint of the committed root PEM.

## Enrollment (owner only, after approval)

Prerequisites: the owner's workstation, Windows PowerShell 5.1 (.NET Framework 4.8), and a TPM 2.0 that is present, ready, and exposes the **Microsoft Platform Crypto Provider**. Check it read-only:

```powershell
tpmtool getdeviceinformation
certutil -csplist | Select-String "Platform Crypto"
Get-Tpm            # elevated prompt only
```

Enrollment is one command, run by the owner in the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\g4\enroll-tpm-key.ps1 `
  -OwnerApprovalRef "<ledger entry or decision file that approves enrollment>" `
  -ConfirmPersistentTpmKey -ValidDays 730
```

The script runs these calls. Nothing else creates the key:

```powershell
Add-Type -AssemblyName System.Core
$prov = New-Object System.Security.Cryptography.CngProvider('Microsoft Platform Crypto Provider')
$p = New-Object System.Security.Cryptography.CngKeyCreationParameters
$p.Provider = $prov
$p.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::None      # non-exportable
$p.KeyUsage = [System.Security.Cryptography.CngKeyUsages]::Signing
$p.KeyCreationOptions = [System.Security.Cryptography.CngKeyCreationOptions]::None   # current user
$key = [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::ECDsaP256, 'FailSafe-G4-Ledger-Witness', $p)
$req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest('CN=FailSafe G4 Ledger Witness, O=MythologIQ Labs LLC', (New-Object System.Security.Cryptography.ECDsaCng($key)), [System.Security.Cryptography.HashAlgorithmName]::SHA256)
# + KeyUsage DigitalSignature (critical), BasicConstraints CA:false (critical)
$cert = $req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddDays(730))
[IO.File]::WriteAllBytes("tools\g4\keys\<sha256>.cer", $cert.Export('Cert'))       # public certificate only
```

Windows PowerShell's .NET Framework has no `CngProvider.MicrosoftPlatformCryptoProvider` property, so the scripts construct the provider from its name. The value is the same.

After enrollment:
1. Commit `tools/g4/keys/<fingerprint>.cer`. The private key never leaves the TPM. Nothing in CI or the repository can sign.
2. Record the fingerprint outside the repository, where a verifier can pin it with `--trust-fingerprint`.
3. Commit the selected TSA root under `tools/g4/tsa-roots/`, and set `tsa-policy.json` to `"status": "selected"` with its DER SHA-256.

## Checkpoint cadence

One checkpoint at every `/qor-substantiate` release seal and at every release-candidate promotion. Steps, on the owner's workstation:

```bash
# 1. The seal entry is committed (ledger at <seal commit>).
node FailSafe/extension/scripts/g4-create-checkpoint.cjs \
  --cert tools/g4/keys/<fingerprint>.cer --tsa-url <selected TSA URL> --commit <seal commit>
# 2. Verify before committing.
node FailSafe/extension/scripts/g4-verify-checkpoint.cjs --trust-fingerprint <fingerprint>
# 3. Commit tools/g4/checkpoints/g4-NNNNNN/ in a follow-up commit.
# 4. Retain "<g4-NNNNNN>:<sha256 of manifest.json>" outside the repository (the trusted head).
```

The first checkpoint is the genesis. Its ledger must contain `### Entry #914: EPOCH`, and it carries the marker `after clean epoch #914`. A checkpoint cannot be in the commit it attests, because the manifest names that commit. It is always committed afterwards.

A TSA that is offline, refuses or returns nothing gives `BLOCKED TSA_OFFLINE` or `TSA_REJECTED`, and no checkpoint directory is written. A missing, offline or expired witness is BLOCKED, never a neutral PASS.

## Verification

```bash
node FailSafe/extension/scripts/g4-verify-checkpoint.cjs \
  --trust-fingerprint <owner fingerprint, obtained out of band> \
  --trusted-head <g4-NNNNNN>:<manifest sha256, obtained out of band> [--json]
```

Exit 0 is `PASS`, 1 is `REFUSED`, 2 is `BLOCKED`. Without `--trusted-head`, a PASS carries the limitation "checkpoint head is not externally anchored". Without `--trust-fingerprint`, any key whose certificate is committed under `tools/g4/keys/` can start a chain (see the limitations).

A **release verification** is the only mode that counts as release evidence. It adds `--release`, and the verifier itself enforces the conditions below. Any unmet condition is `BLOCKED` or `REFUSED`, never a limitation on a PASS.

```bash
node FailSafe/extension/scripts/g4-verify-checkpoint.cjs --release \
  --repository MythologIQ-Labs-LLC/FailSafe \
  --commit <the exact qualified release commit, 40 hex> \
  --trust-fingerprint <owner fingerprint, obtained out of band> \
  --trusted-head <g4-NNNNNN>:<manifest sha256, obtained out of band>
```

| Condition | Result when unmet |
|---|---|
| `--trust-fingerprint`, `--trusted-head`, `--repository` and `--commit` are all given | `BLOCKED RELEASE_INPUT_MISSING` (names the missing inputs) |
| each of those is well formed | `BLOCKED RELEASE_INPUT_MALFORMED` |
| `HEAD` is exactly `--commit` | `REFUSED RELEASE_COMMIT_MISMATCH` |
| the checkout is clean: no modified or untracked file anywhere, and no git-ignored file under `tools/g4/` | `BLOCKED RELEASE_TREE_DIRTY` |
| no `--tsa-ca` override | `BLOCKED TSA_OVERRIDE_NOT_RELEASE` |
| no `--checkpoints` override | `BLOCKED RELEASE_OVERRIDE_REFUSED` |
| the tree committed at HEAD under `tools/g4/checkpoints/` is exactly five regular files (`100644`) per `g4-NNNNNN` directory: no extra, nested, stray or empty path, no symbolic link, submodule or executable entry, no missing file | `REFUSED RELEASE_EVIDENCE_LAYOUT` |
| no path committed at HEAD differs from `tools/g4/checkpoints`, `tools/g4/keys` only by letter case or Unicode form, at any level of the path (such a path would check out into the evidence directories on Windows or macOS) | `REFUSED RELEASE_EVIDENCE_LAYOUT` |
| every file under `tools/g4/checkpoints/` and `tools/g4/keys/` equals its blob committed at HEAD | `REFUSED RELEASE_TREE_MISMATCH` |
| the pinned fingerprint, external head and repository match the chain | `REFUSED KEY_UNTRUSTED`, `HEAD_MISMATCH` or `REPOSITORY_MISMATCH` |

The output states the mode: `[g4-verify] mode: release`, or `mode: diagnostic (NOT release evidence)`. A flag is never accepted as another flag's value, so `--commit --release` is an argument error (exit 2), not a diagnostic run.

Run it from a fresh `git clone` or `git worktree add` of the release commit. Because the checkout must be clean and at `--commit`, the checkpoint and certificate files read from the working tree are exactly the ones committed at that commit.

Other options:
- `--repository <owner/name>`: every checkpoint must name this repository. Without it, every checkpoint must name the genesis checkpoint's repository (`REPOSITORY_MISMATCH`).
- `--tsa-ca <PEM>`: a **test and diagnostic override only**. It replaces the committed TSA root pin in `tools/g4/tsa-policy.json` with any CA file. A PASS under it carries the limitation "--tsa-ca override in use: ... NOT a release verification". With `--release` it is `BLOCKED TSA_OVERRIDE_NOT_RELEASE`.

An unexpected error (not a G4 refusal) is `BLOCKED INTERNAL_ERROR` with a one-line reason, and exits 2.

For each checkpoint, in order, the verifier checks:
1. contiguous sequence;
2. manifest bytes: UTF-8 and schema;
3. a committed certificate for the fingerprint, matching the pin and the previous checkpoint's key;
4. the signature;
5. `openssl ts -verify -digest <imprint> -in timestamp.tsr -CAfile <policy roots> -untrusted tsa-chain.pem`;
6. a SHA-256 token, with its time inside the certificate's validity, just after `createdUtc`, and not before the previous token;
7. the key not revoked at token time;
8. the commit present and an ancestor of HEAD, after the previous checkpoint's commit;
9. the ledger blob's SHA-256, length, entry count and last entry number;
10. genesis rules, or the links to the previous checkpoint;
11. the previous ledger read from Git at its own commit, and a byte-for-byte prefix of the new ledger;
12. the registry and gap statement at the commit against their bound digests, and the registry monotonic against the previous checkpoint's.

Then, at HEAD:
- the HEAD ledger still begins with the head checkpoint's ledger bytes;
- the HEAD registry is monotonic over the head checkpoint's;
- every committed version of the registry in `git log` is monotonic;
- the trusted head, if given, matches.

Each check fails closed at the first problem, with a code such as `PREFIX_BROKEN`, `SIGNATURE_INVALID`, `TOKEN_IMPRINT_MISMATCH`, `KEY_RESET`, `KEY_REVOKED`, `KEY_WINDOW`, `REGISTRY_ROLLBACK`, `HEAD_MISMATCH` or `TOKEN_MISSING`.

Checking one token by hand:

```bash
node -e 'const b=require("./FailSafe/extension/scripts/lib/g4/bytes.cjs"),f=require("fs"),d=process.argv[1];console.log(b.witnessImprint(f.readFileSync(d+"/manifest.json"),f.readFileSync(d+"/manifest.sig")))' tools/g4/checkpoints/g4-000001
openssl ts -verify -digest <imprint> -in tools/g4/checkpoints/g4-000001/timestamp.tsr \
  -CAfile tools/g4/tsa-roots/<root>.pem -untrusted tools/g4/checkpoints/g4-000001/tsa-chain.pem
```

Regression suite: `npm run test:node` in `FailSafe/extension`. It runs `g4Witness`, `g4FalsifyLedger`, `g4FalsifyKeys` and `g4FalsifyTokens`. They run offline against a throwaway local OpenSSL TSA, and if no `openssl` binary is found they are skipped with an explicit reason (set `G4_OPENSSL`).

## Revocation and rotation

**Revocation.** The owner appends a notice to `tools/g4/revocations.json` (`fingerprintSha256`, `effectiveUtc`, `reason`, `authorizedBy`), bumps `version`, and commits. The procedure also calls for timestamping the new registry bytes with the selected TSA:

```bash
openssl ts -query -digest <sha256 of revocations.json> -sha256 -cert -out v<N>.tsq
```

The `.tsr` is stored as `tools/g4/revocation-notices/v<N>.tsr`. The v6.0.13 verifier enforces:
- the effective time: checkpoints whose token time is at or after it are refused, and earlier ones stay valid and are marked as predating the revocation;
- the registry digest and version bound in each checkpoint;
- append-only history, both across checkpoints and in the registry's own Git history.

It does **not** verify the notice timestamps (see limitations).

**Rotation (planned, old key still available).** Not supported by the v6.0.13 verifier: any key change between consecutive checkpoints is `REFUSED KEY_RESET`. The design requires all of these before a new key is trusted:
- a key-transition record, timestamped and bound to the old fingerprint;
- an owner identity attestation;
- an independent technical PASS.

That record format and its verifier support need owner approval of the procedure, and are listed as an owner decision.

## Recovery from TPM loss or reset

A TPM clear, motherboard replacement or Windows reinstall destroys the key, unrecoverably by design. There is no backup, no fallback key and no copy in CI.
1. Revoke the lost fingerprint (notice with `effectiveUtc` = time of loss), and commit it.
2. Do not delete or rewrite `tools/g4/checkpoints/`. Move the old chain intact to `tools/g4/archive/<old fingerprint>/checkpoints/`. It stays verifiable with `--checkpoints <that dir>`.
3. Enroll a new key (approval required), then produce the transition record, the owner identity attestation and an independent technical PASS before any new checkpoint is trusted.
4. The new chain starts with a new genesis. Until cross-chain continuity is implemented, prove by hand that the new genesis ledger begins with the archived head's ledger bytes. On a POSIX shell:

   ```bash
   cmp -n <old head byteLength> <(git show <old head commit>:docs/META_LEDGER.md) <(git show <new genesis commit>:docs/META_LEDGER.md)
   ```

   Record the result in the transition record.

## Operating limitations (disclosed)

- **Owner-held key.** It gives tamper evidence and time ordering, **not non-forgeability against the owner**. The key holder can re-sign any history.
- **Truncation of the newest tail.** Without an independently retained trusted head, the verifier cannot detect coordinated deletion of the newest checkpoints together with the newest ledger tail. The suite records this: deleting the head checkpoint, with or without the ledger tail, verifies PASS without `--trusted-head`, and is `HEAD_MISMATCH` with it.
- **Re-genesis.** Without `--trust-fingerprint` or `--trusted-head`, replacing the whole checkpoint directory with a fresh chain signed by any key whose certificate is committed verifies PASS. The suite records this case, and shows it is refused with either anchor.
- **TSA trust and availability.** The design trusts the selected TSA. RFC 3161 proves existence at a time, not inclusion in a public append-only log.
- **Windows-only signing.** Verification needs only Node, Git and OpenSSL, on any OS.
- **Not implemented in v6.0.13:**
  - revocation-notice timestamps are not verified;
  - the key-transition record and cross-chain continuity are not implemented (key changes fail closed);
  - the trusted head is not published anywhere automatically.
- **Time checks.** The verifier refuses `createdUtc` more than 5 minutes after the token time, or more than 24 hours before it.
- **TSA certificate expiry (owner decision).** `openssl ts -verify` validates the TSA chain at the current time, not at the token time. When the TSA signer certificate expires, verification of old checkpoints will REFUSE. This fails closed, but it makes old checkpoints unverifiable. The alternative is `-attime <genTime>`, which validates at the token time. It is a long-term-validation policy, and it needs the owner's decision (and, ideally, archived revocation status for the TSA chain). It is not implemented.
- **Registry Git history.** The Git-history layer uses `git log -- tools/g4/revocations.json`, which follows Git's default history simplification. A merge whose registry equals an older side hides the newer version from that layer. The checkpoint anchors still catch such a rollback: the bound version is compared checkpoint to checkpoint and checkpoint to HEAD (`REGISTRY_ROLLBACK`, tested). A rollback that happens before any checkpoint binds the newer version is not detectable.
- **Working tree.** Certificates and checkpoint files are read from the checked-out tree. Ledger, registry, gap statement and TSA policy are read from Git objects (with replace refs disabled). In a diagnostic run, a PASS on a dirty tree can reflect uncommitted checkpoint or certificate files. In `--release` mode the verifier enforces this itself: the checkout must be clean and at `--commit`, and every file under `tools/g4/checkpoints/` and `tools/g4/keys/` is compared byte for byte with its blob committed at HEAD, so `git update-index --skip-worktree`, `--assume-unchanged` or a same-size swap cannot substitute evidence. Only a `mode: release` PASS is release evidence.
- **Token status.** A non-granted token is refused (`TOKEN_INVALID`). In practice `openssl ts -verify` already rejects a response that carries no token, so this check is defence in depth.
- **History.** G4 does not re-verify history at or below #914, does not repair the pre-anchor break at #382, and does not resolve the October VETOs #610 to #612 or event `7126134e`, which remain UNKNOWN/UNRESOLVED.
