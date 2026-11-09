# Plan: v6.0.12 consolidated release governance — RC1 delta, #619 release PDF, #467 G4

**iteration**: 2 (remediation of binding VETO #917; submitted for independent audit iteration 2)
**change_class**: governance
**risk_grade (proposed)**: L3 (security, supply chain and governance integrity)
**pr_target**: `release/v6.0.12-rc1-candidate-20261108-no-ci` (PR #631), then `main` only after a seal and owner release authorization.
**Candidate under review**: the exact SHA is given in the audit request and the submitting commit message. Release-code freeze is `e99c4e1e`, which is #633 at `a874cef3` plus #619 at `c92038fd`. This plan's own governance commits do not change packaged extension bytes.
**Delta**: `v6.0.11..<candidate>`. Appendix: `plan-v6012-release-governance-inventory.md` lists every non-test, non-doc file with its status, line counts, issues, tests, risk and audit evidence.

## Ordering inversion and historical record (declared; nothing backdated)

1. **The RC1 delta (`v6.0.11..3d722d02`) was implemented without any `/qor-plan` or `/qor-audit`.**
   - It covers 49 non-test, non-doc files (`git diff --name-only v6.0.11 3d722d02`, excluding `src/test/`, `docs/`, `.qor/`, `.agent/`, `.failsafe/` and `*.md`; corrected from 44, #917 N9): the #601 theme (#620), the #465 audio vault (#621), #474 governed integrations and ledger (#622), #470, #471, #478, the dependency updates (#590, #595–#598, #610, #611) and #480 test hardening.
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

**Design proposal, not an owner authorization.** Independent G4 witness infrastructure is proposed for v6.0.13 to avoid adding unqualified signing tooling to the v6.0.12 candidate. A deferral remains **PENDING** until the owner expressly authorizes a dated amendment of RC1 checklist item 81 and the independent Judge accepts the release governance disposition. Otherwise v6.0.12 stays NO-GO. If G4 is brought into v6.0.12, implement under `tools/g4/` and `scripts/`, qualify falsification tests, and create a genesis checkpoint at its seal. **No TPM key or TSA enrollment is authorized by this draft.**

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
  - cryptographic identifier and SHA-256 of the previous checkpoint, or explicit genesis marker "after clean epoch #914";
  - for every non-genesis checkpoint, the exact previous ledger byte length and SHA-256, plus evidence that the new committed ledger's first N bytes are byte-for-byte identical to the entire prior ledger at its previous commit (N = prior ledger byte length). Any rewriting, removal or reordering of earlier bytes is a hard refusal even when the new checkpoint is re-signed;
  - SHA-256 and canonical version identifier of the revocation registry, with authorized registry change history verified; unavailability, rollback, removal or unverifiable changes are hard refusal;
  - SHA-256 of the historical-gap statement (the October VETOs UNKNOWN/UNRESOLVED; the pre-anchor break at #382);
  - key fingerprint and UTC instant.
- **Signature:** over SHA-256(manifest), by the TPM key, through .NET `ECDsaCng` with the provider key opened by name (PowerShell `tools/g4/sign-checkpoint.ps1`).
- **Independent witness:** an **RFC 3161** timestamp over SHA-256(manifest ‖ signature) from an independent TSA that the owner selects (for example DigiCert or Sectigo public TSAs). The `.tsr` token and the TSA certificate chain are stored with the checkpoint.
- **Verifier** (`scripts/g4-verify-checkpoint.cjs` plus `openssl ts -verify`). It recomputes the ledger blob digest at the named commit and checks:
  - the signature against the committed public certificate;
  - that the TSA token is valid, its imprint matches, and its time lies inside the key's validity window;
  - previous-checkpoint chain plus byte-for-byte append-only continuity from each previous committed ledger version; a later owner signature cannot legitimize historical-byte edits;
  - the committed revocation registry hash and independently anchored, monotonic revocation history (a signature over a registry alone cannot detect its wholesale rollback to an older state); non-revocation as of checkpoint creation and verification under the effective revocation policy.
- **Falsification tests** (disposable copies; no live ledger mutation). The verifier **must refuse** each of:
  - an edited Verdict or Decision text;
  - removed or reordered entries, including deletion of earlier entries followed by a newly signed checkpoint;
  - an edited manifest;
  - a modified earlier ledger prefix even if a valid key signs the later checkpoint;
  - a revocation-list deletion, edit, or rollback, even if accompanied by a new valid checkpoint signature;
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
  - RFC 3161 proves existence at a time, not inclusion in a public append-only log; the verifier cannot detect coordinated deletion of the newest ledger tail and newest checkpoints without an independently retained trusted head (external checkpoint record/public transparency log), which is required for any strong no-truncation claim;
  - the design trusts the TSA and depends on its availability;
  - signing is Windows-only;
  - verification uses the exact persisted UTF-8 manifest bytes rather than implementation-dependent JSON reserialization, and timestamp imprint uses unambiguous length framing/domain separation over manifest and signature bytes;
  - it does **not** re-verify history at or below #914, and does not resolve the October VETOs.

**Release choice still open:** either (a) qualify G4 implementation for v6.0.12, or (b) obtain explicit owner approval for a time-bound deferral to v6.0.13, amend RC1 checklist item 81 with date, owner, reason and compensating controls, and disclose the lack of independent witnessing in release notes. Neither is deemed accepted by this document. An independent Judge must review the exact resulting disposition.

## Iteration 2: remediation of VETO #917 (V1–V5) and the non-blocking notes

VETO #917 stays in the ledger unchanged. Iteration 2 changes code, tests, release notes and this plan, so the candidate is a new commit (named in the audit request), not `e99c4e1e`. Qualification evidence from `e99c4e1e` does not carry over to it; the gates are re-run on the new candidate (results in the audit request).

**V1 (razor).** Each item the #917 auditor named is fixed by an extraction that keeps behavior, refusal order and error text:

| Item named by #917 | Before | After |
|---|---|---|
| `FailSafeSidebarProvider.ts` file / `getHtml` / `handleMessage` | 266 / 131 / 41 | 244 / 36 / 19; static CSS and nonce moved to `sidebarChrome.ts`; the click decision to `runSidebarClick`. The rendered HTML is byte-identical except the theme list literal, now generated from `CONSOLE_THEMES` |
| `theme-sync.js` `requestTheme` / `applyTheme` / `captureThemeKey` depth | 5 / 4 / 4 | 2 / 1 / 2, through `callQuietly` and `refusedTheme` |
| `ConsoleServer.ts` file | 418 | 397, its v6.0.11 size: theme wiring moved to `wireConsoleTheme` (`ConsoleThemeRoute.ts`), UI-entry selection to `consoleUiEntryFile` (`ConsoleServerSupport.ts`). `buildRouteHost` (51) is unchanged since v6.0.11 |
| `storeAudio` route | 52, depth 3 | 31, depth 3; `readCaptureBody`, `capturePrompt` |
| `wireSavedAudioManager` / inner `reload` | 64 / 43 | 27 / 12; `recordingRow`, `deleteRecording`, `renderRecordings` |
| `captureExclusive` depth; `writeSidecarOrRollback` depth | 4; 5 | 1; 2; `withCaptureLock`, and `openCaptureLock`/`rollbackCapture` in `audioVaultIo.ts` |
| `bootstrapBicameral.ts` file; `wireBicameralClient`; `maybeAutoConnectBicameral` | 348; 48; 46 | 223; 25; 30. Types in `bootstrapBicameralTypes.ts`, settings readers and wiring state in `bootstrapBicameralSettings.ts` (both re-exported, so imports are unchanged) |
| `openhands-import.ts` file; `persistOpenHandsObservations` | 326; 67 | 230; 36. File primitives in `openhands-evidence-file.ts`; `prepareEvidenceFolder`, `newRecordLines`, `writeImportSummary` |
| `bicameralToolRoute`; ratify handler; `registerBicameralDecisionRoutes` | 46; 85 depth 4; 190 | 8; 23 depth 2; 9. Shared `connectedClient` and `governedProceed` keep the 503 → 409 → govern → stale-client order |
| `startBound` | 62 | 26; `listenOnce`, `announceListening` |
| `release-artifacts.cjs` file; `publishRelease`; `main` | 299; 41; 61 | 249; 23; 5. CLI commands in `release-artifacts-cli.cjs`; a new spawn test proves dispatch works when run as a script |

Doc citations that moved were relocated (FX1003 91/91, including the v6.0.8 tag check of 339 shipped claims).

**Pre-existing razor debt outside the #917 inventory (disclosed, not release-blocking, not refactored).** These files were over the limit at v6.0.11. RC1 issue wiring grew them slightly. Refactoring them would be an unrelated architectural rewrite in a release-stabilization cycle. Before/after: `bootstrapServers.ts` 555→561 (`bootstrapServers` 394→398); `commands.ts` 702→710; `main.ts` 506→508 (`activate` 383→385); `IntentService.ts` 509→518; `ConsoleRouteRegistrar.ts` 583→588; `connection.js` 402→408; `roadmap.js` 507→511; `brainstorm.js` 301→303; `brainstorm-templates.js` `renderRightPanel` 71→77; `command-center.js` IIFE 209→212. `validate-vsix.cjs` 279→298 (its `main` shrank 138→130). `qor-conformance-probe.cjs` 335→342 is a #633 file under PASS #916. All are tracked as v6.0.13 debt.

**V2 (theme list).** The registry is `CONSOLE_THEMES` (`ConsoleThemeAuthority.ts`). The sidebar chrome renders it directly. `settings.js` builds its chips from `theme-sync.js`'s `THEMES` and only names and colors them. `theme-sync.js` (a browser module), `package.json` (static manifest) and `theme-tokens.css` must hold static copies. The new `themeRegistryParity.test.cjs` checks each copy, in order, against the registry and the default theme. Three drift mutations, run by hand, were each refused: reordering `theme-sync.js`, adding a seventh registry theme, and dropping one `settings.js` entry.

**V3 (G4 specification).** Corrected in the G4 section above (owner remediation commit `d15cb4af`):
- append-only byte-prefix continuity from every previous committed ledger version, refused even when re-signed;
- the revocation-registry digest, version and monotonic history bound into the manifest, with rollback refused;
- exact persisted manifest bytes in place of reserialized JSON;
- length framing and domain separation;
- disclosure that coordinated deletion of the newest tail needs an independently retained trusted head.

**G4 release disposition.** Recommended: defer the TPM/RFC 3161 witness to v6.0.13. That is a recommendation, not an accepted decision. The exact authorization procedure is:
1. The owner records a dated decision accepting the deferral. It names the residual risk ("no independent witness of the complete ledger bytes; tamper evidence for ledger text rests on Git history and the native chain only") and the compensating controls (the native post-anchor chain check, the clean epoch #914, the release-notes disclosure). It expires at the v6.0.13 release.
2. RC1 checklist item 81 (PR #631 body) is amended to cite that decision. Only the owner can authorize that PR edit.
3. The independent auditor accepts the recorded disposition. Until steps 1–3 exist, the release is NO-GO even with a PASS here.

No TPM key, TSA choice or G4 implementation is claimed or authorized. The release notes already disclose G4 as not implemented.

**V4 (zod GHSA-mrhx-c7xc-m3w5).** Resolved by upgrade, not by risk acceptance.
- **Reachability** (scratch reproduction, Node 24):
  - the only network-reachable bounded collection is the delivery review `reworks` array, `.max(20)` on `POST /api/actions/delivery/review`. The route is loopback-only and behind the request guard (Host/Origin/JSON). A local non-browser process can still reach it, and the body limit is 12 MB;
  - MCP stdio peers (10 MB per message) and ACP peers are local child processes.
  - On zod 3.25.76, 6 million elements (11.4 MB) used about 2.6 GB of heap, and the SDKs' `zod/v4` subpath ran out of memory.
- **Fix:** zod `^4.6.7` (4.6.7 locked). Both SDKs declare `^3.25 || ^4` and dedupe to it, and their smoke tests (tool listing, schema generation, valid and invalid calls, ACP initialize/newSession) behave the same as before. `tsc` is clean, and production `npm audit` reports 0 vulnerabilities.
- **Regression:** `zodBoundedCollections.test.cjs` checks that the installed zod is at least 4.6.6, that 200,000 elements against `.max(20)` give one `too_big` issue (3.25.76 gives 400,001), and that the review route refuses an oversized `reworks` list.
- **Residual, not release-blocking:** unbounded arrays (no `.max`) still collect one issue per bad element in every zod version, with memory linear in input. Defence in depth, scheduled for v6.0.13: tighter body limits on delivery routes, `.max()` on `relatedArtifacts` and overlay arrays, and an ACP line-length cap.

**V5 (release notes).** Both changelogs now carry the RC1 user-visible changes (#465, #470, #471, #474 Bicameral refusals, strict release-gate intent read, OpenHands legacy-lock refusal, catalog relabeling, #478), and each claim was checked against source. The zod fix appears under Security and Dependencies. The `[6.0.12]` sections of the root and extension changelogs are identical.

**Non-blocking notes from #917:**
- **PDF footer overlap (fixed, confirmed defect).** A rendered PDF showed the fixed-position footer at the top of pages 2–4, over the section heading rule, and missing from page 1. The footer is now Chromium's margin footer (`displayHeaderFooter`). Measured in the rendered PDF, it sits at y = 754 pt on every page, below the body area (ends at 744.5 pt), right-aligned with the body. A regression test is added.
- **Audio POST/DELETE without `consoleRequestGuard`.** They keep `rejectIfRemote` plus a per-operation VS Code modal bound to the exact bytes or inode snapshot. Not changed in this release (no new requirement); scheduled for v6.0.13.
- **Stale `.capture-write.lock`.** Fails closed (busy). Manual removal is the documented recovery; scheduled for v6.0.13.
- **Brand images in every VSIX (852 KB).** Accepted as is for v6.0.12.
- **N5** (auditor shell T13(g)) is environment-dependent; this host's run is listed in the audit request.
- **N9** counts are corrected above and in the regenerated inventory.

**Intermittent Playwright failure (`monitor-theme-inheritance.spec.ts:109`).**
- **Symptom:** `page.goto` returned `net::ERR_CONNECTION_FAILED` 155 ms after the harness returned its URL, in one full-suite run (257 tests, 8 workers), before any product assertion. The harness binds port 0 itself, so there is no port-probe race.
- **Not reproduced:** 175/175 passed with `--repeat-each=25` in isolation.
- **Defect found and fixed in the spec:** `openIsolated` opened a new browser context per page and never closed it. Every test left Monitor/Console pages running reconnect loops against closed ports in the worker's shared browser for the rest of the run. Contexts are now closed in `afterEach` before the server.
- **Root cause of the single connection failure:** not proven. The fix removes the only resource leak found on that path. Acceptance evidence: three consecutive full-suite runs after the fix on the refactored source, each 253 passed, 4 skipped, 0 failed. These are repeated full runs, not retries of the single spec.

**Inventory.** Regenerated against the new candidate. Every file lists all issues from every commit that touched it. `package.json`, `package-lock.json`, `validate-vsix.cjs` and `validate-docs-coherence.ps1` are no longer attributed to #601 alone.

## Sequence after this audit

1. Address VETO #917: V1 refactoring, V2 theme source/parity, V3 G4 continuity and revocation requirements (above), V4 production zod HIGH exposure/remediation or authorized bounded risk acceptance, V5 complete customer changelog. Independently audit iteration 2 against the exact revised code candidate and this plan, without changing VETO evidence.
2. If PASS, record the authorized G4 choice or remain NO-GO. For deferral, amend checklist item 81 with dated owner authorization and Judge acceptance; for adoption, record key provider, TSA, and cadence.
3. Only if approved for v6.0.12, implement G4 under `/qor-implement`, run falsification tests and create the genesis checkpoint. If deferred, do not pretend any independent witness exists.
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

## Open questions / unresolved mandatory dispositions

- G4: explicit owner authorization for implementation or deferral plus dated checklist item 81 amendment and Judge acceptance is pending.
- Zod 3.25.76 (GHSA-mrhx-c7xc-m3w5): production `npm audit` reports one HIGH, not zero. Verify affected call paths, input-size bounds and mitigation tests. Either qualify an upgrade or secure explicit version-scoped, expiring owner risk acceptance backed by negative evidence. Disclosure alone does not pass.
- Playwright `monitor-theme-inheritance.spec.ts:109` intermittently failed: reproduce/isolate race and prove deterministic acceptance rather than treating retries as success.
- The previous independent audit remains VETO #917 (L3); this draft is not a PASS.
