# Plan: v6.0.12 consolidated release governance — RC1 delta, #619 release PDF, #467 G4

**iteration**: 1
**change_class**: governance
**risk_grade (proposed)**: L3 (security, supply chain and governance integrity)
**pr_target**: `release/v6.0.12-rc1-candidate-20261108-no-ci` (PR #631), then `main` only after a seal and owner release authorization.
**Candidate under review**: the exact SHA is given in the audit request and the submitting commit message. Release-code freeze is `e99c4e1e`, which is #633 at `a874cef3` plus #619 at `c92038fd`. This plan's own governance commits do not change packaged extension bytes.
**Delta**: `v6.0.11..<candidate>`. Appendix: `plan-v6012-release-governance-inventory.md` lists every non-test, non-doc file with its status, line counts, issues, tests, risk and audit evidence.

## Ordering inversion and historical record (declared; nothing backdated)

1. **The RC1 delta (`v6.0.11..3d722d02`) was implemented without any `/qor-plan` or `/qor-audit`.**
   - It covers 44 non-test files: the #601 theme (#620), the #465 audio vault (#621), #474 governed integrations and ledger (#622), #470, #471, #478, the dependency updates (#590, #595–#598, #610, #611) and #480 test hardening.
   - The ledger has no entry for any of it; the last entry before this work is #914.
   - This plan subjects that delta to a **retrospective, post-implementation, pre-release** independent audit. It is not a pre-implementation PASS and must never be described as one.
2. **#619** (7 files: release-PDF generator, byte-pinned brand sources, release workflow and artifact checks) was also implemented before audit. It is reviewed here on the same retrospective basis.
3. **#633** (#463/#475) already has an independent PASS: Entry #916, after VETO #915, in session `2026-11-09T1550-4e0666`. This plan relies on that verdict for those 36 files and does not re-audit them. Its ordering inversion is recorded in its own plan.
4. **Preserved, not rewritten:**
   - the ledger history through #916, including the disclosed pre-anchor break at #382 and the clean epoch at #914;
   - the shadow events;
   - the October operator-local VETOs #610–#612 and event `7126134e`. These stay **UNKNOWN/UNRESOLVED**. This plan does not close, supersede or reinterpret them, and its scope is not their ledger-anchor plan.

## Scope and per-group acceptance (the auditor must verify each claim against code; tests passing is not acceptance)

| Group | Files | Purpose | Key tests | Risk | Acceptance questions for the audit |
|---|---|---|---|---|---|
| #601 theme (#620) | 24 (incl. `ConsoleThemeAuthority.ts`, `ConsoleThemeRoute.ts`, `theme-sync.js`, `SreTemplate.ts`, `roadmap.css`) | The Console theme reaches the Monitor/SRE view via the VS Code setting | `monitor-theme-inheritance.spec.ts`, theme route/authority unit tests | L3: a new write route | Theme changes require the Console request guard (loopback, exact Origin, JSON) plus a per-session key. Non-VS Code pages are read-only. No reflected or stored XSS through theme values. The key is stripped from the URL |
| #465 audio vault (#621) | 6 (`AudioVaultService.ts`, `brainstorm-pending-routes.ts`, `brainstorm-audio-management.js`, …) | Consented local recording storage | `AudioVaultBoundary.security.test.ts`, `AudioVaultPersistenceConsent.test.ts` | L3: local data and file I/O | Opt-in consent is required before any persistence. Path containment, size/quota and deletion races are handled. No path traversal through recording ids |
| #474 governed integrations (#622) | 11 (Bicameral routes/bootstrap, `IntentStore.ts`, `ReleasePipelineGate.ts`, `LedgerIntegritySummary.ts`, OpenHands import, renderers) | Truthful capability and evidence reporting; launch hardening | `bicameralLaunch.adversarial.test.cjs`, `BicameralRoute.parity.test.ts`, `bicameralToolRoute*.test.ts`, `integration-catalog-renderer.test.ts`, `openhands-import.test.ts` | L3 | Bicameral launch uses trusted resolution. Routes keep the guard. The ledger summary does not report unverifiable trust as verified. The release gate does not weaken |
| #470, #471, #478 | 4 | Trust reporting honesty, serialized Console startup, Sentry pagination scope | the commits' unit tests | L3 | No green count from unverified checkpoints. A concurrent start fails closed. Sentry Link pages cannot change the approved scope |
| Dependencies | `package.json`, `package-lock.json`, `oss-sast.yml` | glob 14.0.2, body-parser 2.4.0, @hono/node-server 2.1.5, qs, fast-uri, undici; SAST action bump | production `npm audit` | L2–L3 | No new install scripts or unexpected new transitive packages. The action is pinned |
| #619 release PDF | `build-release-notes-pdf.cjs`, `release-artifacts.cjs`, `release.yml`, `native-vsix-qualification.yml`, two brand assets | Versioned, checksummed branded release-notes PDF in the release set | `releasePdf.test.cjs`, `releaseArtifacts.test.cjs`, `releaseWorkflow.test.cjs` (72/72) | L3: release supply chain | The workflow change adds no trigger and no secret exposure. The PDF is generated once and its checksum appended; no replacement is possible. Brand inputs are verified by Git blob SHA-1 and SHA-256 (next section) |
| #633 (#463/#475) | 36 | Frozen Qor-logic consumer; fail-closed agents | see plan `plan-v6012-633-frozen-qor-and-agent-refusal.md` | L3 | **Already PASS #916**; not re-audited |

## #619 canonical brand assets (verified at plan time)

The PDF generator pins both files by Git blob and SHA-256 and refuses any mismatch. On 2026-11-09 the owner chose the current studio logos in place of the earlier unavailable originals. The evidence for that is #619 at `c92038fd` and the owner's instruction of 2026-11-09. Pinned values, independently recomputed from the committed blobs at `e99c4e1e` (they equal the generator's pins):

| Asset | Git blob | Bytes | SHA-256 | Provenance |
|---|---|---|---|---|
| `source-mythologiq-studio.webp` | `b2b7181bdd25779a3848e8dd4f002040a33a11c4` | 28744 | `c0141a60b03cc6b96750cb17ac3b8ca77b5d650539787cdf8fb83ef7ce9694b2` | `Knapp-Kevin/MythologIQ` main `public/assets/studio-20261030-v76/mythologiq-silver-concept.webp` |
| `source-failsafe-studio.png` | `8401110b23f402a1bc11967e13525af73a8d2023` | 823706 | `74d5e8c639e964db764a5f8fa1f631664d793ae2da477e849545dc1e80f53cb0` | `Knapp-Kevin/MythologIQ` main `public/assets/products/failsafe-logo.png` |

The earlier pins `4749bff2…` and `09df4938…` are retired by that owner decision. They are not claimed to be in the PDF.

**PDF reproducibility.** Two renders are visually identical but not byte-identical. The release must therefore attach the bytes generated once by the release job and recorded in `SHA256SUMS.txt`, and never regenerate them.

## G4: complete-ledger-byte witness (recommended owner disposition, pending explicit acceptance)

**Recommendation.** Implement G4 for v6.0.12 as release-governance tooling under `tools/g4/` and `scripts/`. It is not part of the packaged extension, so it changes no VSIX bytes. Take the first, genesis checkpoint at the v6.0.12 seal. **Owner acceptance of the key and TSA choices below is required before implementation, and before the seal.**

**Design:**
- **Signing key:**
  - ECDSA P-256, created in the **Microsoft Platform Crypto Provider (TPM 2.0)** with `KeyExportPolicy NonExportable`, key usage DigitalSignature only, current user, on the owner's workstation.
  - This host has TPM 2.0 present, initialized and ready, and the provider available.
  - Only the public certificate (`.cer`) and its SHA-256 fingerprint are committed. The private key never leaves the TPM, CI or the repository.
- **Checkpoint manifest** (canonical JSON):
  - repository and full commit SHA;
  - ledger path;
  - **SHA-256 and byte length of the complete committed ledger blob, including all Verdict/Decision prose**;
  - entry count and last entry number;
  - SHA-256 of the previous checkpoint, or the explicit genesis marker "after clean epoch #914";
  - SHA-256 of the historical-gap statement (the October VETOs UNKNOWN/UNRESOLVED; the pre-anchor break at #382);
  - key fingerprint and UTC instant.
- **Signature:** over SHA-256(manifest), by the TPM key, through .NET `ECDsaCng` with the provider key opened by name (PowerShell `tools/g4/sign-checkpoint.ps1`).
- **Independent witness:** an **RFC 3161** timestamp over SHA-256(manifest ‖ signature) from an independent TSA that the owner selects (for example DigiCert or Sectigo public TSAs). The `.tsr` token and the TSA certificate chain are stored with the checkpoint.
- **Verifier** (`scripts/g4-verify-checkpoint.cjs` plus `openssl ts -verify`). It recomputes the ledger blob digest at the named commit and checks:
  - the signature against the committed public certificate;
  - that the TSA token is valid, its imprint matches, and its time lies inside the key's validity window;
  - the previous-checkpoint chain;
  - non-revocation.
- **Falsification tests** (disposable copies; no live ledger mutation). The verifier **must refuse** each of:
  - an edited Verdict or Decision text;
  - removed or reordered entries;
  - an edited manifest;
  - a wrong, unknown or revoked key;
  - a changed commit;
  - a missing token;
  - a replayed token (imprint mismatch);
  - a token outside the key window;
  - an offline or unknown TSA status.

  Each negative needs an observed receipt.
- **Cadence:** one checkpoint at every `/qor-substantiate` seal and at every release-candidate promotion. A missing, offline or expired witness is BLOCKED, never a neutral PASS.
- **Revocation:** `tools/g4/revocations.json` holds owner-authorized, RFC 3161-timestamped revocation notices with an effective time. The verifier refuses checkpoints signed after that time. Checkpoints from before revocation stay inspectable, with their original trust state.
- **Recovery:** TPM loss or reset makes the key unrecoverable by design. A replacement key needs:
  - a key-transition record, timestamped and bound to the old fingerprint;
  - an owner identity attestation;
  - an independent technical PASS before new checkpoints are trusted.

  There is no silent fallback key and no key copy in CI.
- **Operating limitations (disclosed):**
  - the key is bound to one workstation;
  - it is owner-held, so it gives tamper evidence and time ordering, **not non-forgeability against the owner**;
  - RFC 3161 proves existence at a time, not inclusion in a public append-only log;
  - the design trusts the TSA and depends on its availability;
  - signing is Windows-only;
  - it does **not** re-verify history at or below #914, and does not resolve the October VETOs.

**Alternative.** The owner may instead defer G4 to v6.0.13, with this exact disclosure in the release notes, as an explicitly accepted residual risk. In that case RC1 checklist item 81 must be amended by a dated owner decision. Either way, the decision is the owner's alone. The independent audit assesses only the technical soundness of the design.

## Sequence after this audit

1. Independent `/qor-audit` of this plan, iteration 1.
2. If PASS, the owner accepts or defers G4 (key provider, TSA, cadence).
3. If accepted, implement G4 under `/qor-implement`, run its falsification tests and create the genesis checkpoint.
4. `/qor-implement` gate for the release session, followed by **`/qor-substantiate`** on the exact candidate. The seal's scope must name `v6.0.11..<candidate>` and reference #916 and this plan's PASS.
5. **Release commit.** Flip the README markers from the unpublished-candidate label to `**Current Release**: v6.0.12 (<release date>)`, with the same date in both CHANGELOG headings. The repository docs-coherence gate (`scripts/validate.ps1`) requires this on `main`/tag refs, and it fails on `e99c4e1e` by design. This changes the packaged README, so on that exact commit, once each, re-run: `validate.ps1`, `validate-vsix --source-only`, `release:preflight`, the 8-target package, the PDF, `verify-set` and the installed-VSIX run. Code-level gates from `e99c4e1e` are reused, because no source changes.
6. RC1 promotion, then owner release authorization.

## Boundaries

**Limitations:**
- **Not re-run since `74aab814`** (no `qorlogic` code changed since): the frozen Qor-logic conformance is 15/19 (upstream gaps disclosed), and the #463 real-CLI E2E is 30/30 from a short path.
- **Tooling-shortfall checks:** macOS and Linux targets are verified by package integrity only, not by installed-host tests, on this Windows host.

**Non-goals:**
- No new extension features.
- No change to frozen Qor-logic.
- No ledger history edit.
- No GOVERNANCE.md amendment; that is #627, tracked separately.

**Exclusions:**
- No merge to `main`, tag or publication under this plan.
- No G4 key creation before owner acceptance.

## CI commands (local, exact candidate)

```
scripts/validate.ps1 -Version v6.0.12; npm ci; npm run compile; npm run lint; npm run test:runner-coverage;
npm run test:citation-parity; npm run test:node; npm run build:package; vscode-test (VS Code 1.122.1, 1.145.2);
npm run test:ui; node scripts/validate-vsix.cjs --source-only; npm run release:preflight;
node scripts/package-all-targets.cjs --out dist-vsix --version 6.0.12;
node scripts/build-release-notes-pdf.cjs --version 6.0.12 --out dist-vsix;
node scripts/release-artifacts.cjs verify-set dist-vsix --version 6.0.12; installed-VSIX #475 adversarial run (both hosts)
```

## Open questions

None for the audit. The G4 acceptance, the key provider and the TSA are owner decisions that come **after** this audit and before implementation. The audit assesses the design.
