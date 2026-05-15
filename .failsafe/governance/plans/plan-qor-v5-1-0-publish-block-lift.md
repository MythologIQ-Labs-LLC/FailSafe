# Plan: v5.1.0 Publish-Block Lift (consolidated v5.1.0 shipping plan)

**change_class**: feature

**doc_tier**: system

**terms_introduced**:
- term: PublishBlockLift
  home: .failsafe/governance/PUBLISH_BLOCK.md
- term: BrowserVerificationEvidence
  home: .failsafe/governance/BROWSER_VERIFICATION.md
- term: OperatorAttestation
  home: docs/release-runbook-v5-1-0.md
- term: ReleaseClassEmission
  home: docs/release-runbook-v5-1-0.md

**boundaries**:
- limitations:
  - This plan does NOT emit any release-class artifact. Version bump in `package.json`, CHANGELOG stamp from Unreleased → `[5.1.0] - YYYY-MM-DD`, annotated tag `v5.1.0`, marketplace upload (`vsce publish` / `ovsx publish`), and `git push --tags` are documented but never executed inside this plan's `/qor-implement` or `/qor-substantiate` cycle. They are operator-only post-seal.
  - Playwright pass-within-24h evidence MUST be produced by the operator in the operator's environment because the FailSafe extension under test embeds the operator's workspace state (paths, agent identity, persisted plan/audit/risk artifacts). Specs themselves are pinned in this plan; runtime evidence collection is operator-attested.
  - Screenshot evidence for FX202 / FX224 / FX225 / FX226 (Voice modal / Whisper pipeline / WebLLM engine / Live transcriber) is operator-attested because Playwright headless cannot reach those surfaces (no audio device, no WebGPU adapter, no `MediaStream` permission).
  - This plan supersedes `.failsafe/governance/plans/plan-monitor-coherence-and-browser-verification.md` for the v5.1.0 publish-readiness gate. The original plan's Phase 1 deliverables that already shipped (BROWSER_VERIFICATION.md template, `scripts/check-publish-block.cjs`, the 12 `src/test/ui/*.spec.ts` files, the `verify:publish-block` npm script, the `tools/release-commit-msg.sh` integration) are inherited and re-attested here. The original plan is formally absorbed by this plan's substantiate seal (Phase 3) — that absorption satisfies PUBLISH_BLOCK Condition 5.
- non_goals:
  - NOT v5.1.1 hotfix scope; this is the formal v5.1.0 release-readiness plan.
  - NOT scoping any new feature surface; hardens existing surfaces against the publish gate.
  - NOT a retroactive rebuild of the Playwright spec inventory; the existing 12 specs (7 BROWSER_VERIFICATION-required + 5 bonus) are the surface.
  - NOT v5.1.1+ planning; downstream releases need their own BROWSER_VERIFICATION re-signing per release cycle.
- exclusions:
  - PUBLISH_BLOCK Condition 1 (FEATURE_INDEX 0 unverified) is already SATISFIED at META_LEDGER #354 (Phase 60 plan seal). This plan re-attests but does not re-prove it.
  - PROD-Extension parallel-publish workflow (deprecated; single extension publishes via GitHub Actions per current memory) is out of scope.
  - FailSafe Pro repository remains separate-licensed (BSL-1.1) with its own governance; out of scope.
- precondition: Phase 60 v5.1.0 Remaining Publish Scope sealed at Entry #354 (2026-05-14). FEATURE_INDEX shows 433 verified / 0 unverified / 43 n/a / 476 total.

## Open Questions

1. **Operator-machine attestation cadence**: should each Playwright run-within-24h attestation require a fresh seal, or does a single `verify:publish-block` PASS cover the whole 24h window? Default proposed: single PASS covers 24h; re-seal if the operator amends BROWSER_VERIFICATION.md after the window expires.
2. **Build SHA stamping**: BROWSER_VERIFICATION.md `Build SHA` field should reference the HEAD at the time Playwright was run, not the eventual release tag. Operator must capture before running Playwright. The runbook (Phase 4) makes this explicit.
3. **Marketplace publish target**: v5.1.0 publishes to both VS Code Marketplace AND Open VSX per the `feedback_no_publish_until_full_coverage.md` HARD RULE's "any marketplace" wording. Disk reality: a single workflow `.github/workflows/release.yml` carries both publish jobs (`publish-vscode` runs `npx @vscode/vsce publish`; `publish-openvsx` runs `npx ovsx publish`). Default: keep the single-workflow shape — both jobs dispatch in the same `release.yml` cycle. The runbook documents that dispatch path.

