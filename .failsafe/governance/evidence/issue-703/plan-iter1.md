# Plan: Delivery review note, refresh and result attribution races, and FX589 Bicameral readiness (#703, PR #706)

**change_class**: hotfix
**doc_tier**: standard
**terms**: none
**iteration**: 1
**Risk Grade**: L2
**Baseline**: c38f970d045bb0fddad53bcd5436f4c642690f23 (PR #706 head), merge base b03e47b75a1e0c5f486e3b0a3051005e8719dd55 (origin/main, includes merged #712)
**originating_remediation**: FailSafe #703 (two Playwright UI tests flake under full-suite load; the Delivery one exposed a real note-loss and stale-repaint defect)

**boundaries**:
- limitations: the review note draft is one private, in-memory slot for the whole renderer (typing on intent B replaces an unsent draft on intent A; a window reload drops it); the in-flight review guard is per renderer, so while a POST for intent A is pending PASS and VETO are disabled on every intent; a completion message for intent A stays held until A is painted again or another operation replaces it; the guard is UI-side only and does not replace the server-side single-writer review lock (FX1010); FX589 remains a stub-client Playwright journey and says nothing about a live Bicameral daemon; jsdom tests check structure and ordering, not the visual surface
- non_goals: server-side review semantics, payloads or authorization (`DeliveryRoute.ts`, `deliveryReview.ts` are untouched); the link and unlink POST error handling (`post()` keeps its pre-existing behaviour except for intent-scoped messages); persistence of drafts across reloads; any version bump, tag or release
- exclusions: protected workflows under `.github/workflows/**`; the pre-existing file-length findings at origin/main (`delivery-assessment-renderer.js` 482 lines, `delivery-assessment-renderer.test.ts` 380 lines, both over the 250-line Razor). This plan does not split those files; it requires every function and test body it adds or changes to meet the 40-line and nesting-3 limits

## Authority and scope

This is the native plan for the whole of PR #706: every change in `origin/main...c38f970d` (3 files, +378/-22) plus the Phase 2 behaviour-preserving Razor repair this plan adds. Owner instruction for this session (2026-11-24): qualify #706 at the exact head, fix any defect found on the existing branch, do not open a new PR. The acceptance handoff posted to #706 on 2026-11-24 defines the remaining gates (native plan, adversarial audit, unskipped local validation, installed Windows VSIX Delivery review, substantiation, owner GO). CI results on #706 are engineering evidence only, not native acceptance.

## Open Questions

None.

## Locked decisions and evidence

- **LD1 (baseline blobs)**: `git rev-parse c38f970d:FailSafe/extension/src/roadmap/ui/modules/delivery-assessment-renderer.js` -> `a455ab1dc1a1e78b17f8a64beb23708e9919c8c7`; `...:FailSafe/extension/src/test/roadmap/delivery-assessment-renderer.test.ts` -> `3f8df229412194b3f6f15dcd4a780b70d57ac8fe`; `...:FailSafe/extension/src/test/ui/bicameral-advanced-tools.spec.ts` -> `c1c6135b3c28b383fd075e66e157130c780e999e`. `git rev-list --left-right --count origin/main...c38f970d` -> `0	19` (zero behind).
- **LD2 (refresh generation guard)**: `git show c38f970d:FailSafe/extension/src/roadmap/ui/modules/delivery-assessment-renderer.js | grep -n "refreshGeneration"` -> `195:    this.refreshGeneration = 0;`, `217:    const generation = ++this.refreshGeneration;`, and the stale-return checks at `222`, `229`, `231`, `234` (catch) and `239` (before paint). Every await in `refresh()` is followed by a generation check before any state change or paint.
- **LD3 (single in-flight review)**: same file, `grep -n "reviewInFlight"` -> `194: this.reviewInFlight = false;`, `403: this.reviewInFlight = true;` (inside `record`, after an early return when already in flight), `457: this.reviewInFlight = false;` (in `review()`'s `finally`, before the refresh). New buttons painted while in flight are created disabled.
- **LD4 (draft lifetime)**: same file, `grep -n "reviewNoteDraft"` -> `193` (init), the `input` listener storing `{ intentId, commitSha, value }`, and `449: this.reviewNoteDraft = null;`, reached only when the POST returned 200 and the current draft is the identical object captured before the POST with the same intent, commit and text. Any keystroke during the POST creates a new object, so a newer draft survives.
- **LD5 (intent-scoped completion)**: same file, `grep -n "this.message\[2\]"` -> `254:    if (this.message && (!this.message[2] || this.message[2] === state.view?.intent?.id)) {`. `review()` (success, HTTP failure and thrown failure) and `post()` (link/unlink) set the originating intent id as element 2; the message is consumed only when painted on that intent.
- **LD6 (FX589 readiness)**: `git show c38f970d:FailSafe/extension/src/test/ui/bicameral-advanced-tools.spec.ts | grep -n "waitForState"` -> the helper polls `GET /api/integrations/bicameral/status` `.state` with a 15 s budget, called for `configured-not-running` before navigation and for `running` after the connect click. The stub delays `connect()` by 250 ms so the readiness wait is exercised. Removing the explicit `{ timeout: 5000 }` arguments is behaviour-neutral: `git show c38f970d:FailSafe/extension/playwright.config.ts | grep -n "expect: {"` -> `42:  expect: { timeout: 5000 },`.
- **LD7 (Razor at the baseline)**: limits 250 file lines, 40 function lines, nesting 3. Measured at c38f970d: `reviewControls` 51 lines (35 at origin/main), so #706 introduces a breach; `refresh` 27, `review` 20, `paint` 29. In the test file the bodies at baseline lines 353 (the parameterised later-edit test, 42 lines), 398 (the parameterised cross-intent result test, 47 lines) and 447 (PASS/VETO overlap, 45 lines) exceed 40; the five other added tests are 29-36 lines. Every added test repeats the same review-POST gate and `renderer.review` completion wrapper.
- **LD8 (test discovery)**: `src/test/roadmap/delivery-assessment-renderer.test.ts` is already discovered (FX1010 lists it, jsdom); `src/test/ui/*.spec.ts` runs under `npm run test:ui`. No registration change.
- **LD9 (sibling of the server lock)**: the server already refuses concurrent review writes per window (FX1010 limitations: "the review lock is per window (fails closed)"). The UI guard prevents the contradictory second request from being sent; it is not the authority.

## Phase 1: the #706 source as committed (no edits)

### Affected Files

- `FailSafe/extension/src/test/roadmap/delivery-assessment-renderer.test.ts` - eight #703 jsdom test definitions giving ten cases (two definitions are parameterised to two cases each)
- `FailSafe/extension/src/test/ui/bicameral-advanced-tools.spec.ts` - delayed stub connect and the `running` status wait
- `FailSafe/extension/src/roadmap/ui/modules/delivery-assessment-renderer.js` - LD2-LD5

### Changes

None beyond c38f970d. This phase binds the plan to the exact committed bytes (LD1) and records what they must do.

### Unit Tests

- typed note survives a repaint, posts once, and is cleared after a 200 (behaviour: the new input after refresh holds the old text; one POST body with that note; empty after success)
- a stale detail response, a delayed candidates response, and an old failed listing GET cannot repaint or reset a newer selection (behaviour: picker value, panel identity and absence of an error after the old promise resolves)
- a later same-text or different-text edit during a pending POST survives its completion (behaviour: the note after completion equals the later edit)
- a successful or failed delayed POST does not show its result on another intent, shows it once on its own intent, and does not replay (behaviour: `.cc-dlv-result` absent on SEALED, exactly one on ACTIVE, absent after a further refresh)
- PASS and VETO cannot both submit across an overlapping repaint (behaviour: repainted VETO disabled; a dispatched click on it posts nothing; exactly one PASS POST; controls re-enabled after completion)
- a rejected network POST re-enables review (behaviour: failure message shown; VETO enabled; the retry posts VETO)
- FX589: connect, wait for `running`, expand Advanced tools, invoke `dashboard`, result contains `"features": 3` and `"decisions": 12`

## Phase 2: behaviour-preserving Razor repair (one commit on the #706 branch)

### Affected Files

- `FailSafe/extension/src/test/roadmap/delivery-assessment-renderer.test.ts` - two file-local helpers replace the repeated scaffolding; no assertion is removed, weakened or reordered
- `FailSafe/extension/src/roadmap/ui/modules/delivery-assessment-renderer.js` - `reviewControls` split into three private methods

### Changes

Test helpers (file-local, placed after `setupDom`):

- `holdReviewPosts(fail = false): { release: () => void; held: () => boolean }` - wraps the current `global.fetch` so every `POST /api/actions/delivery/review` awaits one gate until `release()`, then throws `Error('late network failure')` when `fail`; other requests pass through. `held()` reports that a review POST reached the gate. `setupDom().cleanup` already restores the pre-test `fetch`.
- `observeReviews(renderer): () => Promise<void>` - wraps `renderer.review` once; the n-th call of the returned function resolves when the n-th `review()` settles (resolved immediately if it already has), independent of whether it is called before or after the click.

The tests at baseline lines 219, 353, 398, 447 and 493 use these helpers; 493 keeps its own reject-once `fetch` (its semantics differ) and uses `observeReviews`. Every assertion and its message string is kept byte-identical.

Renderer: `reviewControls(view)` keeps its signature, its early return and its DOM order (select, note, rework picks, PASS, VETO) and delegates to:

- `reviewCommitPick(linked)` -> the commit `<select>` (newest selected), unchanged code moved
- `reviewNote(view, select)` -> the note `<input>` with draft restore, the `input` listener and the `select` `change` listener, unchanged code moved
- `reviewButtons(view, select, note, reworksOf)` -> `[pass, veto]` with the in-flight `record` closure and the disabled state, unchanged code moved; `record` still calls `this.review(...)` so test overrides of `renderer.review` keep working

### Unit Tests

- `FailSafe/extension/src/test/roadmap/delivery-assessment-renderer.test.ts` - all Phase 1 cases pass unchanged in behaviour. Mutation evidence recorded in the implementation report, run against the Phase 2 tree in a scratch copy and restored: (M1) remove the `if (this.reviewInFlight) return;` early return and the disabled assignment -> the PASS/VETO overlap test fails; (M2) replace the LD5 condition with `if (this.message)` -> both cross-intent result cases fail; (M3) delete the generation check after the detail GET -> the stale-detail test fails; (M4) clear `reviewNoteDraft` unconditionally on 200 -> both later-edit cases fail.

## Definition of Done

### Deliverable: Delivery review UI race fixes

- **D1**: an operator's unsent review note survives any repaint; an older async GET or POST completion never changes the selected intent, replaces a newer view, erases a newer draft, or reports its result under another intent; PASS and VETO cannot both be submitted from one pending review.
- **D2**: `DeliveryAssessmentRenderer` in `FailSafe/extension/src/roadmap/ui/modules/delivery-assessment-renderer.js` with LD2-LD5 behaviour; `reviewControls`, `reviewCommitPick`, `reviewNote`, `reviewButtons`, `refresh`, `review` each at most 40 lines and nesting at most 3; no change to request URLs or bodies.
- **D3**: ledger entries for this plan's audit, implementation and seal under session `2026-11-24T1904-4e594e`; evidence under `.failsafe/governance/evidence/issue-703/`; GOVERNANCE_INDEX Last Reviewed refreshed at seal; FEATURE_INDEX FX1010 and FX589 rows unchanged in status (verified).
- **D4**: the Phase 1 jsdom tests pass in `npm test` (extension host) and the mutation runs M1-M4 each fail at least one named test; installed Windows VSIX Delivery review observation per the #706 handoff (type a note, refresh, Record PASS once, switch intent during the pending response) recorded with VS Code, Electron and Node versions.

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
- `npm test` - extension-host suites including the jsdom renderer tests
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/reliability/prepush-validate.ps1` (no skip flags) - the repository pre-push gate
- `npm run build:package` - VSIX for the installed-host check
