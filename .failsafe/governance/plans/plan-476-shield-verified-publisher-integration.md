# Plan: #476 production SHIELD GitHub Check wiring and conformance

**Status:** PROPOSED / NOT AUDITED / NO IMPLEMENTATION AUTHORITY. **Issue:** #476 (P0). **Baseline:** `main@e5b0aee9195d9e045b0c1f47fde239e9c8a49e0e`; v6.0.12 integration reference `#623@497c0821aa944ba07388fd14af3d66965a96bd68`.

## Current source-backed disposition (2026-11-08)

- The original operator-selected `SHIELD: PASS` command has **already been mitigated**: `src/extension/github-checks-command.ts` offers only a consented `FailSafe Manual Advisory` with `neutral` conclusion. Its source blob is `f529d29b5bb1485a41329d47ff5656a3cf145aa6` on main and #623.
- `src/integrations/github-checks/github-checks-map.ts` reserves `FailSafe SHIELD` from the generic publisher. `check-run-transport.ts` requires an unforgeable verifier-minted `VerifiedShieldReceipt` for SHIELD success.
- `src/integrations/github-checks/shield-check-publish.ts` already implements `publishVerifiedShieldCheck`, recipient/commit validation, exact-HEAD recheck, negative/rejected outcomes, 201 confirmation, and an echo-mismatch flag. **Do not build a second publisher.**
- Production `github-checks-command.ts` **does not call** the verified publisher. The existing test `src/test/integrations/github-checks/shield-check-publish.test.ts` explicitly asserts `referencesTo('shield-check-publish') === []` in production, pending future F1 wiring. A positive end-to-end check is not yet delivered.
- `shield-receipt-verifier.ts` uses `unavailableChainStatus` as the safe default. It is **not a legitimate production OK adapter**. A local HMAC receipt by itself is not independent CI attestation, and native post-anchor verification does not authenticate all entry prose (#467).
- `sameRepo` and `repoOf` compare Git remotes by owner/repo while `parseRepoSlug` intentionally discards the remote host. Cross-host identity and Enterprise GitHub support need an explicit policy, not a silent assumption.
- GitHub can confirm HTTP 201 while echoing a different name, head or conclusion. `publishVerifiedShieldCheck` correctly records that the POST happened to prevent duplicate retry, but `echoMismatch` must be treated as an **incident**, never a verified PASS in UI, ledger or release criteria.

## Scope and sequencing

1. Preserve the existing neutral manual-advisory command and its separate allowlist. No manual control may select a SHIELD verdict, and advisory checks must never satisfy required SHIELD policies.
2. After a **prospective independently evidenced `/qor-audit` PASS** for this exact plan and source, wire the existing verified publisher through a separately named explicit action. Do not reuse the manual advisory's token consent as permission to assert a governance PASS.
3. Build a real production `ShieldEvidenceSource` from the already-hardened `workspace-evidence-source.ts`, with guaranteed disposal, owner-selected credential access, exact Git origin/HEAD snapshot and safe source checkout. No evidence blob or signing key in process arguments, logs, console URLs, check summaries or GitHub issue comments.
4. Provide a separately audited `ReceiptKeyProvider` and `NativeChainStatus` with pinned frozen Qor 0.176.1 compatibility. `NativeChainStatus.check` must demonstrate the canonical accepted chain integrity on the candidate, not manufacture OK from an 8/8 health label, local post-anchor pass, or the deprecated 0.169.0 `TESTED_AGAINST` constant.
5. Bind issuer, audited plan, seal session, native verdict and external G4 full-ledger-text witness proof to the **same immutable commit**. G4 custody and independent witness decisions remain with the sole owner; the reviewer supplies a technical verdict, not a vote. Until #467 is legitimately resolved, no verified SHIELD success is eligible for publication.
6. Validate GitHub remote host identity as well as owner/repo and expected API origin. Define GitHub.com versus Enterprise-host mapping explicitly; reject unapproved aliases, remote host swaps, credentials in remote URL, unusual ports, or mismatched evidence host. Preserve existing protected-token host affinity.
7. Obtain clear opt-in for the **exact** GitHub repository, commit SHA, check name, conclusion and evidence digest before POST. Re-read HEAD and remote identity immediately before POST. Stop on absent/moved/seal-unbound evidence, stale authorizations, offline dependency or native chain not OK.
8. Treat POST outcome as three states: not sent; confirmed and consistent; confirmed but suspect. A 201 with mismatched echo is **confirmed sent but never verified successful**; record the check run ID, show an error and quarantine the claim. A failed local recording after 201 must not silently retry an already created check.
9. Keep source identity current. This planned candidate inherits unaudited #623 reference changes; rebuild any accepted implementation prospectively from an owner-approved baseline under PASSed plans. No retrospective PASS is permitted.

## Planned affected surfaces (relative to `FailSafe/extension/`, subject to independent audit)

- MODIFY `src/extension/github-checks-command.ts` to expose a separate verified flow while retaining neutral manual advisory.
- REUSE `src/integrations/github-checks/shield-check-publish.ts`, `check-run-transport.ts`, `github-host-affinity.ts`, and `shield-receipts/workspace-evidence-source.ts`; do not introduce another network posting path.
- NEW or isolated module for the native Qor chain adapter and trusted key provider, selected only after #467 owner decisions. `unavailableChainStatus` remains fail-closed on any missing adapter.
- UPDATE `src/integrations/github-checks/github-checks-map.ts` / provenance identity validation only as required for the reviewed host-origin contract.
- UPDATE `src/test/integrations/github-checks/shield-check-publish.test.ts` production importer expectation **only after** production wiring is genuinely present and tested.
- ADD tests around the production command/adapter, Git host identity, explicit consent, negative evidence, native filesystem reads and the Check Run transport. Section 4 limits (≤250 lines/file, ≤40 lines/function, nesting ≤3) remain binding.

## Falsifiable acceptance: negative before positive

| Adversarial control | Required observation |
| --- | --- |
| User-supplied PASS, WARN or VETO / missing receipt | No SHIELD success POST. Manual notice stays `neutral` and non-authoritative. |
| Audit VETO, forged or stale HMAC, substituted artifact, missing session seal | No SHIELD success POST; provenance failure names a safe reason. |
| Native chain DAMAGED, INCOMPLETE, UNAVAILABLE, or only untrusted post-anchor status | No SHIELD success POST; fail closed, no status normalization. |
| Missing/revoked G4 key or external witness, altered Verdict/Decision prose | No SHIELD success POST and no disguised historical repair. |
| Untrusted remote hostname, cross-Enterprise same owner/repo, origin/HEAD swap, fork | Refusal before network; token never sent to unrelated host. |
| Reused session, sealed prior commit, changed merge head, shallow/partial repository | No SHIELD success; an actual newly sealed exact commit is required. |
| 401, 403, 422, timeout, malformed 201 | Explicit not-confirmed outcome; never evidence of success. |
| 201 with wrong echo or persistence failure | Preserve publication ID, flag suspect/missing local record, no duplicate retry or release PASS. |
| Disabled integration or absent token | Zero credential/evidence-dependent external requests. |
| Valid, fresh, independent PASS and sealed, witnessed exact candidate | Exactly one `FailSafe SHIELD` check with GitHub conclusion `success` for the bound repository and HEAD, with source/digest references and GitHub confirmation. |

## Qualification requirements

Run the existing unit and extension-host suites at the **exact final commit**, then disposable-host adversarial checks for Windows and other supported platforms. Use an injected fake Checks transport for negative tests and a minimally permissioned GitHub test repository for real permission, checked-response, status and retry observations. Bind evidence to the same candidate revision, Qor wheel digest, test environment and G4 witness verification. No hosted CI merely to make a green badge; real integration tests and independent audit must substantiate the product claim.

**Stop condition:** No actual native chain + valid G4 witness + accepted plan/audit PASS + exact source/receipt match means #476 remains OPEN and v6.0.12 NO-GO. No code implementation, main merge, tag, Marketplace or Open VSX publication is authorized by this document.