## Scope Baseline

| PUBLISH_BLOCK Condition | State at plan start | Phase that closes it |
|---|---|---|
| 1. FEATURE_INDEX 0 unverified | ✅ SATISFIED (sealed at #354) | (re-attested in Phase 3) |
| 2. BROWSER_VERIFICATION.md Active=no + Playwright pass-within-24h | ⏸ pending | Phase 1 (spec health) + Phase 3 (operator attestation surface) |
| 3. Screenshot operator-notes + datestamps for FX202/224/225/226 | ⏸ pending | Phase 3 (operator attestation surface) |
| 4. Operator sign-off | ⏸ pending | Phase 3 (operator attestation surface) |
| 5. Substantiate seal of Monitor coherence plan | ⏸ pending | Phase 3 (absorption seal) |

Existing inherited deliverables (no re-authoring):

- `FailSafe/extension/src/test/ui/monitor.spec.ts` + 11 sibling Playwright specs
- `FailSafe/extension/playwright.config.ts`
- `FailSafe/extension/scripts/check-publish-block.cjs` + `src/test/scripts/checkPublishBlock.test.cjs`
- `.failsafe/governance/BROWSER_VERIFICATION.md` (template, currently Active=yes)
- `.failsafe/governance/PUBLISH_BLOCK.md` (already has the 5-condition lifting protocol)
- `tools/release-commit-msg.sh` (already invokes `verify:publish-block`)

## Phase 1: Playwright runtime health gate + spec-inventory attestation

### Affected Files

#### NEW: tests (TDD-Light: write red FIRST)

- `FailSafe/extension/src/test/scripts/playwrightSpecInventory.test.cjs` — NEW. Parses `FailSafe/extension/src/test/ui/` glob, asserts the seven BROWSER_VERIFICATION-required specs exist on disk (one per row in BROWSER_VERIFICATION.md). Functional: invokes a `loadRequiredSpecs(repoRoot)` helper and asserts the returned set equals the parsed required-spec set; force-rename one required spec in a temp dir → assert detection trips. Closes "if a required spec is renamed/deleted, the lift gate must catch it before operator attestation."

#### NEW: helper

- `FailSafe/extension/scripts/lib/playwright-spec-inventory.cjs` — NEW (~80L). Exports `loadRequiredSpecs(repoRoot)` (parses BROWSER_VERIFICATION.md and returns the set of spec paths it references via the `Playwright-covered pages` section), `loadDiskSpecs(repoRoot)` (globs `FailSafe/extension/src/test/ui/*.spec.ts`), and `compareInventory(required, disk)` (returns `{ missing, extra }`).

#### MODIFIED

- `FailSafe/extension/scripts/check-publish-block.cjs` — extend its Condition 2 verifier to invoke `playwright-spec-inventory.compareInventory` and FAIL when `missing.length > 0`. The existing Condition 2 check parses BROWSER_VERIFICATION.md Active flag + per-row checkbox state; this adds a structural check that the rows the operator is checking actually correspond to specs that exist.

### Changes

- Playwright specs themselves are NOT rewritten — they already exist and were authored under the prior Monitor coherence plan cycle. This phase verifies the *contract* that every Playwright-covered row in BROWSER_VERIFICATION.md maps to a real spec file.
- The check-publish-block extension is a guard for the operator: if a future refactor renames or moves a spec, the lift gate catches the drift before attestation rather than after a release-class push.
- No runtime Playwright execution is performed inside `/qor-implement`; that is operator-attested under Phase 3.

### Unit Tests

- `playwrightSpecInventory.test.cjs` invokes `loadRequiredSpecs` against a temp BROWSER_VERIFICATION fixture and asserts the returned Set equals the expected spec paths. Then renames one expected spec in a temp `src/test/ui/` and asserts `compareInventory` returns `missing=['<the renamed spec>']`. Asserts `checkPublishBlock.evaluate(tmp).ok === false` when a required spec is missing (extends existing test pattern at `checkPublishBlock.test.cjs:81-87`).

## Phase 2: BROWSER_VERIFICATION schema validator + operator runbook

### Affected Files

#### NEW: tests (TDD-Light: write red FIRST)

- `FailSafe/extension/src/test/scripts/browserVerificationSchema.test.cjs` — NEW. Asserts schema-validator helper (a) accepts a fully-populated BROWSER_VERIFICATION.md (Active=no, all 7 Playwright rows with timestamp+result=pass, all 4 screenshot rows with `Screenshot:` filename + operator note, signature line filled), (b) rejects each malformed variant (Active=yes; missing timestamp; result=fail; absent screenshot; empty signature) with a specific error code per condition.

#### NEW: helper

- `FailSafe/extension/scripts/lib/browser-verification-schema.cjs` — NEW (~120L). Exports `validate(repoRoot)` that returns `{ valid: boolean, errors: [{ condition: 2|3|4, message }] }`. Pure parser; no IO outside the file read.

#### NEW: documentation

- `docs/release-runbook-v5-1-0.md` — NEW. Linear operator runbook covering the v5.1.0 publish path end to end:
  1. Pre-flight: confirm PUBLISH_BLOCK Condition 1 (FEATURE_INDEX 0 unverified) is still SATISFIED via `node ./FailSafe/extension/scripts/feature-index-classifier.cjs --repo-root .`.
  2. Capture build SHA: `git rev-parse HEAD > /tmp/v5-1-0-build-sha.txt`.
  3. Run Playwright suite: `cd FailSafe/extension && npm run test:ui` (alias for `playwright test`).
  4. Capture per-row timestamps + results into BROWSER_VERIFICATION.md.
  5. Take screenshots for FX202 (Voice modal), FX224 (Whisper pipeline loader), FX225 (WebLLM engine), FX226 (Live transcriber) — save under `.failsafe/governance/screenshots/<surface>-YYYY-MM-DD.png`. Add operator notes per row.
  6. Run `cd FailSafe/extension && npm run verify:publish-block` until exit 0.
  7. Sign the BROWSER_VERIFICATION.md sign-off line.
  8. Flip BROWSER_VERIFICATION.md `Active: yes` → `Active: no`.
  9. Re-run `npm run verify:publish-block` to confirm transition to all-conditions-met state.
  10. Invoke `/qor-substantiate` for the v5.1.0 publish-block-lift plan (this plan); seal absorbs the Monitor coherence plan per Phase 3.
  11. After seal: flip `.failsafe/governance/PUBLISH_BLOCK.md` `Active: yes` → `Active: no` in a separate commit (Phase 3 produces this commit).
  12. Operator decides: `npm version 5.1.0`, stamp CHANGELOG `[Unreleased]` → `[5.1.0] - YYYY-MM-DD`, `git commit -am "release: v5.1.0 [RELEASE]"`, `git tag -a v5.1.0 -m "..."`, `git push origin main --tags` (Phase 4 documents this).
  13. GitHub Actions dispatches marketplace upload to VS Code Marketplace + Open VSX.

#### MODIFIED

- `FailSafe/extension/scripts/check-publish-block.cjs` — replace its inline Condition 2/3/4 parsing with a delegation to `browser-verification-schema.validate(repoRoot)`. Keeps the existing exit-code contract (`evaluate()` returns `{ ok, reason, message }`) but routes the structural checks through the new schema helper. Preserves the `checkPublishBlock.test.cjs` cases.

### Changes

- The schema helper centralizes the "what makes BROWSER_VERIFICATION.md valid" question in one place; today the rules are spread between the check-publish-block.cjs source comments, the BROWSER_VERIFICATION.md template comments, and operator memory.
- The runbook converts implicit operator knowledge into a checked sequence. Every step is operator-actionable; no step requires Qor-logic runtime.
- No runtime Playwright execution from `/qor-implement`; runbook step 3 is operator-attested.

### Unit Tests

- `browserVerificationSchema.test.cjs` invokes `validate(repoRoot)` against six temp-dir fixtures (one valid, five malformed — one per failure mode) and asserts the returned `errors[].condition` matches the expected PUBLISH_BLOCK lifting condition number (2 / 3 / 4).
- Existing `checkPublishBlock.test.cjs` cases continue to pass through the delegated schema path (regression coverage that the refactor is behavior-preserving).

## Phase 3: PUBLISH_BLOCK lift execution + Monitor coherence plan absorption seal

### Affected Files

#### NEW: tests (TDD-Light: write red FIRST)

- `FailSafe/extension/src/test/scripts/publishBlockLiftCommit.test.cjs` — NEW. Asserts a "publish-block lift" git-commit shape helper produces the exact two-line atomic change required for the lift commit: (1) `.failsafe/governance/PUBLISH_BLOCK.md` `Active: yes` → `Active: no`, (2) `docs/META_LEDGER.md` appends the Phase 3 implement entry referencing the lift transition. Invokes the helper against a temp repo (`git init` + scaffolded files) and asserts the staged diff matches the expected shape; force-stage an unrelated file → assert the helper rejects.

#### NEW: helper

- `FailSafe/extension/scripts/lib/publish-block-lift-commit.cjs` — NEW (~60L). Exports `prepareLiftCommit(repoRoot)` that (a) reads PUBLISH_BLOCK.md, (b) asserts current Active=yes (no-op if already no), (c) reads BROWSER_VERIFICATION.md, (d) asserts the schema validator passes (calls `browser-verification-schema.validate`), (e) returns a structured object: `{ filesToEdit: { 'PUBLISH_BLOCK.md': { from: 'Active: yes', to: 'Active: no' } }, ledgerEntryDraft: <markdown string> }`. The caller (operator or `/qor-implement`) performs the edits + git stage.

#### MODIFIED

- `.failsafe/governance/PUBLISH_BLOCK.md` — Active=yes → Active=no, with a new top-section "Lifted on: YYYY-MM-DD; Lift reference: META_LEDGER #<entry>; All five conditions satisfied" recorded inline. This is the actual lift, performed at `/qor-implement` time by the operator after attestation (Phase 2 runbook step 11).
- `docs/META_LEDGER.md` — append two entries: (a) Phase 3 IMPLEMENT entry referencing the lift commit, (b) Phase 3 substantiation will append a SESSION SEAL that ALSO serves as the Monitor coherence plan's absorbed seal (Condition 5). The substantiate entry's body explicitly names the absorbed plan path and lists which deliverables from that plan are inherited.
- `docs/SYSTEM_STATE.md` — Phase 3 section recording the lift event + the Monitor coherence plan's absorption.

### Changes

- The lift commit is the atomic transition point. Per `feedback_no_ship_without_approval.md`, the operator authorizes this commit explicitly; `/qor-implement` proposes the diff via `prepareLiftCommit` but does NOT execute the edit + stage without operator approval.
- Monitor coherence plan absorption: this plan's substantiate entry explicitly declares "absorbs `.failsafe/governance/plans/plan-monitor-coherence-and-browser-verification.md`" and lists the inherited deliverables. After absorption, the original plan file is moved to `.failsafe/archive/plans/` with a top-line redirect note pointing to this plan's seal entry.
- No version bump or tag occurs in this phase. Phase 4 covers the post-lift release-class emission (documentation).

### Unit Tests

- `publishBlockLiftCommit.test.cjs` invokes `prepareLiftCommit(repoRoot)` against three temp-repo fixtures: (i) all-conditions-met → returns the structured edit object with the expected `from`/`to` shape; (ii) PUBLISH_BLOCK already inactive → returns `null` (idempotent no-op); (iii) BROWSER_VERIFICATION fails schema → throws with the failing condition number.

## Phase 4: v5.1.0 release-class emission documentation

### Affected Files

#### NEW: tests (TDD-Light: write red FIRST)

- `FailSafe/extension/src/test/scripts/releaseRunbookIntegrity.test.cjs` — NEW. Asserts `docs/release-runbook-v5-1-0.md` (a) exists, (b) contains the 13 numbered runbook steps from Phase 2, (c) every command shown in a runbook step is valid shell syntax (parsed via a lightweight tokenizer; no `eval`), (d) every npm script referenced (`test:ui`, `verify:publish-block`, etc.) exists in `FailSafe/extension/package.json`, (e) every file path referenced exists in the repo OR is declared as "operator creates" (screenshots etc.).

#### MODIFIED

- `docs/release-runbook-v5-1-0.md` (created in Phase 2; refined in Phase 4) — adds the explicit release-class commit section:
  - `npm version 5.1.0 --no-git-tag-version` in `FailSafe/extension/` (bumps `package.json`).
  - Stamp `CHANGELOG.md` Unreleased → `[5.1.0] - YYYY-MM-DD` (operator edit; no auto-stamp because Steps 7.5/7.6/9.5.5 are SKIPPED inside the substantiate cycle per the no-publish HARD RULE).
  - `git add FailSafe/extension/package.json CHANGELOG.md docs/META_LEDGER.md` + commit with `[RELEASE]` marker.
  - `git tag -a v5.1.0 -m "FailSafe v5.1.0 — Monitor coherence + browser verification + 100% feature coverage"`.
  - `git push origin main` (release-commit-msg.sh hook will invoke `verify:publish-block`; should PASS post-lift).
  - `git push origin v5.1.0` (separate push for the tag to trigger marketplace workflow).
  - Marketplace dispatch: GitHub Actions `.github/workflows/release.yml` — `publish-vscode` job (runs `npx @vscode/vsce publish --packagePath "mythologiq-failsafe-${VSIX_VERSION}.vsix"`) and `publish-openvsx` job (runs `npx ovsx publish "mythologiq-failsafe-${VSIX_VERSION}.vsix"`). Single workflow, two jobs; both fire from the same tag push.

### Changes

- The release-class emission section is documentation only. No code runs from `/qor-implement` for Phase 4. The phase's value is producing a checked, complete runbook the operator can follow without ad-hoc decisions.
- The runbook integrity test pins the runbook's structure against the actual repo state so a future stale runbook can't drift undetected.

### Unit Tests

- `releaseRunbookIntegrity.test.cjs` asserts every npm script referenced in the runbook exists in `package.json`, every file path referenced exists in the repo (or is in the declared-operator-creates allowlist), and every shell command shown parses with the lightweight tokenizer. Functional: removes one referenced npm script from a temp `package.json` and asserts the test trips.

## CI Commands

- `cd FailSafe/extension; npm run compile` — TypeScript compilation.
- `cd FailSafe/extension; npm test -- --runInBand` — extension test suite (deterministic serial; includes the 4 new node-test cjs suites authored by Phase 1-4).
- `cd FailSafe/extension; node --test src/test/scripts/playwrightSpecInventory.test.cjs src/test/scripts/browserVerificationSchema.test.cjs src/test/scripts/publishBlockLiftCommit.test.cjs src/test/scripts/releaseRunbookIntegrity.test.cjs` — Phase 1-4 new test suites in isolation.
- `cd FailSafe/extension; npm run verify:publish-block` — end-to-end PUBLISH_BLOCK lifting protocol check (used both inside Phase 3's `prepareLiftCommit` and by operator at runbook step 6).
- `cd FailSafe/extension; npm run test:ui` — Playwright suite (operator-run during Phase 3 attestation; NOT run inside `/qor-implement`).
- `node FailSafe/extension/scripts/check-governance-canaries.cjs --repo-root .` — governance markdown canary scan (per the prompt-injection audit pass).

## Review-Boundary attestation

This plan honors the Review Boundary at every phase. Specifically:

- `/qor-implement` for Phase 3 PROPOSES the lift commit (via `prepareLiftCommit`) but does NOT execute `git add` / `git commit` for the PUBLISH_BLOCK.md edit without explicit operator approval.
- `/qor-substantiate` for this plan SKIPS Steps 7.4 / 7.5 / 7.6 / 9.5.5 (SSDF emission + version bump + CHANGELOG stamp + annotated tag). Those operations belong to Phase 4 (documentation) and the operator's post-seal release commit.
- Marketplace publish (`vsce publish` / `ovsx publish` / GitHub Actions dispatch) happens outside this plan's lifecycle entirely — operator-only, post-tag, post-push.
- `feedback_no_ship_without_approval.md` HARD RULE applies throughout: no push, no PR, no merge, no tag, no build commands without explicit per-action operator approval, even when this plan's phase definitions enumerate them as the documented next step.
