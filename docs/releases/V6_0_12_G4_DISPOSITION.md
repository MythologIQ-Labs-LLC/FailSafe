# FailSafe v6.0.12: G4 release disposition (owner decision)

**Decision date**: 2026-11-09
**Decision owner (responsible)**: repository owner, Knapp-Kevin (MythologIQ Labs, LLC)
**Release**: v6.0.12 only
**Status**: recorded by the owner. It becomes effective only after the independent Judge accepts it. Acceptance, when given, is recorded as a ledger entry that cites this file's SHA-256.

## Decision

The owner approves deferring the G4 independent witness infrastructure (#467) from v6.0.12 to v6.0.13. G4 is a TPM-backed, non-exportable checkpoint signing key plus an independent RFC 3161 timestamp over the complete committed ledger bytes.

The deferral **expires at the v6.0.13 release or on 2026-12-09, whichever comes first.** After expiry, no FailSafe release may ship without either G4 implemented and qualified or a new, separately recorded and reviewed owner decision.

The design that v6.0.13 must implement is the corrected G4 specification in `.failsafe/governance/plans/plan-v6012-release-governance.md`, reviewed in audits #917 to #919. It covers:
- byte-prefix ledger continuity between checkpoints;
- a bound, monotonic revocation history;
- exact persisted manifest bytes;
- length-framed and domain-separated timestamp imprints;
- the disclosed truncation limits.

No TPM key has been created, no timestamp authority has been chosen or enrolled, and no G4 code exists. Nothing in v6.0.12 claims otherwise.

## What is not deferred (preserved requirements)

Every existing ledger-verification and release-governance requirement stays in force for v6.0.12:
- the native Qor-logic hash chain and `verify-ledger --post-anchor` (clean after the disclosed anchor at #382), and `governance-health`;
- the clean epoch at Entry #914, and append-only ledger history, with no rewrite, backdating or deletion;
- the independent `/qor-audit` PASS (#919) and the preserved VETOs #915, #917 and #918;
- `/qor-implement` and `/qor-substantiate` on the exact artifact-producing release commit, with the seal citing this file;
- the release workflow gates:
  - `validate.ps1`;
  - the test suites;
  - VSIX validation;
  - the 8-target package;
  - the checksummed release-notes PDF;
  - `release-artifacts verify-set`;
  - the marketplace provenance parity;
  - the immutable GitHub Release set;
- the owner's explicit publication approval after exact-commit GO evidence.

## Residual risk accepted for v6.0.12

The ledger has no independent witness of its complete bytes. Its integrity evidence is the native hash chain plus Git history, and both live in material the owner controls. Consequences:
- **Undetected edits:** someone with write access to the repository could rewrite ledger text, including Verdict and Decision prose, and recompute the chain. No external time-stamped checkpoint would expose the rewrite. FailSafe's native ledger check does not cover the text of entries; this is already disclosed in the v6.0.12 Known Limitations.
- **Undetected truncation:** deleting the newest entries cannot be detected without an independently retained head.
- **Owner trust:** the owner is trusted not to forge history. Even when implemented, G4 gives tamper evidence and time ordering, not non-forgeability against the owner.

## Compensating controls in v6.0.12

- **Native chain checks.** Every gate entry is written with the native helpers (`ledger_emit`, `ledger_hash`). `verify-ledger --post-anchor` runs at each gate and before the seal.
- **Public Git history.** Pushed commits on the public GitHub repository give third-party copies and timestamps of the ledger at each push. GitHub is a mirror, not a witness, so this is not an independent attestation.
- **Recorded verdicts.** Each audit verdict's content hash is in the ledger, and each report is committed to Git (`.agent/staging/`, with the #917 report preserved verbatim as `AUDIT_REPORT-917-release-plan-iter1.md`).
- **Bound seal.** The release seal binds the exact release commit, the artifact checksums (`SHA256SUMS.txt`) and this file's SHA-256.
- **Release-notes disclosure.** The release notes state that G4 is not implemented.

## Historical coverage limitations (unchanged by this decision)

- The disclosed pre-anchor chain break at Entry #382.
- The October operator-local VETOs #610–#612 and event `7126134e` remain **UNKNOWN/UNRESOLVED**. This decision does not close, supersede or reinterpret them.
- When G4 is implemented, its genesis checkpoint will attest only to ledger bytes from its creation onward, after the clean epoch #914. It will not retroactively verify earlier history.

## References

- Plan: `.failsafe/governance/plans/plan-v6012-release-governance.md` (iteration 3; independent PASS, ledger Entry #919).
- RC1 checklist item 81 (PR #631), amended to cite this file and its SHA-256.
- Issue #467.
