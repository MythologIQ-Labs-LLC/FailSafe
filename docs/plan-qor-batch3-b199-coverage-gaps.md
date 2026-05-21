# Plan: Batch 3 — B199 Remaining Test-Coverage Gaps (B-B199-3/4/5/6)

**Slug**: `qor-batch3-b199-coverage-gaps`
**Branch**: `worktree-agent-batch3-b199` (isolated worktree, branched from `14e30e5`)
**Author**: qor-auto-dev-1 (governed cycle)
**Date**: 2026-05-21
**Revision**: 2 (audit #1 VETO addressed — see §10)
**change_class**: `feature`
**doc_tier**: Tier 2 (test-infrastructure + governance-tooling change; touches CI gate + docs)
**Risk Grade**: MEDIUM — the only behavioral change is the CI coverage gate (B-B199-5); the gate is non-shipping tooling, fully unit-tested, and a logic error fails *closed* (over-blocks, never silently passes). The other three items are test-additions and documentation.
**FX block**: FX570–FX579 (reserved for this batch — this revision uses FX570–FX575)

---

## 1. Problem statement

The 2026-05-19 deep audit surfaced four residual B199 test-coverage gaps. Per the
task brief and BACKLOG annotations, two of the four (B-B199-3, B-B199-6) are
flagged as *acknowledged trade-offs* — voice ships as a separate companion
download, and the stub-only specs reflect a deliberate supply-chain-trust
posture. The research phase determined:

- **B-B199-3** — `voice-pack.spec.ts` stubs the GitHub Release download via
  `page.route()`. The genuinely supply-chain-relevant logic (`resolveVoicePackUrl`
  version validation + `ALLOWED_REDIRECT_HOSTS` redirect-target allowlist) is
  **already unit-covered** by `voice-pack-install.test.ts` (cases at lines 234,
  241). Real Whisper transcription / Piper audio playback cannot be E2E-tested
  without the ~86 MB vendor binaries that ship as a separate download — building
  a live-Whisper harness is disproportionate. **Proportionate fix**: document the
  trade-off explicitly and mark the spec STUB-ONLY.

- **B-B199-4** — Cross-host install is mocha-only via `installSkillsHandler.test.ts`
  (a `FakeIngestor`). A live install against claude/codex/kilo-code/gemini needs
  Python + the `qor-logic` PyPI package + network — impractical for CI.
  `getHostInstallStatus` / `getQorLogicInstallStatus` ARE already real-temp-FS
  tested in `qor-logic-install-record.test.ts` — BUT that file's `writeRecord`
  helper hardcodes the base directory as `` `.${host}` `` (line 14), which is
  **only correct for `claude` and `codex`**. The real host layouts diverge:
  `kilo-code` → base `.kilo` (not `.kilo-code`), and `gemini` → base `.gemini`
  with `installMap` `{ "commands/": ".gemini/commands" }` (not `skills/`+`agents/`).
  Every existing test writes records only for `claude`/`codex`, so the
  **install-record round-trip for the `kilo-code` and `gemini` host layouts is
  genuinely uncovered**. **Proportionate fix**: add layout-correct round-trip
  cases for those two hosts; document the live-CLI gap.

- **B-B199-5** — `check-e2e-coverage.cjs`'s `hasNoE2eOverride` treats *any*
  `[no-e2e: <reason>]` token anywhere in the push range as a **blanket override**
  for *every* missing-spec surface file (lines 78-86). It should be scoped
  per-file. Additionally `--no-verify` bypasses the whole pre-push gate with no
  audit trail. **Proportionate fix** (the most concrete buildable item): scope
  the override token per-file via a file-pattern prefix, and add a `release`
  mode that re-checks the gate against a merge-commit range (CI-side, not
  developer-bypassable). The pre-push hook stays as fast local feedback; the
  release-mode check is the authoritative non-bypassable layer.

- **B-B199-6** — `integrations-bicameral.spec.ts` + `voice-pack.spec.ts` are
  stub-backed and would not pass against real installs. **Proportionate fix**:
  add explicit `STUB-ONLY` provenance banners to both spec headers so the
  false-confidence risk is visible at the point of reading the test, and record
  the disposition in a trade-offs doc.

**Honest scoping note**: B-B199-3 and B-B199-6 resolve to *documented trade-off
+ explicit markers*, NOT new full-E2E harnesses. B-B199-4 gets two new
layout-correct host round-trip cases (proportionate, not a live-CLI harness,
not a duplication of already-existing claude/codex coverage). B-B199-5 is the
only behavioral code change. This is deliberate — over-building a live-Whisper
or live-`pip` harness would be slow, flaky, and is explicitly out of scope.

---

## 2. change_class & doc_tier rationale

- **change_class: feature** — adds a new `release` execution mode + new override
  semantics to a release-class CI gate; adds new test cases. Not a bug-fix to
  shipped runtime behavior (no `src/` runtime code changes), but the gate
  behavior change is operator-visible, so `feature` is the honest classification
  (and it correctly makes the e2e-gate self-apply — see §7).
- **doc_tier: 2** — touches governance tooling + requires doc updates
  (INTEGRATIONS.md trade-off section, a new TRADE-OFFS doc, FEATURE_INDEX,
  BACKLOG). No architecture/ADR change → not Tier 3.

---

## 3. Phases

### Phase 1 — B-B199-5: CI gate hardening (the concrete buildable item)

`FailSafe/extension/scripts/check-e2e-coverage.cjs`:

1. **Per-file override scoping.** Replace `hasNoE2eOverride(messages, file)` with
   a parser that recognizes the scoped form
   `[no-e2e: <glob-or-path-fragment> — <reason>]`. An override applies to a
   surface file ONLY when the file path contains (or glob-matches) the
   `<glob-or-path-fragment>` segment. The legacy unscoped form
   `[no-e2e: <reason>]` (no ` — ` separator) is **retained for backward
   compatibility but no longer grants a blanket override** — blanket behavior is
   now *opt-in and explicit* via `[no-e2e: * — <reason>]`. **Backward-compat is
   verified, not assumed**: `git log --all --grep='\[no-e2e:'` returns zero
   override invocations on any surface-file push (the only two matches are
   commit *bodies describing* the token in a plan commit and a feature commit,
   not gate invocations). The change therefore has **no existing dependents** —
   it is a pure behavior-tightening with nothing to break.
2. **Release-time mode.** Add `main({ repoRoot, mode })` where `mode: 'release'`
   computes the file set from a merge-commit range
   (`git diff --name-only <base>...<head>`) instead of the staged index, and
   reads override tokens from `git log <base>..<head>`. Range resolved from
   `FAILSAFE_RELEASE_BASE` / `FAILSAFE_RELEASE_HEAD` env (CI supplies these),
   falling back to `origin/main...HEAD`. Default `mode: 'prepush'` keeps current
   staged-index behavior unchanged. **Wiring `release` mode into
   `.github/workflows/release.yml` is a deliberate follow-up, not in this
   batch** — this batch ships the *capability* that closes B-B199-5's
   recommendation; CI wiring is a separate, lower-risk change.
3. **Bypass audit trail.** When the gate is skipped or overridden, emit an
   explicit `[e2e-gate] AUDIT:` line naming each file + the override token that
   excused it (or `--no-verify` if `FAILSAFE_GATE_BYPASS` is set), so the
   decision is greppable in CI logs. Pure stdout; no new files.
4. Keep the file ≤250 lines, every function ≤40 lines, no nested ternaries.
   The gate script is a CLI tool — `console` is its sanctioned output channel
   and is exempt from the non-test-code `console.log` rule.

### Phase 2 — B-B199-4: cross-host install-record round-trip for the uncovered host layouts

Append cases to the **existing** `FailSafe/extension/src/test/qorlogic/qor-logic-install-record.test.ts`
(mocha `tdd`, pure Node FS — no `vscode` import, no Python). The existing file
already covers claude/codex round-trips and the malformed/partial-install paths;
this revision does **not** duplicate them. It adds a **layout-correct** helper
and the two genuinely-uncovered host layouts:

- Add `writeRecordForHost(host, files)` that resolves the base directory and
  record path from `HOST_INSTALL_LAYOUTS` (the canonical source of truth)
  instead of the layout-wrong `` `.${host}` `` shortcut. This is the bug the
  existing helper masks: `kilo-code` → `.kilo`, `gemini` → `.gemini`.
- `kilo-code` round-trip: write a record at `.kilo/.qorlogic-installed.json`,
  assert `getHostInstallStatus(root, 'kilo-code')` reports `installed:true`,
  correct `fileCount`, and `.kilo/skills/` + `.kilo/agents/` style destinations.
  Assert that the layout-wrong `.kilo-code/` path is NOT what the reader uses
  (regression-guards the masked bug).
- `gemini` round-trip: write a record at `.gemini/.qorlogic-installed.json` with
  `commands/`-style file paths, assert `getHostInstallStatus(root, 'gemini')`
  reports `installed:true` and `commands/` destinations (NOT `skills/`+`agents/`).
- `getQorLogicInstallStatus` cross-host aggregation including kilo-code + gemini:
  a workspace with all four hosts installed aggregates `totalFiles` and the
  four-host `destinations` set correctly.
- This is the proportionate, deterministic substitute for an impractical
  live-`pip` cross-host E2E — it exercises the real per-host layout divergence
  that the live install path depends on.

### Phase 3 — B-B199-3 + B-B199-6: explicit trade-off documentation + STUB-ONLY markers

These are **plain doc/marker deliverables**, not FX-numbered feature tests
(audit #1 finding 2 — `fs.existsSync`/string-match checks are doc-lints, not
feature tests, so they do not earn FX numbers):

1. New doc `docs/TEST_COVERAGE_TRADEOFFS.md` — a short, durable register of
   coverage decisions that are deliberate trade-offs rather than gaps: one entry
   each for B-B199-3 (voice live behavior) and B-B199-6 (stub-backed specs),
   stating *what is covered*, *what is deliberately not*, and *why* (binaries
   ship separately; no live `pip`/Whisper in CI).
2. `docs/INTEGRATIONS.md` Voice Pack section — append a "Test coverage" note
   pointing at `TEST_COVERAGE_TRADEOFFS.md` and naming the unit coverage that
   *does* exist (`resolveVoicePackUrl` + redirect allowlist).
3. Add a `STUB-ONLY — see docs/TEST_COVERAGE_TRADEOFFS.md` banner to the header
   comments of `voice-pack.spec.ts` and `integrations-bicameral.spec.ts` so the
   false-confidence risk is visible in-file.

### Phase 4 — Governance docs

- Mark B-B199-3/4/5/6 `[x]` complete in `docs/BACKLOG.md` with this plan cited.
- Add FX570–FX575 rows to `docs/FEATURE_INDEX.md`.
- `git add -f docs/` for the gitignored-but-tracked docs paths.

---

## 4. Affected files

**Modified (code):**
- `FailSafe/extension/scripts/check-e2e-coverage.cjs` — per-file override + release mode + audit line.

**Modified (tests):**
- `FailSafe/extension/src/test/qorlogic/qor-logic-install-record.test.ts` — B-B199-4: layout-correct helper + kilo-code/gemini round-trip cases.
- `FailSafe/extension/src/test/scripts/checkE2eCoverage.test.cjs` — B-B199-5 gate regression cases appended.
- `FailSafe/extension/src/test/ui/voice-pack.spec.ts` — STUB-ONLY header banner (B-B199-6).
- `FailSafe/extension/src/test/ui/integrations-bicameral.spec.ts` — STUB-ONLY header banner (B-B199-6).

**Created (docs):**
- `docs/TEST_COVERAGE_TRADEOFFS.md`.

**Modified (docs):**
- `docs/INTEGRATIONS.md`, `docs/BACKLOG.md`, `docs/FEATURE_INDEX.md`.
- `docs/plan-qor-batch3-b199-coverage-gaps.md` (this file) + `.failsafe/governance/plans/` mirror.

---

## 5. Feature-level test descriptors (FX570–FX575)

Each descriptor is written red-then-green in the same commit per `feedback_per_feature_tdd.md`.

| FX | Feature | Test | Verification |
|----|---------|------|--------------|
| FX570 | `[no-e2e]` override is per-file scoped — a token naming file A does NOT excuse file B | `checkE2eCoverage.test.cjs` new case | `node --test` |
| FX571 | Explicit `[no-e2e: * — reason]` wildcard restores blanket override (opt-in only) | `checkE2eCoverage.test.cjs` new case | `node --test` |
| FX572 | Legacy unscoped `[no-e2e: reason]` no longer blanket-overrides (closes the hole) | `checkE2eCoverage.test.cjs` new case | `node --test` |
| FX573 | `mode:'release'` checks a merge-commit range, not the staged index | `checkE2eCoverage.test.cjs` new case | `node --test` |
| FX574 | Gate emits a greppable `[e2e-gate] AUDIT:` line for every excused/bypassed file | `checkE2eCoverage.test.cjs` new case | `node --test` |
| FX575 | `getHostInstallStatus` round-trips the `kilo-code` (`.kilo`) and `gemini` (`.gemini/commands`) host layouts correctly | `qor-logic-install-record.test.ts` new cases | mocha `tdd` |

**Demoted from FX (audit #1 finding 2)**: the `docs/TEST_COVERAGE_TRADEOFFS.md`
content and the STUB-ONLY banners are plain Phase 3 doc deliverables — they are
still written, just not as FX-numbered features (a doc-presence grep is a
doc-lint, not a feature test). **Dropped as duplicates (audit #1 finding 1)**:
the prior revision's FX576 (partial-install aggregation) and FX577 (corrupt
record degrade) duplicated existing coverage in `qor-logic-install-record.test.ts`
lines 32-42 and 112-121 — removed. FX block FX576–FX579 remains reserved/unused
for any follow-on.

---

## 6. Section 4 Razor compliance

- `check-e2e-coverage.cjs` stays ≤250 lines; new helpers (`parseOverrideTokens`,
  `overrideAppliesTo`, `rangeFiles`, `emitAudit`) each ≤40 lines, single-purpose.
  Current file is 125 lines — comfortable headroom.
- No nested ternaries. `console` use in the gate script is sanctioned (CLI tool
  output channel).
- Test files have no line/function ceiling but stay readable.

---

## 7. CI-gate self-application

`change_class: feature` makes `check-e2e-coverage.cjs` self-apply. The staged
files are: the gate script itself, two `.spec.ts` files (banner-only edits), two
`.test.*` files, and docs. None of the staged files match a `SURFACE_PATTERN`
(`roadmap/ui/`, `roadmap/routes/`, `commands.ts`, `bootstrapServers.ts`) — so the
gate reports `no surface files staged` and exits 0. No `[no-e2e]` token is
needed. This is verified as part of Phase 1 testing.

---

## 8. Rollback

Single commit in an isolated worktree. Rollback = discard the worktree branch.
No push, no merge. The gate change is additive + backward-compatible (legacy
token form still parses; only its *blanket* effect is removed — verified to have
zero existing dependents, so a behavior tightening, not a break).

---

## 9. Success criteria

- [ ] `npm --prefix FailSafe/extension run compile` clean.
- [ ] FX570–FX574 pass via `node --test` (gate regression).
- [ ] FX575 passes via mocha `tdd`.
- [ ] Existing `checkE2eCoverage.test.cjs` + `qor-logic-install-record.test.ts` cases still green (no regression).
- [ ] `npm run lint` clean.
- [ ] B-B199-3/4/5/6 marked complete in BACKLOG; FX570–575 in FEATURE_INDEX.
- [ ] One commit; no push.

---

## 10. Audit #1 VETO — resolution log

| # | Audit finding | Resolution in this revision |
|---|---------------|------------------------------|
| 1 | Phase 2 premise false — `getHostInstallStatus`/`getQorLogicInstallStatus` already real-temp-FS tested; FX576/FX577 duplicate existing coverage | Phase 2 re-scoped to the GENUINE gap: the `writeRecord` helper hardcodes `` `.${host}` `` (correct only for claude/codex); `kilo-code` (`.kilo`) and `gemini` (`.gemini/commands`) layouts are untested. New layout-correct helper + two host round-trips. FX576/FX577 dropped. |
| 2 | FX578/FX579 are `fs.existsSync`/string-match doc-presence assertions, not feature tests | Demoted to plain Phase 3 doc deliverables (trade-off doc + STUB-ONLY banners still written, not FX-numbered). Kept descriptors renumbered to FX570–FX575. |
| 3 | Backward-compat claim speculative ("preserves builds that used a path fragment") | Corrected to the verified fact: `git log --all --grep='\[no-e2e:'` confirms ZERO override invocations on surface-file pushes; the change has no existing dependents (Phase 1.1). |
