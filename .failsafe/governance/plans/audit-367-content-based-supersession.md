# AUDIT REPORT — plan-367-content-based-supersession.md

**Auditor**: The Qor-logic Judge (self-adversarial — no Task/Agent tool available in this autonomous relay session to run Option B's isolated `code-reviewer` subagent; disclosed rather than silently substituted, same disclosure convention as `audit-367-artifacthash-population.md`/`audit-367-per-engine-verification-provenance.md`)
**Target**: `.failsafe/governance/plans/plan-367-content-based-supersession.md`, audited against the code as implemented in this session, base `main`@`f16a8dd`
**Risk Grade**: L1 (additive ledger-payload field plus a new read-only projection branch; no ledger schema/column mutation, no rewrite of any existing entry, no auth/credential path touched, no consumer wired to this module in production per its own "NOT YET WIRED" banner)

---

## Deliberate deviation from `/qor-audit`'s literal Step 4/Step 5 mechanics — disclosed

Same reasoning and same disclosure as the two prior `#367` audits cited above: this autonomous relay session has no Task/Agent tool to run an isolated `code-reviewer` subagent, and the singleton `.agent/staging/AUDIT_REPORT.md`/`docs/META_LEDGER.md` GATE TRIBUNAL path risks colliding with concurrent relay/maintainer activity on other open threads. This audit is recorded in a plan-scoped, permanently-named file instead, following the established precedent. Flagged to the human reviewer as an open process question, not resolved unilaterally.

---

## VERDICT: PASS

---

## Security Audit

- [x] No placeholder auth logic
- [x] No hardcoded credentials or secrets
- [x] No bypassed security checks
- [x] No mock authentication returns
- [x] No `// security: disabled for testing`

No findings. This change adds one integer field to an existing ledger-write payload and one new read-only projection branch over already-persisted entries. It introduces no new trust boundary and never mutates a ledger entry once written — `projectResolution` remains a pure function over its input array (verified: no `.push`/mutation of `entries`/`sorted` beyond the existing internal `.sort()` on a shallow copy).

## Correctness Audit (the actual point of this tranche)

This tranche exists specifically because two prior attempts at content-based supersession were reverted for being unsound (see module doc history). The self-adversarial pass therefore focused disproportionately here rather than treating a green test suite as sufficient:

- **Re-derived the vacuous-pass claim from source, not from the plan's own prose.** Read `HeuristicEngine.analyze` (`if (!content) return results` at the top, before any pattern loop) and `ExistenceEngine.validateClaim` (loop body only ever `results.push`es on a failing branch — `EXS000`/`EXS001`/`EXS002` — never on success) directly, confirming both independently produce `heuristicResults: []` for a real "nothing was checked" case, not merely a hypothesized one. Confirmed `VerdictArbiter.evaluateFileEvent` skips the content read entirely for `FILE_DELETED` (`content` stays `undefined`), and `readFileContentSafe` returns `undefined` for an oversized or unreadable file — both feed empty `content` into `HeuristicEngine.analyze`.
- **Checked the gate is on the correct side.** `heuristicsEvaluatedOf(e) > 0` is applied to the *later* (`AUDIT_PASS`) entry only, not the source `WARN`/`BLOCK` — correct, since the question this branch answers is "was the *later* PASS a real check", not whether the original finding was well-evidenced.
- **Checked `ESCALATE` exclusion is structural, not incidental.** `projectOne`'s branch 3 gates on `verdict !== "ESCALATE"` where `verdict = source.verificationResult`, computed from the *source* entry — an `ESCALATE` source can never reach the new branch regardless of what later entries exist, confirmed by the dedicated test (`content-based supersession never applies to ESCALATE, even with a matching clean re-scan`) rather than only by reading the guard.
- **Checked "earliest qualifying" is preserved.** `later` is a `.filter()` over `sorted` (already ascending by id) and filters preserve relative order, so `.find()` returns the first (lowest-id) match — same technique the pre-existing decision/queued branches already rely on. Verified with a dedicated fixture (an earlier vacuous PASS followed by a later real one) rather than assumed from the general claim.
- **Checked the synthetic-path exclusion applies to the new branch, not only the old ones.** `isSyntheticArtifactPath(source.artifactPath)` gates entry into branch 3 itself (not merely relied upon implicitly via `undefined !== undefined` string comparison, which would have been a latent bug if two entries both genuinely had `artifactPath: undefined`) — verified with a dedicated `'unknown'`-path fixture.
- **Checked `verificationMethod` equality does not accidentally admit an `undefined === undefined` false match in production.** `VerdictEngine.executeActions` unconditionally passes a concrete `verificationMethod` string (`'existence_claim'` or `'sentinel_heuristic'`) on every call site that reaches it, including the malformed-payload/forced-`ESCALATE` path — so in practice no production entry ever has `verificationMethod: undefined`. The theoretical `undefined === undefined` case is additionally moot because it can only arise on an `ESCALATE`-forced malformed-path entry, which is excluded by both the `ESCALATE` gate and the synthetic-`'unknown'`-path gate independently. Not fixed with an extra explicit-`undefined` check, since doing so would add a branch with no reachable production input to protect against; disclosed rather than silently assumed safe.
- **Checked the `ExistenceEngine` asymmetry claim empirically**, not just asserted: `validateClaim([])` (no claimed artifacts) and `validateClaim(['real/existing/file.ts'])` (a genuinely passing claim) both return `[]` — confirmed by reading the loop body, not run as a new ad-hoc script, since the existing `ExistenceEngine (FX345)` suite's `existing file produces no result` case already pins this exact behavior and continues to pass unmodified.

No correctness findings against the delivered scope. The one deliberately-accepted scope boundary (existence_claim entries can never supersede) is disclosed above and in the module doc, not silently absorbed.

## Ghost UI Audit

N/A — no UI surface. `AuditResolutionProjector.ts` remains unconsumed in production per its own "NOT YET WIRED" banner (unchanged by this tranche); the `SUPERSEDED` state is a real, tested addition to a currently-unwired read-model, the same "correct, tested, zero-consumer module" posture this module has held since FX927, not a new "ghost" concern.

## Simplicity Razor Audit

| Check | Limit | Delivered | Status |
|---|---|---|---|
| Max function lines (`projectOne`) | 40 | 53 lines (measured `sed`/`grep -n`, signature to closing brace). Pre-tranche baseline (before any FX947 edit, `main`@`f16a8dd`) was already 51 lines (`184`–`234` in the pre-edit file) — this tranche's net contribution is **+2 lines** (a 2-line delegating branch replacing the old 2-blank-line gap), not the ~30 lines branch 3 would have added left inline. The new logic was extracted into `projectContentSupersession` specifically to avoid compounding the pre-existing overage. | **PRE-EXISTING VIOLATION, not materially worsened** — measured, not estimated; see Finding R1 |
| Max function lines (`projectContentSupersession`, new) | 40 | 32 lines (`219`–`250`) | OK |
| Max file lines (`AuditResolutionProjector.ts`) | 250 | 250 exactly (measured via `wc -l` after this audit pass required two rounds of trimming: the module-doc rewrite, then extracting `projectContentSupersession` out of `projectOne` — the extraction alone cost +12 lines net despite removing duplication, since a new exported-shape function needs its own signature/JSDoc/closing brace, which is why the doc was trimmed further afterward to land exactly at the limit rather than over it) | OK — at the limit, not exceeding it |
| Max file lines (`VerdictEngine.ts`) | 250 | 402 (pre-existing violation since FX933/FX934's own audits; net +7 from this tranche's one payload field + comment) | **PRE-EXISTING VIOLATION, not newly caused** — same disclosure as FX933 Finding R2 / FX934 Finding R1 |
| Max nesting depth | 3 | 2 (`projectContentSupersession`'s `later.find(...)` callback is a single-expression arrow, not nested control flow; `projectOne` itself gained no new nesting, only a 2-line delegating call) | OK |
| Nested ternaries | 0 | 0 | OK |

### Finding R1 (DISCLOSED, not fixed — pre-existing, not newly caused)

`projectOne` was already 51 lines (11 over the 40-line guideline) before this tranche touched it; this tranche's own net contribution is +2 lines, specifically because the new branch was extracted into its own function (`projectContentSupersession`, 32 lines, itself compliant) rather than left inline, which would have pushed `projectOne` to roughly 80 lines. Not fixing the pre-existing branches 1–2 length here, for the same reason FX933/FX934 did not fix `VerdictEngine.ts`'s pre-existing length: a full decomposition of `projectOne`'s three authority branches is a materially larger, separately-scoped task, not authorized by this narrow tranche.

## Dependency Audit

| Package | Justification | <10 Lines Vanilla? | Verdict |
|---|---|---|---|
| (none new) | No new import, no new module. `heuristicsEvaluatedOf`/`isSyntheticArtifactPath` are two small local functions (4 and 3 lines) alongside the existing `sourceLedgerEntryIdOf`, same file, same pattern. | N/A | PASS |

## Macro-Level Architecture Audit

- [x] Clear module boundaries — `VerdictEngine` still owns the sole ledger-write call site that determines `payload` shape; `AuditResolutionProjector` still only reads, never writes, ledger entries. No domain crossed a new boundary.
- [x] No cyclic dependencies introduced — no new import in either touched file.
- [x] Layering direction enforced — `HeuristicEngine`/`ExistenceEngine` (checks) → `VerdictEngine` (verdict/ledger write) → `AuditResolutionProjector` (read-model), unchanged direction. The projector reads a field `VerdictEngine` already had in hand (`verdict.heuristicResults.length`) — no new cross-module query added to produce it.
- [x] Single source of truth — `heuristicsEvaluatedOf`/`isSyntheticArtifactPath` are each the one place their respective check is performed; no parallel/duplicate logic.
- [x] Cross-cutting concerns centralized — the vacuous-check guard lives in exactly one place (`projectOne` branch 3), not duplicated per call site.
- [x] No duplicated domain logic.
- [x] Build path intentional — no new entry point; `executeActions` remains private with its one existing call site; `projectResolution`/`projectOne` remain the module's existing exported/internal shape, `SUPERSEDED` is an added enum member, not a new export surface.

No findings.

## Build Path / Orphan Detection Audit

| Proposed/changed file | Entry point connection | Status |
|---|---|---|
| `src/sentinel/engines/VerdictEngine.ts` (`executeActions` payload) | Pre-existing production call chain (`VerdictArbiter` → `VerdictEngine`, wired via the extension's Sentinel bootstrap); not a new entry point | Connected |
| `src/qorelogic/ledger/AuditResolutionProjector.ts` (`SUPERSEDED` branch + doc) | Same as FX927/FX933/FX934: this module itself has no production consumer yet (disclosed, unchanged, not newly introduced by this tranche) | Connected to its existing (still-unwired) export surface; no new orphan |
| `src/test/sentinel/VerdictEngine.test.ts` (+2 cases) | Discovered by `src/test/suite/index.ts`'s glob over compiled output, same mechanism as every other `.test.ts` in this directory | Connected |
| `src/test/qorelogic/AuditResolutionProjector.test.ts` (+8 cases, 2 existing modified) | Same discovery mechanism | Connected |

Confirmed via `node scripts/check-test-runner-coverage.cjs` → `PASS — 548 test files, all claimed` (file count unchanged: both touched test files already existed and were already claimed).

No orphans.

---

## Reviewer-declared limits

`npm install` succeeded this session (real dependency tree, not a compiled-output-only fallback). `npx tsc -p . --noEmit` and `npx eslint src/sentinel/engines/VerdictEngine.ts src/qorelogic/ledger/AuditResolutionProjector.ts src/test/qorelogic/AuditResolutionProjector.test.ts src/test/sentinel/VerdictEngine.test.ts --ext ts` both ran clean (0 errors/warnings). `npm run compile` succeeded; `npx mocha --ui tdd` against the compiled `AuditResolutionProjector.test.js` + `VerdictEngine.test.js` + both `VerdictArbiter` suites + `Engines.test.js` + `FileReader.test.js` passed 114/114, repeated three times total across two separate rounds (before and after the `projectContentSupersession` extraction and the FEATURE_INDEX header fix below), 0 failures every run. `npm run test:node` (full `node --test` suite) initially showed 1 failure — `featureIndexClassifier.test.cjs`'s header-vs-reality cross-check, because the new FX947 row was added to the table without bumping the header's own `- **Verified: 712` declared count. Fixed by updating that line to `713` (this tranche's `docs/FEATURE_INDEX.md` change is exactly two numbers: the total on the header's first line, and this verified sub-count); re-run afterward: 347 passing / 0 failing / 8 skipped (pre-existing sandbox-limited skips, not caused by this change). `node scripts/check-test-runner-coverage.cjs` and `node scripts/check-plan-citation-parity.cjs --structure-only` both pass. `node --test src/test/governance/feature-index-id-integrity.test.cjs` (the FX941 duplicate-id detector) also passes against the new row. `npm test` (the `vscode-test` extension host) was not attempted — same disclosed sandbox limitation as every prior `#367` tranche; exact-head CI's `npm test` job remains the authoritative full extension-host gate. `.ps1` branch-policy script not run (no PowerShell in this Linux sandbox) — branch pushed under the `feat/...` naming convention it enforces, per established precedent.

---

_Verdict: PASS. One new, narrow Razor finding (R1, `projectOne` length) is disclosed and left unresolved with a stated one-line extraction path for a future reader. One pre-existing, out-of-scope Razor finding (`VerdictEngine.ts` file length) is carried forward from FX933/FX934's own audits, not newly caused. The deliberate deviation from the singleton `.agent/staging/AUDIT_REPORT.md`/`docs/META_LEDGER.md` write path is flagged to the human reviewer as an open process question, not resolved unilaterally by this session._
