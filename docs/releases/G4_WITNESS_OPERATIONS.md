# G4 ledger witness: operations (v6.0.13, #638)

**Status (2026-11-13, published release):** FailSafe v6.0.13 is the first G4-witnessed release. Owner key `FailSafe-G4-Ledger-Witness` was enrolled on 2026-11-12; its public certificate is `tools/g4/keys/a50c00715e7275a86fad338c80ceacd161da02bdf2b75c60b1082eb518265d8b.cer`. The five-file genesis checkpoint `tools/g4/checkpoints/g4-000001/` witnesses release seal-record commit `9defb9510ffd91e405ffb108d34f33594fc36e8c`, with an independent FreeTSA RFC 3161 timestamp and pinned FreeTSA root. The [v6.0.13 post-publication record](../../.failsafe/governance/evidence/v6013-release/published/POST_PUBLICATION_RECORD.md) documents `g4-verify-checkpoint.cjs --release` PASS on fresh H/M clones and owner-retained, out-of-repository certificate fingerprint and trusted head. These are recorded owner-host results; repository content alone cannot establish the independent offline pin. The original owner decisions in `docs/releases/V6_0_13_G4_OWNER_DECISIONS.md` are historical pre-genesis instructions, **not outstanding operations**. Rotation/recovery record writes still lack failure-atomicity (#660); future releases require their own witnessed checkpoints. The toolkit's historical-gap disclosures remain binding.

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
| `tools/g4/enroll-tpm-key.ps1` | Creates the TPM key and exports the public certificate. **Owner only.** Automation never passes `-ConfirmPersistentTpmKey`; the test suite runs the script only without it, to check that it refuses before any key-provider call (#665) |
| `tools/g4/revocations.json` | Append-only revocation registry (version 1, empty) |
| `tools/g4/revocation-notices/v<N>.tsr` | RFC 3161 token for registry version N (N >= 2) |
| `tools/g4/tsa-crls/*.crl` | Archived CRLs of the pinned TSA root (revocation evidence at token time) |
| `tools/g4/transitions/<fp>.{json,sig,tsr}` | Key rotation or recovery record for the key `<fp>` |
| `FailSafe/extension/scripts/g4-record.cjs` | CLI: stamp a registry version, or write a transition record (owner only) |
| `tools/g4/tsa-policy.json` | Trusted TSA roots (`selected`: one root, FreeTSA Root CA, DER SHA-256 `a6379e7c...18aabc`) |
| `tools/g4/tsa-roots/freetsa-root-ca.pem` | The FreeTSA Root CA, byte-identical to `https://freetsa.org/files/cacert.pem` (qualification evidence: `.failsafe/governance/evidence/g4-freetsa/`) |
| `tools/g4/HISTORICAL_GAPS.md` | Historical-gap statement, bound into every manifest by SHA-256 |
| `tools/g4/keys/<sha256>.cer` | Committed public certificates (the owner key, `a50c0071...265d8b.cer`, enrolled 2026-11-12) |
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
3. The TSA root is already committed (FreeTSA, 2026-11-12). Changing it, or adding a second root, is a new owner decision with its own independent audit.

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

## TSA tokens at token time (owner item 9)

Every RFC 3161 token is validated at its own `genTime`: checkpoint tokens, revocation-notice tokens and transition-record tokens alike. The command is `openssl ts -verify ... -attime <genTime> -crl_check`. The trust file holds:
- the pinned roots named in `tools/g4/tsa-policy.json`, where each root file must hold exactly one certificate (`TSA_ROOT_MALFORMED` otherwise);
- OpenSSL's canonical re-encoding of every CRL committed under `tools/g4/tsa-crls/`. Each CRL is read from Git at HEAD, and each `.crl` file must hold exactly one PEM CRL and nothing else (`TSA_CRL_MALFORMED`). The CRL must verify against one pinned root on its own (`TSA_CRL_UNTRUSTED`). A CRL file therefore cannot add a trust anchor.

Archived CRLs are **append-only** (`REFUSED TSA_CRL_HISTORY`):
- no commit reachable from HEAD may delete, change or retype a committed CRL file, with every merge diffed against every parent;
- every CRL blob ever added in that history must still be present at HEAD, at the same path, with the same bytes. This catches a CRL dropped by a merge resolution or by an `-s ours` merge.

**What the verifier enforces about the repository it reads**, before any history check:
- **Complete history.** A shallow clone, or a repository with `.git/shallow` or `.git/info/grafts`, is `BLOCKED REPO_INCOMPLETE_HISTORY`.
- **Genuine objects.** `git fsck --full --no-dangling` must pass, so every object re-hashes to its id and history is connected. Otherwise the verifier returns `BLOCKED REPO_INTEGRITY`.
- **No unauthenticated shortcuts.** Git runs with `--no-replace-objects` and `-c core.commitGraph=false`, and the `GIT_DIR`-style environment redirects are removed. The CRL history is read with explicit `--diff-merges=separate --root`, so local `log.*` settings cannot narrow it.

**What it still trusts:** the Git and OpenSSL binaries on the verifying machine, and SHA-1 object ids (Git's own collision detection applies). Release verification should therefore run on a full clone fetched from the canonical remote (`git clone https://github.com/MythologIQ-Labs-LLC/FailSafe`, never `--depth`), on a machine the verifier controls. A local copy of someone else's `.git` is no substitute.

**Limit:** checkpoints do not bind the set of CRLs. A history rewrite (force-push) that removes a CRL is not detectable from the repository alone; branch protection forbids such rewrites on `main`.

Revocation of the TSA signer is checked twice:
- OpenSSL requires a CRL current at the token's time (`-crl_check`).
- The verifier then consults **every** archived CRL from the signer's issuing root, including CRLs issued after the token. Following RFC 3161 section 4, tokens made before a revocation stay valid only when its reasonCode is unspecified, affiliationChanged, superseded or cessationOfOperation, and then only if they precede the revocation date. With any other reason, or with no reasonCode at all, every token of that signer is refused, earlier ones included. That covers keyCompromise, cACompromise and certificateHold.

| Situation | Result |
|---|---|
| No CRL current at the token's time | `BLOCKED TSA_REVOCATION_EVIDENCE_MISSING` |
| Signer revoked at or before the token's time, or with a reason (or none) that invalidates every token, in any archived CRL | `REFUSED TSA_SIGNER_REVOKED` |
| A CRL file not signed by a pinned root | `REFUSED TSA_CRL_UNTRUSTED` |
| An archived CRL removed or changed anywhere in the history reachable from HEAD, merges included | `REFUSED TSA_CRL_HISTORY` |

A checkpoint therefore stays verifiable after its TSA signer certificate expires. A token made after its signer was revoked is refused once any archived CRL records that revocation.

**Archived evidence is a pre-seal input.** Before a seal, a CRL that covers the planned token time must be committed: its `lastUpdate` is at or before that time and its `nextUpdate` after it. FreeTSA publishes its root CRL yearly (`http://www.freetsa.org/crl/root_ca.crl`). The committed `freetsa-root-ca-2026-09-18.crl` covers 2026-09-18 to 2027-09-18. After that date a newer CRL must be fetched, checked against the pinned root (`openssl crl -in <file> -CAfile tools/g4/tsa-roots/freetsa-root-ca.pem -noout`) and committed before the next checkpoint. Older CRLs are never removed.

**Limit.** Token-time validation trusts the TSA's own `genTime`. If a TSA key were compromised and the compromise never published, its holder could backdate tokens. The externally retained trusted head is what detects a replaced chain.

## Revocation (owner item 7)

The owner appends a notice to `tools/g4/revocations.json` (`fingerprintSha256`, `effectiveUtc`, `reason`, `authorizedBy`), bumps `version` and commits it. Then the owner timestamps that committed version and commits the token:

```bash
node FailSafe/extension/scripts/g4-record.cjs notice --tsa-url https://freetsa.org/tsr
# writes tools/g4/revocation-notices/v<N>.tsr; commit it
```

The token's imprint is `SHA-256("FailSafe-G4-revocations-v1\0" || u64be(len) || registry bytes)`. The verifier enforces:
- every committed registry version from 2 onward has its token, valid at token time (`REVOCATION_UNSTAMPED` otherwise);
- version 1 holds no notice;
- version tokens are in time order (`REVOCATION_TIME_ORDER`);
- a notice is effective no later than 5 minutes after its own version's token time (`REVOCATION_POSTDATED`), so a revocation can never be dated after the moment it was independently witnessed;
- checkpoints whose token time is at or after the effective time are refused (`KEY_REVOKED`); earlier ones stay valid and are marked as predating the revocation;
- the registry digest and version bound in each checkpoint, and append-only history.

## Key rotation and emergency recovery (owner item 6)

`--trust-fingerprint` pins the **genesis** key. A later checkpoint may be signed by another key only through a committed transition record for the previous key, `tools/g4/transitions/<old fingerprint>.{json,sig,tsr}`. Without one, the change is `REFUSED KEY_RESET`.

**Planned rotation, old key still available:**
1. Enroll the new key (separate owner authorization) and commit its `.cer`.
2. Write the record, signed by the **old** key, after the last checkpoint `g4-NNNNNN`:

   ```bash
   node FailSafe/extension/scripts/g4-record.cjs transition --kind rotation --from <old fp> --to <new fp> --after g4-NNNNNN --cert tools/g4/keys/<old fp>.cer --key-name <old TPM key name> --tsa-url https://freetsa.org/tsr
   ```

   Commit the three files before the seal; they are pre-seal inputs.
3. The next checkpoint is signed by the new key.
4. Optionally revoke the old key afterwards (see Revocation).

The verifier accepts the change only if all of these hold:
- the record names this repository, the old and new fingerprints, the previous checkpoint and that checkpoint's manifest SHA-256;
- its token time is inside the signing key's certificate window;
- it is signed by the old key and timestamped between the two checkpoints;
- the old key was not revoked at the record's time.

Otherwise the change is `KEY_TRANSITION_INVALID`. Continuity is verified, and the release PASS carries no limitation.

**Emergency recovery, old key lost** (TPM clear, motherboard replacement, Windows reinstall). There is no backup by design.
1. Revoke the lost fingerprint, with `effectiveUtc` at or before the time of loss, and stamp that registry version.
2. Enroll a new key (separate authorization) and commit its `.cer`.
3. Write the record with `--kind recovery`, signed by the **new** key, and commit it.
4. **The owner records `g4-NNNNNN:<sha256 of the .json>` offline**, as with a trusted head.
5. The next checkpoint is signed by the new key.

The verifier refuses the recovery:
- with `KEY_RECOVERY_UNREVOKED` unless the old key's notice is effective by the record's token time **and** that notice's own registry token is no later than the record's token (a revocation timestamped after the recovery, even if backdated, does not count);
- with `KEY_RECOVERY_UNACKNOWLEDGED` unless `--accept-recovery g4-NNNNNN:<digest>` is passed with the offline value.

When it is accepted, every PASS (release mode included) carries the limitation `emergency key recovery after g4-NNNNNN ... chain continuity across it is NOT verified`. Checkpoint links and the ledger byte-prefix continue to be checked across a recovery. What is not verified is that the holder of the old key agreed to the change. A recovery therefore never claims uninterrupted continuity, and a release across one needs its own recorded owner decision.

## Operating limitations (disclosed)

- **Owner-held key.** It gives tamper evidence and time ordering, **not non-forgeability against the owner**. The key holder can re-sign any history.
- **Truncation of the newest tail.** Without an independently retained trusted head, the verifier cannot detect coordinated deletion of the newest checkpoints together with the newest ledger tail. The suite records this: deleting the head checkpoint, with or without the ledger tail, verifies PASS without `--trusted-head`, and is `HEAD_MISMATCH` with it.
- **Re-genesis.** Without `--trust-fingerprint` or `--trusted-head`, replacing the whole checkpoint directory with a fresh chain signed by any key whose certificate is committed verifies PASS. The suite records this case, and shows it is refused with either anchor.
- **TSA trust and availability.** The design trusts the selected TSA. RFC 3161 proves existence at a time, not inclusion in a public append-only log.
- **Windows-only signing.** Verification needs only Node, Git and OpenSSL, on any OS.
- **Not implemented:** the trusted head is not published anywhere automatically.
- **Time checks.** The verifier refuses `createdUtc` more than 5 minutes after the token time, or more than 24 hours before it.
- **TSA certificate expiry.** Tokens are validated at their own time against archived CRLs (see "TSA tokens at token time"). An expired TSA signer certificate does not invalidate earlier tokens; a missing or stale CRL blocks.
- **Registry Git history.** The Git-history layer uses `git log -- tools/g4/revocations.json`, which follows Git's default history simplification. A merge whose registry equals an older side hides the newer version from that layer. The checkpoint anchors still catch such a rollback: the bound version is compared checkpoint to checkpoint and checkpoint to HEAD (`REGISTRY_ROLLBACK`, tested). A rollback that happens before any checkpoint binds the newer version is not detectable.
- **Working tree.** Certificates and checkpoint files are read from the checked-out tree. Ledger, registry, gap statement and TSA policy are read from Git objects (with replace refs disabled). In a diagnostic run, a PASS on a dirty tree can reflect uncommitted checkpoint or certificate files. In `--release` mode the verifier enforces this itself: the checkout must be clean and at `--commit`, and every file under `tools/g4/checkpoints/` and `tools/g4/keys/` is compared byte for byte with its blob committed at HEAD, so `git update-index --skip-worktree`, `--assume-unchanged` or a same-size swap cannot substitute evidence. Only a `mode: release` PASS is release evidence.
- **Token status.** A non-granted token is refused (`TOKEN_INVALID`). In practice `openssl ts -verify` already rejects a response that carries no token, so this check is defence in depth.
- **History.** G4 does not re-verify history at or below #914, does not repair the pre-anchor break at #382, and does not resolve the October VETOs #610 to #612 or event `7126134e`, which remain UNKNOWN/UNRESOLVED.
