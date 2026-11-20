# Prospective FailSafe v6.1.0 Voice Pack trust-boundary plan (#710)

**Status:** PROPOSED SOURCE-SCOPE RECONCILIATION ONLY. This is not a native `/qor-plan` registration, native `/qor-audit` PASS, authorized implementation, substantiation, seal, merge or release approval.
**Owner intent:** Harden the existing optional Voice Pack without retiring the shipped frozen Qor baseline, touching Claude's in-flight #695/#705/#339 work or changing published v6.0.13.
**Change class:** Security/robustness candidate for a governed future v6.1.0 release. Native version applicability and Step 7.5/9.5.5 outcome remain unresolved under #705/#709.
**Source baseline:** `main@0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc` when candidate branch began. Bind a fresh native plan to **current** main, exact candidate HEAD and complete diff before an audit.
**Review:** L3 prospective: reads and replaces local executables/WASM, potentially displacing user files. Owner-authorized adversarial audit may substitute an independent reviewer; neither replaces native recorded governance.

## Product job and security problem

A user explicitly installs or upgrades the optional Piper/Whisper companion, expects the content to be the six approved browser assets, expects a corrupt/linked/foreign directory not to be mistaken for installed or overwritten, and expects a previously working pack to survive a failed upgrade.

Mainline's old `tar -xzf` and manifest-guided file joins trusted archive member names, types and paths before validation. Old activation tests accepted one-file or empty manifests, and the detector could read paths supplied by an untrusted manifest. The two-rename upgrade could leave old data unreachable if the second rename failed. Same-release `.sha256` alone does not establish publisher authenticity.

## Prospective source write set under this single owning PR

1. `FailSafe/extension/src/voice-pack/safe-archive.ts`: bounded gzip/USTAR reader; reject unsupported members, links, path escape, duplicate/unlisted data, oversized or empty assets; validate exact manifest-version, six asset names and SHA-256 before writing staging content.
2. `FailSafe/extension/src/voice-pack/transactional-swap.ts`: validate copied staged files; promote with rollback, collision/foreign-dir refusal, backup preservation on double fault; distinguish post-success cleanup warnings from install failures.
3. `FailSafe/extension/src/voice-pack/install-handler.ts`, `types.ts`, and `uninstall-boundary.ts`: bounded allowlisted downloads, real/absolute storage roots and linked-ancestor refusal; no volume-root install/uninstall; refuse unrelated content on replacement/uninstall; keep progress and errors truthful.
4. `FailSafe/extension/src/voice-pack/voice-pack-detector.ts`: installed-state probe must admit precisely the six canonical asset paths, exact manifest keys/hashes and bounded regular non-link files, not arbitrary `manifest.expectedFiles`; return CORRUPT instead of INSTALLED on invalid structures.
5. Corresponding tests: `src/test/voice-pack/{safe-archive,transactional-swap,voice-pack-detector}.test.ts`, `src/test/extension/{voice-pack-install,voice-pack-install-guards,voice-pack-install-test-helpers,voice-pack-activation}.test.ts`, `src/test/shared/exec/no-bare-exec.test.cjs`, and `src/test/ui/helpers/serveConsoleServerUI.ts`. Replace obsolete partial-manifest positive fixtures with actual six-asset structures. Prove malformed/linked/foreign data refusals, no unintended deletes and restoration on injected rename failures.
6. `docs/architecture/integrations/voice-pack.md` and `docs/architecture/INTEGRATION_PORTFOLIO.md`: bind code anchors to exact source and disclose security/availability limitations. No public marketing claim of real release-backed voice installation.

This reconciles the implementation already in the candidate branch; it **does not retroactively authorize** additions beyond the prior narrow rollback-only draft. A new registered native plan and prospective review must examine every expanded path and adverse impact.

## Dependencies and boundaries

- #712 / #707 isolates optional browser voice vendoring from core `npm ci`. Preserve its committed pins and await #695 dependency/security reconciliation; do not silently rewrite the lockfile or source assets here.
- #732 owns **separately publisher-authenticated, properly approved and published** `v<version>-voice` releases. A checksum served beside its archive is not an independent signer, and no real customer release is claimed by tests or ephemeral CI packaging.
- Reading and filesystem checks reduce risk but are not a race-free OS directory-handle containment mechanism against concurrent same-user mutation. Interrupted two-rename transactions remain recoverable, not guaranteed process-crash atomic.
- Voice model acquisition/inference and actual installed VS Code host acceptance on Windows, macOS and Linux remain unqualified by a mocked fetch or browser harness.
- No release tag, force-push, signing-key access, private G4 evidence disclosure, frozen Qor tool edit, optional feature auto-enablement, dependency migration or owner credential/ruleset change is authorized here.

## Required falsification and acceptance before integration

1. Native `/qor-plan` registered against exact current main, expected source write set, security classification and rollout; source-bound adversarial L3 `/qor-audit PASS`; native implementation/substantiation and accepted governance line. Honor #705/#709 no-bump/no-tag conflicts, never fabricate a native receipt.
2. Exact-head GitHub six-family CI, including repo standards, Node suites, browser Playwright, full VS Code extension host and Windows/macOS/Linux compile. Preserve every prior red run and repair only the actual root cause.
3. Genuine pinned upstream six-asset byte parity and real archive producer readback, with archive consumer admission. Distinguish the already recorded CI-only #733 checks from installed runtime evidence.
4. Negative and positive installation cases: malicious tar members, wrong hashes/version, truncation/inflation, symlinked/linked storage and manifest paths, foreign content, rollback and double-fault recovery, clean uninstall, stale/corrupt detection and normal voice launch.
5. On native supported platforms: exact signed VSIX/version and pack digest, real host/OS and consent, actual download from published authenticated assets, Piper/Whisper activation, uninstall and rollback, customer-visible outcomes. Record legitimate unavailable/offline/refused states.
6. Explicit owner integration GO for the accepted source and a release-specific authorization for any later publication. Keep `main` and published v6.0.13 unchanged until then.

**Disposition:** DRAFT / NO MERGE / NO RELEASE, regardless of CI green. Issue #710 closes only with accepted governed and installed-host product behavior; #732 stays open until a real authenticated release-backed install is demonstrated.
