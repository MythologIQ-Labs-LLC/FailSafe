# AUDIT REPORT

**Tribunal Date**: 2026-11-09T20:17:51Z
**Target**: `.failsafe/governance/plans/plan-v6012-release-governance.md` (iteration 1, sha256 `ff33ddad868048598fd08dd46036adbde25e66a1027561416247b4ed4e76a1ca`) with appendix `plan-v6012-release-governance-inventory.md` (sha256 `98ece3d98b1bb6275801fdcecb8ec6b8a62b6a2a9f675560a7c8c4bcc8c7d9b3`); gate `.qor/gates/2026-11-09T1958-754dfc/plan.json`
**Subject code**: `v6.0.11..e99c4e1e` (release-code freeze), reviewed at HEAD `aefd8a44` (governance-only commit on top of `e99c4e1e`)
**Session**: `2026-11-09T1958-754dfc`
**Risk Grade**: L3
**Auditor**: The Qor-logic Judge, independent Option B fresh-context audit, solo mode (codex-plugin capability shortfall event `ec9db1f1`)

**Ordering**: this is a RETROSPECTIVE, post-implementation, pre-release review of the RC1 delta (`v6.0.11..3d722d02`) and #619 (`a874cef3..e99c4e1e`), plus a PROSPECTIVE design review of G4. It is not a pre-implementation verdict and nothing is backdated. #633 files (`3d722d02..74aab814`) carry PASS #916 and were not re-audited. The October VETOs #610-#612 and event `7126134e` remain UNKNOWN/UNRESOLVED; this audit does not close, reinterpret or rely on them, and the plan does not either (plan lines 20-23).

---

## VERDICT: VETO

---

### Executive Summary

The security posture of the RC1 delta and #619 is substantively sound: no OWASP Top-10 violation was found on the new local HTTP routes (theme write, audio list/delete, audio store) or the new file I/O, and auditor-run mutations confirmed that the key guards (theme key, per-capture VS Code consent, Sentry scope, ledger-summary strictness, serialized Console start) are each caught by tests. The verdict is nevertheless VETO on five grounds: (V1) Section 4 Razor overage in new and grown RC1 and #619 code, judged by the same standard that produced VETO #915; (V2) the six-theme list is hard-coded in five places with no cross-source parity test; (V3) the G4 verifier, as specified, cannot refuse an edit or removal of earlier ledger entries that a later checkpoint re-signs (no append-only continuity check), and the revocation list is not bound into checkpoints, so the plan's own falsification claims are not achievable by the described checks; (V4) the plan's dependency acceptance cites a production `npm audit` that currently reports one HIGH advisory (zod 3.25.76, GHSA-mrhx-c7xc-m3w5), undisclosed; (V5) the v6.0.12 CHANGELOG, which the #619 generator renders verbatim into the customer PDF, omits the user-visible and privacy-relevant RC1 changes (#465 audio consent/quota/delete, #470, #471, #474, #478, OpenHands lock refusal).

### Steps run / not run

