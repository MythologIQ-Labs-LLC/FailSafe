# Prospective FailSafe 6.1.0 native plan: recoverable Voice Pack replacement (#710)

**Status:** PROPOSED; candidate source only. This file is **not** a native `/qor-plan` receipt, `/qor-audit` PASS, `/qor-implement` authorization, seal, or merge approval.
**Owner intent:** Continue v6.1.0 development with strict repository hygiene; preserve v6.0.13 and Claude's in-flight #695/#705/#339 governance work.
**Issue:** [#710](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/710) (Voice Pack installer trust boundary).
**Change class:** Security/robustness candidate for v6.1.0; **no** version bump, tag, or publication from this PR. Reconcile with #705/#709 release-class governance and native version applicability before any seal.
**Source baseline:** `main@0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc` at candidate branch creation; reverify before binding native audit.
**Review:** L3 proposed because install-time disk replacement can displace previously working user assets. Solo-owner adversarial review permitted; reviewer must bind exact content and source HEAD.

## Narrow problem

The current `install-handler.ts` copies extracted voice assets to a sibling, renames the existing `voice-pack` to a backup, then renames the replacement into place. A fault between the two renames leaves the previously valid pack inaccessible from its active path, with no rollback. A post-success staging cleanup error can be reported as install failure even though the replacement was promoted.

## Proposed code write set

1. `FailSafe/extension/src/voice-pack/transactional-swap.ts`: prepare replacement in a sibling directory; reject symlink/non-file entries during copy; reject collision; rename existing pack aside, promote prepared replacement, restore prior pack on promotion failure; on rollback failure retain backup and surface both errors; after successful install treat cleanup failures as warnings, not as a false failed installation.
2. `FailSafe/extension/src/voice-pack/install-handler.ts`: use the helper instead of unsafe inline two-rename swap; report any cleanup warnings without logging secrets. Keep fetch, release URL, checksum, progress and extraction semantics otherwise unchanged.
3. `FailSafe/extension/src/test/voice-pack/transactional-swap.test.ts`: real tempfile / injected filesystem fault cases for both rename failures, recovery, backup collision, partial/unsupported staging and cleanup warnings.

## Boundary and non-goals

- **Not a complete #710 fix.** Archive-member validation, bounded extraction, manifest schema/path validation, independently trusted asset inventory, and publisher authenticity remain BLOCKED on separate source-bound implementation and acceptance. Do not label the full installer safe merely from rollback tests.
- No changes to `package.json`, `package-lock.json`, Qor-logic 0.176.1, workflow files, CI rules, tag, release, or voice feature switches.
- Do not delete prior voice data on double rename failure. Preserve backup for operator recovery, including a clear path in the thrown error.
- Inputs to this helper must already be staged/validated by the caller; no semantics are added that would authorize an untrusted archive to run.

## Qualifying evidence required before READY/merge

- Exact-source native plan registration and source-bound adversarial `/qor-audit` PASS followed by authorized implementation/substantiation, with truthful no-tag outcome under the accepted release governance contract.
- Baseline and proposed test suites on Windows, macOS, Linux; extension host install/uninstall and failure injection; no live download necessary for isolated tests; actual voice pack unpack must still be separately qualified.
- A passing full prepush gate and required PR CI, exact HEAD recorded, with negative tests proving an earlier valid pack remains available when promotion fails.
- Demonstrate no loss of previous data when copy/rename fails, no orphan prepared replacement after failed swap, preserved backup on double failure, and honest reporting when post-success cleanup fails.
- Report race/concurrency behavior and crash-recovery limits explicitly; a two-rename sequence is **recoverable**, not genuinely atomic across sudden process termination.

## Rollout/merge authority

Keep the PR **DRAFT** until all native gates, exact-head CI, security review and owner GO are recorded. This candidate must not auto-merge or trigger a v6.0.14 release. The owner may authorize a bounded 6.1 integration after evidence review.
