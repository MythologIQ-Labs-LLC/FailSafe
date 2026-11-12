# G4 token-time, notice and transition semantics: live FreeTSA check (2026-11-12)

`scripts/qualify-semantics.cjs <repo> <out>` runs on the owner workstation (Windows 11, OpenSSL 3.5.7, Node v24.19.0). It uses `qualify-freetsa.cjs` from `.failsafe/governance/evidence/g4-freetsa/scripts/`, which must sit in the same directory.

It builds a throwaway repository from:
- the exact committed `tools/g4/tsa-policy.json`;
- the FreeTSA root;
- the committed FreeTSA root CRL `tools/g4/tsa-crls/freetsa-root-ca-2026-09-18.crl`;
- a copy of the real ledger;
- two ephemeral software test keys, A and B. Their private keys were never retained.

It then creates the following, each with a real FreeTSA token:
- two checkpoints signed by A;
- registry version 2, which revokes an unrelated fingerprint, with its notice token;
- a rotation record A to B;
- a third checkpoint signed by B.

**`sem2` (final): 5 of 5 expectations met.**

| Case | Result |
|---|---|
| Release verification with genesis key A pinned, every token validated at its own time against the pinned root and the real CRL | `PASS OK`, `mode: release`, no limitation |
| The committed CRL removed | `BLOCKED TSA_REVOCATION_EVIDENCE_MISSING` |
| The registry v2 notice token removed | `REFUSED REVOCATION_UNSTAMPED` |
| A second certificate appended to the root file | `REFUSED TSA_ROOT_MALFORMED` |
| Rotation A to B with the FreeTSA-stamped record, release verification pinned to A | `PASS OK`, `mode: release`, no limitation |

**`sem1` (kept unchanged): 4 of 5.**
- **What failed:** the rotation case returned `REFUSED KEY_RESET`, although the record was committed.
- **Cause:** the verifier read blobs with `git show <sha>:<path>`. On Windows, Git also tries such an argument as a working-tree path. The deep scratch directory plus the 64-hex record name exceeded `MAX_PATH`, and Git failed with "Filename too long", which the reader took to mean "not committed".
- **Fix:** `git.cjs` now reads blobs with `git cat-file blob <rev>:<path>`, which never treats its argument as a path and refuses non-blobs.
- **Regression test:** `g4Witness.test.cjs`, "committed blobs are read even when rev:path is longer...". On this host it fails with `git show` and passes with `cat-file`.
- `sem2` is the full re-run after the fix.

`rotated/` in each run holds the throwaway repository's checkpoints, the transition record (`.json`, `.sig`, `.tsr`), the notice token and the registry. Local directory names in the logs are replaced by `<scratch>`, and `.pem` files carry an added `.txt` suffix.

**After audit VETO #959 (iteration 2): `sem3` and `sem4`.** The record format gained `afterCheckpointManifestSha256`, and archived CRLs became append-only, so the check was run again.
- `sem3` met 4 of 5. Its single miss was the script's own outdated expectation: removing the committed CRL is now `REFUSED TSA_CRL_HISTORY` (append-only) rather than `BLOCKED`.
- `sem4`, with that expectation corrected in `scripts/qualify-semantics.cjs`, met **5 of 5**. Release-mode `PASS OK` with no limitation held both for the stamped registry and for the rotation pinned to the genesis key.

**Network use:** 20 RFC 3161 requests to `https://freetsa.org/tsr`, 5 per run (sem1 to sem4), at least 2 s apart. Each was for a framed SHA-256 imprint of throwaway test data. No repository content, key, path or secret was sent.