| Step | Status | Result |
|---|---|---|
| Governance health preflight (`governance-health --profile skill-entry`) | RUN | all OK (META_LEDGER pre-anchor residuals tolerated, post-anchor clean) |
| Step 0 gate check | RUN | plan artifact found and valid (`plan-iter1.json`) |
| Step 0.3 plan_iteration_status_lint | RUN | rc=0 (ready) |
| Step 0.4 unchanged-plan short-circuit | RUN | should_skip=False (first audit of this plan) |
| Step 0.5 cycle-count / session-total | RUN | None / None |
| Step 0.6 lints | RUN, plan path passed explicitly (`current_phase_plan_path()` raises InterdictionError on this non-phase branch) | Clean: plan_test, enumeration, grep (0 citations), signature_widening, data_round_trip, feature_tdd, gate_schema_freeze. WARN: delivery_branch (pr_target prose is not a branch name), ci_coverage (semgrep install step), workspace_fragility (ledger_chain_failure_count=333 pre-anchor, 19 branches, 11498 diff lines), live_progress (45 repo-wide; the only delta-file hit, `brainstorm-templates.js`, is static widths: false positive), publication_boundary (400 lockfile URL findings, structural). NOT RUNNABLE: sg_closure_lint (FileNotFoundError for `qor/references/doctrine-shadow-genome-countermeasures.md` relative to the repo root) |
| Step 0.7 spec-delta | RUN | no `spec_deltas` declared, so the mechanical half does not apply; Judge half folded into V3/V5 |
| Step 1 mode / risk score | RUN | solo (no codex plugin, no external reviewer configured); `audit_risk_score` option_b_required false (this audit is Option B regardless) |
| Step 2 state verification | RUN | ARCHITECTURE_PLAN, META_LEDGER, CONCEPT present |
| Step 3 prompt-injection canaries | RUN | rc=0; WARN-only `<script` code-span hits inside historical META_LEDGER prose |
| Version-applicability | RUN | ok; change_class governance, version-not-applicable |
| Security, OWASP, Ghost UI, Razor, Self-application, Test functionality, Dependency, Macro, Feature-test, Infrastructure alignment, Filter-stage, Orphan | RUN | see below |
| prose_test_lint --enforce (`--tests-dir FailSafe/extension/src/test`) | RUN | rc=0 |
| runtime_contract_walk | RUN | 0 findings |
| Documentation drift | RUN | one orphan advisory (below) |
| Step 7 veto_pattern | RUN | no repeated-VETO pattern |
| Auditor re-execution | RUN | `npm run compile` exit 0; `npm run test:node` 966 pass / 2 fail (both pythonResolution T13(g), environment-dependent, see N5); targeted mocha on compiled tests: ConsoleThemeRoute 19/0, AudioVault* (7 files) 41/0, Bicameral parity/factory/registrations 17/0, openhands-import 39/0 (with the suite's 15 s timeout), integration-catalog-renderer 9/0, theme-sync 13/0, ReleasePipelineGate 24/0, four Sentry suites 0 failing; `node --test` bicameralLaunch.adversarial + releaseArtifacts + releasePdf + releaseWorkflow 80/0 (the PDF browser-render test executed, not skipped); Playwright `monitor-theme-inheritance.spec.ts --repeat-each=4` 28/0; `npm audit --omit=dev` 1 HIGH |
| Auditor mutations (compiled `out/`, gitignored, each restored) | RUN | theme-key check removed: ConsoleThemeRoute 3 failing. Audio consent forced to approved: AudioVaultPersistenceConsent 4 failing. Sentry scope check removed: 2 failing. Ledger-summary sealScope/partition checks removed: ReleasePipelineGate 2 failing. Console start join removed: ConsoleLifecycleService 2 failing |
| NOT RUN by the auditor | | VS Code extension-host suites (1.122.1, 1.145.2), `npm run lint`, `validate.ps1`, 8-target package, PDF, `verify-set`, installed-VSIX #475. The offered finalgate logs were inspected instead: ehost 1.122.1 6131 passing / 23 pending; 1.145.2 exit 0; installed #475 19/19 on both hosts; lint 0 errors / 136 warnings; package-all, PDF, verify-set and validate-vsix FAILED on `e99c4e1e` by design of the README marker gate, so the release packaging chain has not yet completed on any commit. Steps 4.1/4.2 (no `reviews-remediate` argument). Execution-continuity pass (not declared) |

### Audit Results

#### Security Pass (L3)
**Result**: PASS (no placeholder auth, no hardcoded secret, no bypassed check, no mock auth).
- Theme write `POST /api/v1/ui/theme` (`ConsoleThemeRoute.ts:54-70`): consoleRequestGuard (loopback socket, loopback Host, exact Origin, JSON), then a 32-byte per-process key compared in constant time over SHA-256 digests (`:35-38`), rate-limited; unsupported values refused by `isConsoleTheme` (`ConsoleThemeAuthority.ts:18-20`). `theme.js` emits only a validated list value through `JSON.stringify` (`ConsoleThemeRoute.ts:46-51`). The key travels as `fsThemeKey` and is removed with `history.replaceState` (`theme-sync.js:82-94`); the compact Monitor iframe URL carries no key, so pages VS Code did not open are read-only. The sidebar postMessage handler ignores the embedded frame and unsupported names (`FailSafeSidebarProvider.ts:209-216`).
- Audio vault: no persistence without a per-capture VS Code modal bound to the SHA-256 of an owned copy of the bytes, re-hashed after approval (`brainstorm-pending-routes.ts:18-50`); ids validated `^[0-9a-f]{64}$` before any path construction (`AudioVaultService.ts:5,193,232`; routes `:64,88`); symlink and realpath containment (`AudioVaultService.ts:30-45`); quota counts every entry and refuses links and hard links (`:63-78`); `wx` exclusive creates with mode 0600; sidecar rollback; deletion is snapshot-bound (dev, ino, mtime, ctime) and re-checked under the shared lock (`:206-228`); reads use O_NOFOLLOW plus inode match (`:236-242`). The client renders ids with textContent only (`brainstorm-audio-management.js`).
- #474 B233: governed Bicameral routes fail closed (503) on a missing or stale interceptor and 409 on a client or evaluator change across the awaited governance call (`bicameralRouteShared.ts:174-227`); auto-connect reuses the trusted-resolved, interceptor-bound client instead of constructing an ungoverned one (`bootstrapBicameral.ts:303-348`; resolution through `trustedCommandPath` at `:183`).
- #470: `/api/v1/trust` never reports a verified pass count (`ConsoleRouteRegistrar.ts:430-441`). #473 path: a corrupt active intent blocks release (`IntentStore.ts:39-54`, `ReleasePipelineGate.ts:42-56`); the ledger summary rejects contradictory or ill-shaped green reports (`LedgerIntegritySummary.ts:88-131`). #478: Link pages may change only `cursor` (`sentry-client.ts:78-93`). #471: a concurrent start joins the first; stop cancels (`ConsoleLifecycleService.ts:45-123`).
- #619: the workflows add no trigger and no new secret use; PDF steps run in the build job without secrets; publish loops are restricted to `.vsix` lines (`release.yml:180,193,233,246`); the generator escapes all CHANGELOG text and loads no external resources; the brand pins were verified by the auditor (`git hash-object` and SHA-256 equal the plan table: `8401110b...`/`74d5e8c6...`, `b2b7181b...`/`c0141a60...`).

#### OWASP Top 10 Pass
**Result**: PASS. A03: no shell or string-built commands in the delta. A04: failures are fail-closed (theme 401/400; audio 415/409/507/503; Bicameral 503/409; release gate BLOCK on an intent read error; ledger summary `unavailable`). A05: no secrets; created files 0600. A08: only `JSON.parse` of local files; no unsafe deserialization. A defense-in-depth gap is recorded as N1 (non-blocking).

#### Ghost UI Pass
**Result**: PASS. New controls are wired: the save-audio toggle gates the POST (`brainstorm-voice-wiring.js:33-35`); MANAGE SAVED AUDIO and DELETE call real routes; theme chips call `requestTheme` and are disabled with an explanation when the page lacks the key. No progress UI was added.

#### Section 4 Razor Pass
**Result**: FAIL (V1). Measured with the session razor script and compared with `v6.0.11`:
- New functions over 40 lines: `storeAudio` 52 (`brainstorm-pending-routes.ts:7-58`); `wireSavedAudioManager` 64 and inner `reload` 43 (`brainstorm-audio-management.js:3-66`, `:14-56`); `publishRelease` 41 (`release-artifacts.cjs:171-211`, #619).
- Grown past 40, or grown while already over 40: `maybeAutoConnectBicameral` 46 (`bootstrapBicameral.ts:303-348`, was within 40); `wireBicameralClient` 43 to 48 (`:218-265`); `start` 56 to `startBound` 62 (`ConsoleLifecycleService.ts:56-117`); `persistOpenHandsObservations` 62 to 67 (`openhands-import.ts:260-326`); `bicameralToolRoute` 42 to 46 (`bicameralToolRoutes.ts:60-105`); ratify handler 83 to 85 at depth 4 (`bicameralDecisionRoutes.ts:101-185`); `getHtml` 120 to 131 (`FailSafeSidebarProvider.ts:125-255`); `renderRightPanel` 71 to 77 (`brainstorm-templates.js:72-148`); `main` 59 to 61 (`release-artifacts.cjs:233-293`).
- New nesting depth 4: `captureExclusive` try/try/catch/if (`AudioVaultService.ts:96-122`); `requestTheme` try/if/if/try (`theme-sync.js:105-125`).
- Files: `FailSafeSidebarProvider.ts` 242 to 266 (crosses 250). Grown while over 250: `bootstrapBicameral.ts` 293 to 348, `openhands-import.ts` 284 to 326, `ConsoleServer.ts` 397 to 418, `release-artifacts.cjs` 254 to 299 (#619), `validate-vsix.cjs` 279 to 298, and smaller growth in `commands.ts` 702 to 710, `bootstrapServers.ts` 555 to 561, `IntentService.ts` 509 to 518, `ConsoleRouteRegistrar.ts` 583 to 588, `connection.js` 402 to 408, `roadmap.js` 507 to 511, `main.ts` 506 to 508, `brainstorm.js` 301 to 303. `AudioVaultService.ts` sits exactly at 250.
- Nested ternaries: none new in the reviewed files.

#### Self-Application Sub-Pass
`originating_remediation` = "GH #467, GH #619, v6.0.12 RC1 delta". Applying #467's discipline (complete-ledger-byte tamper evidence) to the plan's own G4 design yields V3.

#### Test Functionality Pass
**Result**: PASS for the tests the plan cites. They invoke the units and assert outputs; five auditor mutations were each caught (see Steps). `releaseWorkflow.test.cjs` asserts YAML structure and order (CI config cannot be invoked locally); noted as N6. No closed-enum taxonomy is declared.

#### Feature Test Coverage Pass
**Result**: PASS. The plan declares no `feature_inventory_touches` block; its scope table names existing behavioral test files for every group (verified to exist and pass).

#### Dependency Pass
**Result**: FAIL on the plan's acceptance evidence (V4); the dependency changes themselves are justified: glob 14.0.2 (engines 18 || 20 || >=22), body-parser 2.4.0, @hono/node-server 2.1.5, qs 6.17.1, fast-uri 3.1.9, undici 7.30.1 (dev), new transitive `@isaacs/nonrecursive-glob-match` through minimatch 11; zero added `hasInstallScript`; every added `resolved` URL is on registry.npmjs.org; setup-python pinned by SHA (`oss-sast.yml:24`).

#### Macro-Level Architecture Pass
**Result**: FAIL (V2). The theme set is hard-coded in `ConsoleThemeAuthority.ts:14`, `theme-sync.js:11`, `FailSafeSidebarProvider.ts:193` (a TypeScript template that could interpolate `CONSOLE_THEMES`), `settings.js:23ff` and `package.json:644-651`; the only test compares `theme-sync.js` with a literal (`theme-sync.test.ts:72-74`). Drift would cause refusal, not exposure, so severity is low, but the single-source-of-truth check fails (the same class as VETO #915 V5).

#### Infrastructure Alignment Pass
**Result**: FAIL (V4). Verified true: TPM 2.0 present, initialized and ready, and Microsoft Platform Crypto Provider available (`tpmtool getdeviceinformation`, `certutil -csplist`); brand pins; workflow claims; the #916 reference. Not true: "production `npm audit`" as dependency evidence (plan line 31) reports 1 HIGH. Count drift (non-blocking, N9): the plan says 44 RC1 non-test production files; `git diff --name-only v6.0.11..3d722d02` minus tests and docs gives 49 (including `.vscode-test.mjs`, `qor-conformance-probe.cjs`, HTML and CSS); the inventory attributes `package.json`, `package-lock.json`, `validate-vsix.cjs` and `validate-docs-coherence.ps1` to "#601 theme".

#### Filter-Stage Ordering Coherence
**Result**: PASS. `governToolCall` (client identity, interceptor binding, intercept, re-bind, verdict) and `storeAudio` (type, size, owned copy, consent, socket, re-hash, lock and quota, write) contain no inversion.

#### Orphan Pass
**Result**: PASS. `ConsoleThemeRoute` and `ConsoleThemeAuthority` are imported by `ConsoleServer.ts:44-45`; `consoleThemeSetting` by `bootstrapServers.ts:96`; `theme-sync.js` by `command-center.js:30`, `connection.js:4`, `roadmap.js:9`, `settings.js:10` and the SRE head; `brainstorm-audio-management.js` by `brainstorm.js:16`; `build-release-notes-pdf.cjs` by `release.yml:126-128` and `native-vsix-qualification.yml`.

### G4 design (prospective; soundness only, acceptance is the owner's)

Sound: non-exportable TPM-resident P-256 key with only the public certificate committed; manifest over the complete committed ledger blob including all prose; independent RFC 3161 witness with stored token and chain; BLOCKED (never neutral PASS) on missing, offline or expired witness; explicit no-fallback-key recovery requiring an independent PASS; honest limitations (owner-held key gives tamper evidence and time ordering, not non-forgeability against the owner; no public log; TSA trust and availability; Windows-only; no re-verification at or below #914; October VETOs untouched). Blocking gap: V3. Non-blocking design notes: N10.

### Violations Found

| ID | Category | Location | Description |
|---|---|---|---|
| V1 | razor-overage | Razor Pass (for example `brainstorm-pending-routes.ts:7-58`, `brainstorm-audio-management.js:3-66`, `bootstrapBicameral.ts:303-348`, `ConsoleLifecycleService.ts:56-117`, `AudioVaultService.ts:96-122`, `theme-sync.js:105-125`, `release-artifacts.cjs:171-211`, `FailSafeSidebarProvider.ts` 242 to 266) | New or grown functions over 40 lines or deeper than 3; files grown past or beyond 250 lines (RC1 and #619) |
| V2 | macro-architecture | `ConsoleThemeAuthority.ts:14`, `theme-sync.js:11`, `FailSafeSidebarProvider.ts:193`, `settings.js:23`, `package.json:644` | Theme set duplicated five times with no cross-source parity test |
| V3 | specification-drift | plan lines 57-86 (G4) | The verifier checks the ledger blob at the named commit and the checkpoint hash chain only; nothing requires checkpoint N's ledger bytes to be a byte-prefix extension of checkpoint N-1's. An edit, removal or reorder of earlier entries committed after checkpoint N-1 and re-signed by checkpoint N passes every listed check, contradicting the falsification bullets "an edited Verdict or Decision text" and "removed or reordered entries" (lines 73-74). `tools/g4/revocations.json` is not committed into the manifest, so deleting a revocation notice is undetectable (line 85) |
| V4 | infrastructure-mismatch | plan line 31; `FailSafe/extension/package-lock.json` (`node_modules/zod` 3.25.76) | The plan's dependency evidence "production npm audit" reports 1 HIGH (GHSA-mrhx-c7xc-m3w5, zod below 4.6.6; unchanged since v6.0.11 and used for in-product validation, including `src/mcp/FailSafeServer.ts`); neither the plan nor the v6.0.12 CHANGELOG discloses it |
| V5 | specification-drift | `CHANGELOG.md:10-38` (rendered verbatim by `build-release-notes-pdf.cjs:112`) | The v6.0.12 notes omit RC1 user-visible changes: #465 (audio is no longer saved without consent; opt-in toggle, per-recording VS Code approval, 256 MiB quota, Manage/Delete UI, no retention deadline), #470 (`/api/v1/trust` shape and the `getTrustScores` type), #471, #474 B233 (503/409 refusals), #478 (pagination refusal), the OpenHands legacy-lock refusal that requires manual lock removal, integration-catalog relabeling, and the strict release-gate intent read |

### Non-blocking findings

- N1 `brainstorm-pending-routes.ts:140-144`: the audio POST and the new DELETE use only `rejectIfRemote`, not `consoleRequestGuard` as every other mutating Console route does. Mitigated by the app-wide `consoleHostGuard` (`ConsoleRouteRegistrar.ts:161`), CORS preflight (DELETE and `audio/webm` are not simple requests) and the per-operation VS Code modal.
- N2 `AudioVaultService.ts:105-111`: a crash while holding `.capture-write.lock` makes every later save a generic 500 ("Storage failed"; the route does not map `AUDIO_VAULT_WRITE_BUSY`) and every delete a 409, with no documented recovery.
- N3 `assets/release-branding/*` (852,450 bytes) are packaged into every VSIX (`.vscodeignore` excludes `scripts/` but not these release-only inputs; observed in the finalgate win32-x64 VSIX).
- N4 Playwright `monitor-theme-inheritance.spec.ts:109` failed once in finalgate; the auditor's `--repeat-each=4` run passed 28/28. The intermittency in the #601 reconnect path is unexplained.
- N5 Auditor `test:node` 966/2: `pythonResolution.adversarial.test.cjs:291` T13(g) and its LD20 wrapper fail with `pipAvailable` false in this shell although `python -m pip` works; AdapterService is unchanged in the delta; finalgate shows 968/0. Environment-dependent, not attributed to the delta.
- N6 `releaseWorkflow.test.cjs` is a structural YAML contract test (appropriate for CI config; not runtime proof).
- N7 Preview PDF: the fixed footer overlaps body text at a page boundary (`build-release-notes-pdf.cjs:97`; `full.png`).
- N8 The 8-target package, PDF, `verify-set` and `validate-vsix --source-only` have not completed on any commit (README marker gate, by design); plan step 5 must run them on the release commit.
- N9 File-count and inventory attribution drift (see Infrastructure Alignment).
- N10 G4: "canonical JSON" is unspecified across a .NET signer and a Node verifier (signing and stamping the stored manifest bytes avoids re-canonicalization); the RFC 3161 imprint over `manifest || signature` has no length framing; truncation (deleting the newest checkpoints together with the ledger tail) is undetectable without an external append-only log and should be named explicitly in the limitations.
- N11 Lint WARNs as listed in Steps; `sg_closure_lint` not runnable from the repo root.

### Per-ground directives

#### Section 4 Razor

V1: the new and grown functions and files listed in the Razor Pass, in the RC1 delta and #619.

**Required next action:** `/qor-refactor`

#### Orphan file / Macro-arch breach

V2: a single source for the theme list, or a parity test across all five sources.

**Required next action:** `/qor-organize`

#### Plan-text

V3: the G4 design must make the verifier require byte-prefix (append-only) continuity of the ledger between consecutive checkpoints and bind the revocation list (its hash) into each manifest, with the falsification list aligned to checks that achieve it. V4: disclose or remediate the production advisory and correct the dependency evidence. V5: complete the v6.0.12 CHANGELOG for the RC1 user-visible changes before the PDF is generated.

**Required next action:** Governor: amend plan text, re-run `/qor-audit`

## Documentation Drift

<!-- qor:drift-section -->
Non-VETO advisory. These issues would hard-block at /qor-substantiate per `qor/references/doctrine-documentation-integrity.md`.

- Orphan: Orphan home: 'Vacuous pass' -> '.failsafe/governance/RESEARCH_BRIEF_qor169-alignment-2026-09-03.md' does not exist.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->
No repeated-VETO pattern detected in the last 2 sealed phases.

### Verdict Hash

SHA256(this report, LF-normalized) is recorded as the Content Hash of the META_LEDGER GATE TRIBUNAL entry for session `2026-11-09T1958-754dfc`.

---
_This verdict is binding. Gate LOCKED. No merge, tag or publication._
