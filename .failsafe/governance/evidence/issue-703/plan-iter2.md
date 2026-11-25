# Plan: Delivery review form, refresh and result attribution races, and FX589 Bicameral readiness (#703, PR #706)

**change_class**: hotfix
**doc_tier**: standard
**terms**: none
**iteration**: 2
**Risk Grade**: L2
**Baseline**: c38f970d045bb0fddad53bcd5436f4c642690f23 (PR #706 head, branch `fix/703-delivery-review-note-refresh-race`), merge base b03e47b75a1e0c5f486e3b0a3051005e8719dd55 (origin/main, includes merged #712)
**originating_remediation**: FailSafe #703 (two Playwright UI tests flake under full-suite load; the Delivery one exposed real note-loss and stale-repaint defects)

**boundaries**:
- limitations: the review form is kept in memory on the renderer: one form (picked commit and rework picks) and one unsent note, each tagged with its intent (and the note with its commit), so typing on intent B or picking on intent B replaces A's unsent note or form, and a window reload drops both; the in-flight review guard is per renderer, so while a review POST for intent A is pending PASS and VETO are disabled on every intent; a completion message for intent A stays held until A is painted again or another operation replaces it; the UI guard does not replace the server review lock (FX1010); link and unlink keep their pre-existing behaviour of not catching a network rejection (only their messages become intent-scoped); FX589 remains a stub-client Playwright journey (its 250 ms connect delay exercises the readiness wait but does not by itself detect a regression of it) and says nothing about a live Bicameral daemon; jsdom tests check structure and ordering, not the visual surface
- non_goals: server-side review semantics, payloads or authorization (`DeliveryRoute.ts`, `deliveryReview.ts` untouched); persistence of drafts across reloads; per-intent storage of more than one form or note; any version bump, tag or release
- exclusions: protected workflows under `.github/workflows/**`; two pre-existing file-length findings that this plan reduces but does not remove: `delivery-assessment-renderer.js` (482 lines by `wc -l` at origin/main, 433 after this plan) and `delivery-assessment-renderer.test.ts` (380 at origin/main, 296 after this plan), both over 250; the pre-existing nested ternaries in the renderer (2, unchanged). Mocha `suite()` registration callbacks are containers of test registrations, measured but exempt from the 40-line function limit (precedent: Entry #940 N-note on a suite callback); the existing suite's callback is 266 lines at origin/main and 274 after this plan, the +8 lines coming only from replacing seven fixed sleeps with deterministic waits. Every function and test body this plan adds or changes is at most 40 lines with nesting at most 3; every new file is under 250 lines

## Iteration history

Iteration 1 (sha256 80bd7180578e38f8a72b7d7dd1877513b604e6816400a44013647164cdeed9d9, preserved at `.failsafe/governance/evidence/issue-703/plan-iter1.md`) received an independent VETO, Entry #976, report `.failsafe/governance/evidence/issue-703/AUDIT-PLAN-iter1.md`. That VETO stands. Iteration 2 answers it:

- **V1** (a repaint loses the picked older commit, its note and the rework picks): root cause (debug, layer 1): the form's selection lived only in the DOM, and every repaint rebuilt `reviewControls` from defaults (newest commit, rework "none"), so the note restored only for the newest commit. Fix: a `reviewForm` value `{ intentId, commitSha, reworks }` on the renderer, written on every commit or rework `change` and read when the controls are rebuilt (LD10). Residual sweep (layer 4): the only other operator input in the panel is the Link architecture / Link commit pickers, which are rebuilt after a link anyway and post on click; they are not review input and stay as they are (disclosed nowhere as surviving a repaint). New tests: older commit, note and rework survive a repaint and are posted; a note belongs to its commit; note and pick belong to their intent (with a second linkable intent).
- **V2** (M3 survives; checks 222, 231, 239 survive alone): the check after the candidates GET (baseline 231) was redundant with the check before paint (239) and is deleted. The remaining four are each made load-bearing by a test that observes what the obsolete refresh does next: a stale listing must fetch nothing further, a stale detail must not fetch candidates, a stale failure must not paint an error, a stale candidates response must not repaint. Each deletion is a recorded mutant (K3-K6) that fails its test.
- **V3** (draft scoping, restore on commit change and link message scoping untested): tests for each, plus a refused (HTTP 409) review and link case; mutants K8, K9, K9b, K10, K10b, K15, K16 recorded.
- **V4** (both files grow past the limit; suite callback not measured): the review controls move to a new module and the test fixture to a shared file, so both pre-existing files shrink below their origin/main length and every new file is under 250 lines; the suite-callback exemption is stated with the measured numbers above.
- **Notes**: N2 (LD precision) corrected in LD3, LD4, LD7; N3 (the 20 ms and 50 ms sleeps, same flake class as #703) adopted: all seven sleeps in the file are replaced by deterministic waits; N4 disclosed in limitations; N5 disclosed; N6 adopted (the unreachable `!this.message[2]` branch is removed); N7 answered by the second-linkable-intent fixture; N8 left (pre-existing, excluded); N9 corrected in Baseline. Conditions C1-C3 are adopted as D4 (C1 mutant table, C2 assertion inventory, C3 counts at the final head).

## Authority and scope

This is the native plan for the whole of PR #706: every change in `origin/main...c38f970d` (3 files, +378/-22) plus the Phase 2 repair. Owner instruction for this session (2026-11-24): qualify #706 at the exact head, fix any defect found on the existing branch, do not open a new PR. The acceptance handoff posted to #706 on 2026-11-24 defines the remaining gates (native plan, adversarial audit, unskipped local validation, installed Windows VSIX Delivery review, substantiation, owner GO). CI results on #706 are engineering evidence only, not native acceptance.

The Phase 2 candidate was prototyped in a scratch worktree before this plan was written (research, not implementation); its full diff against c38f970d is `.failsafe/governance/evidence/issue-703/candidate-iter2.patch`, sha256 6dfac518c6226ad2677e6edc41668f1bd44bc54da972c689ca7e69609559d0ed, with the mutation, assertion-inventory, Razor and runner scripts beside it. Implementation applies that patch, plus any change an audit requires, as one commit on the #706 branch.

## Open Questions

None.

## Locked decisions and evidence

- **LD1 (baseline blobs)**: `git rev-parse c38f970d:FailSafe/extension/src/roadmap/ui/modules/delivery-assessment-renderer.js` -> `a455ab1dc1a1e78b17f8a64beb23708e9919c8c7`; `...:FailSafe/extension/src/test/roadmap/delivery-assessment-renderer.test.ts` -> `3f8df229412194b3f6f15dcd4a780b70d57ac8fe`; `...:FailSafe/extension/src/test/ui/bicameral-advanced-tools.spec.ts` -> `c1c6135b3c28b383fd075e66e157130c780e999e`. `git rev-list --left-right --count origin/main...c38f970d` -> `0	19`. Implementation refuses to continue if HEAD or a blob differs, or the patch sha256 differs.
- **LD2 (refresh generation guard)**: `git show c38f970d:FailSafe/extension/src/roadmap/ui/modules/delivery-assessment-renderer.js | grep -n "refreshGeneration"` -> `195:    this.refreshGeneration = 0;`, `217:    const generation = ++this.refreshGeneration;`, `222`, `229`, `231`, `234`, `239` (each `if (generation !== this.refreshGeneration) return;`). After Phase 2 the checks are after the listing GET, after the detail GET, first in the catch, and before paint (candidate lines 212, 219, 223, 228); 231 is removed (V2).
- **LD3 (single in-flight review)**: same file, `grep -n "reviewInFlight"` -> `194`, `402` (`if (this.reviewInFlight) return;`), `403` (`= true`), `410`, `411` (new buttons created disabled while in flight), `457` (`= false` in `review()`'s `finally`, before the refresh). Phase 2 moves 402-411 into `delivery-review-controls.js` `reviewButtons` unchanged in logic (`this` becomes the `renderer` parameter).
- **LD4 (note draft lifetime)**: same file, `grep -n "reviewNoteDraft"` -> `193` (init), `386` (read in `restoreDraft`), `391` (the `input` listener writes `{ intentId, commitSha, value }`), `444` (captured before the POST), `447` (identity check), `449` (`= null`). The draft is cleared only on HTTP 200 when the current draft is the identical object captured before the POST with the same intent, commit and text; any keystroke during the POST creates a new object, so a newer draft survives.
- **LD5 (intent-scoped completion)**: same file, `grep -n "this.message\[2\]"` -> `254:    if (this.message && (!this.message[2] || this.message[2] === state.view?.intent?.id)) {`. Every message setter (review 200, review non-200, review rejection, link/unlink 200 and non-200) passes the originating intent id as element 2, so `!this.message[2]` is unreachable (N6); Phase 2 makes the condition `this.message && this.message[2] === state.view?.intent?.id`.
- **LD6 (FX589 readiness)**: `git show c38f970d:FailSafe/extension/src/test/ui/bicameral-advanced-tools.spec.ts | grep -n "waitForState"` -> `53` (definition, polls `GET /api/integrations/bicameral/status` `.state`, 15 s), `75` (`configured-not-running`), `87` (`running`, after the connect click). The stub delays `connect()` 250 ms. Dropping the explicit `{ timeout: 5000 }` is behaviour-neutral: `git show c38f970d:FailSafe/extension/playwright.config.ts | grep -n "expect: {"` -> `42:  expect: { timeout: 5000 },`.
- **LD7 (Razor)**: function lengths are inclusive line counts from the TypeScript AST (`razor703.cjs` in the evidence folder); file lengths are `wc -l`. At c38f970d `reviewControls` 51 (35 at origin/main), `refresh` 28, `review` 19, `paint` 28; test bodies at baseline lines 353 (42), 398 (47), 447 (45). With the candidate: renderer 433 lines, nesting max 3, no function over 40; `delivery-review-controls.js` 113, nesting 1; `delivery-dom.js` 15; `deliveryRendererFixture.ts` 194, nesting 2; `delivery-assessment-renderer.test.ts` 296; `.refresh.test.ts` 141; `.review.test.ts` 176; no function or test body over 40; only the three `suite()` callbacks exceed 40 (274, 115, 148).
- **LD8 (discovery and module loading)**: `src/test/roadmap/*.test.ts` files are discovered by `out/test/!(extension-arch)/**/*.test.js` (`grep -n "out/test/" FailSafe/extension/src/test/vscodeTestConfigs.cjs` -> `21:    files: Object.freeze(['out/test/*.test.js', 'out/test/!(extension-arch)/**/*.test.js']),`); a non-`.test` fixture module is not a test (precedent `src/test/shared/governedCommitApprovalFixture.ts`). UI modules import siblings by relative ESM path (`grep -n "^import" FailSafe/extension/src/roadmap/ui/modules/adapter-panel.js` -> `4:import { escHtml } from './skill-utils.js';`), and `scripts/copy-ui-js.cjs` mirrors every `.js` under `src/` to `out/` (`for (const src of walk(SRC))`), so the two new modules need no registration.
- **LD9 (server lock is the authority)**: FEATURE_INDEX FX1010 (docs/FEATURE_INDEX.md:753) limitations: "the review lock is per window (fails closed)". The UI guard prevents the contradictory second request from being sent; it is not the authority.
- **LD10 (review form value)**: `renderer.reviewForm` is `null` or `{ intentId, commitSha, reworks: { [vetoEntryId]: commitSha | '' } }`, replaced (never mutated) on each `change` of the commit pick or a rework pick. On rebuild for intent I: if `reviewForm.intentId === I` and its `commitSha` is still linked, that commit is selected, else the newest; each rework option is selected when its value equals the kept pick for that VETO id, else "none". The note draft stays a separate value (LD4) so its identity semantics are unchanged.

## Phase 1: the #706 source as committed (no edits)

### Affected Files

- `FailSafe/extension/src/test/roadmap/delivery-assessment-renderer.test.ts` - eight #703 jsdom test definitions giving ten cases
- `FailSafe/extension/src/test/ui/bicameral-advanced-tools.spec.ts` - delayed stub connect and the `running` status wait
- `FailSafe/extension/src/roadmap/ui/modules/delivery-assessment-renderer.js` - LD2-LD5

### Changes

None beyond c38f970d. This phase binds the plan to the committed bytes (LD1).

### Unit Tests

As committed; Phase 2 moves them (see the inventory in D4).

## Phase 2: review form across repaints, load-bearing guards, and the Razor split (one commit on the #706 branch)

### Affected Files

- `FailSafe/extension/src/test/roadmap/deliveryRendererFixture.ts` - NEW: the shared fixture moved out of the test file (constants, `view`, `INTENTS`, candidates, `setupDom`), mutable state as `fx` with `resetFixture()`, two fixture options (`extraLinked` commits, `secondLinkable`), and the waits `fire`, `holdPosts(url, 'none' | 'network' | 'http')` (holds the first matching POST), `holdFirstGet(url, failWith?)` and `settled(obj, method)` (the n-th returned promise resolves when the n-th call has settled)
- `FailSafe/extension/src/test/roadmap/delivery-assessment-renderer.refresh.test.ts` - NEW: stale listing, stale detail, delayed candidates, old failed GET; late review success, network failure and HTTP refusal, and late link success and HTTP refusal, each not shown on another intent, shown once on its own, not replayed
- `FailSafe/extension/src/test/roadmap/delivery-assessment-renderer.review.test.ts` - NEW: typed note survives a repaint; older commit, note and rework survive a repaint and are posted; a note belongs to its commit; note and pick belong to their intent; later same-text and different-text edits survive a prior POST; PASS and VETO cannot both submit; a rejected POST re-enables review and the retry posts
- `FailSafe/extension/src/test/roadmap/delivery-assessment-renderer.test.ts` - keeps the fifteen pre-#703 cases, imports the fixture, replaces its seven fixed sleeps with `settled(...)` waits
- `FailSafe/extension/src/roadmap/ui/modules/delivery-dom.js` - NEW: `el`, `button` moved unchanged from the renderer and exported
- `FailSafe/extension/src/roadmap/ui/modules/delivery-review-controls.js` - NEW: `reviewControls(renderer, view)` with private `commitPick`, `noteInput`, `reworkPicks` (moved from the renderer), `reviewButtons`, and the LD10 form
- `FailSafe/extension/src/roadmap/ui/modules/delivery-assessment-renderer.js` - imports the two modules; `this.reviewForm = null`; removes the redundant generation check (V2) and the unreachable `!this.message[2]` branch (N6); `stepCard` calls `reviewControls(this, view)`; the `reviewControls` and `reworkPicks` methods are removed. Callers: `grep -rn "reviewControls\|reworkPicks" FailSafe/extension/src` at c38f970d -> only the renderer itself (lines 360, 365, 396-398, 421) and one comment at test line 235; no test calls either

### Changes

The candidate patch (Authority and scope), applied byte-for-byte after the LD1 checks.

### Unit Tests

- `delivery-assessment-renderer.review.test.ts` "an older picked commit, its note and the rework pick survive a repaint and are posted": with two linked commits and a trusted VETO on the newer, pick the older, type a note, pick it as rework, refresh; the pick, note and rework are unchanged and PASS posts all three. Fails on the c38f970d renderer (red-first).
- "a note belongs to its commit": a note typed on the newest commit is hidden on the older and restored on return.
- "a note and commit pick belong to their intent": with a second linkable intent, a note typed on the shared newest commit is not shown on the other intent and is shown again on return; a pick of the older commit on the first intent leaves the other intent at the newest.
- `delivery-assessment-renderer.refresh.test.ts` stale listing / stale detail: the fetches after release are exactly the held request, so the obsolete refresh stops at its first stale response.
- every other case as listed under Affected Files; each names the DOM or request outcome it asserts.

## Definition of Done

### Deliverable: Delivery review UI race fixes

- **D1**: the operator's review form (picked commit, rework picks, unsent note) survives any repaint on the same intent; an older async GET or POST completion never changes the selected intent, replaces a newer view, keeps fetching, erases a newer draft, or reports its result under another intent; PASS and VETO cannot both be submitted from one pending review; a failed review can be retried.
- **D2**: as listed in Phase 2 Affected Files; no change to request URLs or bodies; every added or changed function and test body at most 40 lines with nesting at most 3; renderer at most 433 lines and the old test file at most 296 (`wc -l`).
- **D3**: ledger entries for this plan's audit, implementation and seal under session `2026-11-24T1904-4e594e`; evidence under `.failsafe/governance/evidence/issue-703/`; GOVERNANCE_INDEX Last Reviewed refreshed at seal; FEATURE_INDEX FX1010 test-file list gains the two new suites and FX589 is unchanged.
- **D4**: at the final head: (C1) the mutation table - K1 in-flight guard, K2 message scoping, K3-K6 each generation check, K7 unconditional draft clear, K8 restore on commit change, K9 and K9b draft intent and commit scoping, K10 and K10b link success and failure scoping, K11 picked commit restore, K12 rework restore, K13 form intent scoping, K14 in-flight reset, K15 and K16 review HTTP and network failure scoping - each KILLED by a named test; (C2) the assertion inventory: every one of the 106 baseline assertions appears verbatim in the new files except four recorded one-to-one renames onto the helpers (`finishPost` -> `hold.held()`; the cross-intent message names "operation" instead of "review" because the case is shared with link; the parameterised expected text becomes `c.expected`; the retry case's rejection text becomes the helper's `late network failure`), and every baseline test name is present except the parameterised cross-intent name, replaced by `a ${c.name} ...`; (C3) `npm test` and `npm run test:ui` counts recorded with no skip flags; red-first: the new suites fail exactly one case on the c38f970d renderer and all seventeen #703 cases on the origin/main renderer; installed Windows VSIX Delivery review observation per the #706 handoff recorded with VS Code, Electron and Node versions.

### Deliverable: FX589 readiness wait

- **D1**: the Advanced-tools Playwright journey waits for the server's `running` state rather than elapsed time.
- **D2**: `waitForState(page, url, state)` and `makeStubClient({ connectDelayMs })` in `FailSafe/extension/src/test/ui/bicameral-advanced-tools.spec.ts`.
- **D3**: no ledger surface beyond the session records.
- **D4**: `npm run test:ui` passes the FX589 case with the 250 ms delayed connect.

## CI Commands

- `npm ci` (in `FailSafe/extension`) - lockfile install
- `npm run compile` - TypeScript and UI copy
- `npm run lint` - ESLint
- `npm run test:node` - node tests
- `npm run test:ui` - Playwright including FX589 and workspace-delivery
- `npm test` - extension-host suites including the jsdom renderer suites
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/reliability/prepush-validate.ps1` (no skip flags) - the repository pre-push gate
- `npm run build:package` - VSIX for the installed-host check
