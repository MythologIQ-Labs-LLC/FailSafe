# Plan: G4 production TSA trust root, FreeTSA (#638, v6.0.13)

**Status:** iteration 1, PROPOSED for independent audit. This document records no PASS and no merge authority.
**Baseline:** `main` `29b819feaf07ca991c9b6a75f8e0f01549e3cd11`. **Branch:** `feat/638-g4-freetsa-root`.
**Change class:** trust configuration. Risk grade L3: this commits the production trust anchor that every G4 checkpoint witness is validated against.
**Owner authority:** the owner's dated FreeTSA selection, `docs/releases/V6_0_13_G4_TSA_OWNER_SELECTION_2026-11-12.md` on PR #647 (head `c9635dc0`), restated in the owner's brief of 2026-11-12. The service is FreeTSA's public RFC 3161 service at `https://freetsa.org/tsr`. One root only, and no fallback.
**Merge precondition:** PR #647, which carries that record, is merged first, or at the same time, so that the policy note does not cite a file absent from `main`.

## Change

| File | Change |
|---|---|
| `tools/g4/tsa-roots/freetsa-root-ca.pem` | New. Byte-identical to `https://freetsa.org/files/cacert.pem`. File SHA-256 `2151b611…044438`; DER SHA-256 `a6379e7c…18aabc`. |
| `tools/g4/tsa-policy.json` | `status` changes from `pending-owner-decision` to `selected`, with exactly one `trustedRoots` entry naming that file and DER SHA-256. A new `note` states the provenance and that no fallback is trusted. |
| `.gitignore` | `!tools/g4/tsa-roots/*.pem`, placed after the global `*.pem` and `*.key` rules. Without it the root cannot be committed, and a release checkout would report it as an ignored file under `tools/g4` (`RELEASE_TREE_DIRTY`). Keys stay ignored. |
| `FailSafe/extension/src/test/scripts/g4Witness.test.cjs` | The test "committed registry and TSA policy start empty and unselected" is split. The registry half is unchanged. The policy half is replaced by a test that pins literals: status `selected`; exactly one root; its path; its DER SHA-256; `tsa-roots/` holding only that file; the file SHA-256; and the certificate being a self-signed CA with FreeTSA's subject. Any change to the trusted root must also change this test. |
| `.failsafe/governance/evidence/g4-freetsa/**` | Raw qualification evidence (see its `README.md`). |

There is no verifier code change and no change to trust semantics. Fail-closed behaviour is unchanged:
- a missing or unparseable policy is refused;
- an empty or unselected policy is `BLOCKED`;
- a root digest mismatch is refused;
- any token that does not chain to the pinned root is refused;
- `--tsa-ca` is refused in release mode.

## Qualification evidence (summary)

- **Root identity.** The DER SHA-256 equals the inventoried candidate. It was corroborated by 10 sources:
  - the live `freetsa.org` and `www.freetsa.org` over HTTPS;
  - five Internet Archive captures from 2016 to 2025;
  - three unrelated GitHub repositories that first committed it in 2018, 2022 and 2025.

  The site's published PEM hash equals the committed file.
- **Interoperability (run2, 42/42).**
  - Three real FreeTSA tokens for fresh random digests verify against the pinned root alone.
  - Wrong roots are rejected: the Mozilla bundle, and a forged root with the same subject DN.
  - Substituted imprints and six malformed-token variants are rejected.
  - Verification fails outside the signer's and the root's validity.
  - The real verifier in `--release` mode over throwaway repositories carrying the exact policy bytes (`738f5cb1…`) returns `PASS OK`, `mode: release`, with no limitation.
  - Policy, root, token and override variants are refused or blocked with the expected codes.
  - Six outage cases leave no checkpoint behind.
- **Run1 (37/39) is retained.** Both misses were errors in my own test expectations and are explained in the evidence README.
- **Planted falsification of the new pin test.** The test fails for each of: a second root; a one-character digest change; status reverted; an extra file in `tsa-roots/`; and the PEM rewritten with CRLF.
- **Local suites.** `node --test src/test/scripts/g4*.test.cjs`: 109 pass, 0 fail. `npm run test:node`: 1091 pass, 2 fail. Both failures are the known `bundleDeps` worktree-junction artefact. Pro-retirement guard: pass.

## Accepted risks (owner, 2026-11-12) and limits

- **Who stands behind the root.** One unnamed, non-profit operator holds a private, self-signed root. It is outside public trust programs and has no independent audit.
- **Service limits.** One request per second, no SLA, and certificate notices published only on the website.
- **Token-time validity.** Until token-time validation is implemented, a checkpoint verifies only while the current time is inside the signer's validity, which runs to 2040-02-02, and the root's, which runs to 2041-03-07. OpenSSL validates the chain at the current time.
- **Revocation.** The root CRL (next update 2027-09-18) lists no revoked certificates. OCSP did not answer from this host. The verifier does not check revocation of the TSA signer.
- **What this does not do.** It does not create a key, a checkpoint or a genesis, and it does not approve a release.

## Rollback

Revert this PR: `tsa-policy.json` returns to `pending-owner-decision`, and the verifier reports `BLOCKED TSA_POLICY_UNSELECTED`. No checkpoint exists yet that depends on this root. After a genesis exists, replacing the root is an owner decision with its own design and audit.

## Audit questions

1. Does the committed PEM equal the independently corroborated certificate, and does the policy pin exactly its DER SHA-256?
2. Does anything in the change widen trust or weaken fail-closed behaviour, including the `.gitignore` negation?
3. Does the evidence support the claims made here, and is anything overstated?
4. Does the new test fail on every relevant change to the policy or root?
