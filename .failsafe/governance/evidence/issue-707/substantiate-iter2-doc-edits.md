# Document edits for the plan-707 SESSION SEAL (Entry #975, substantiate iteration 2)

Apply in this order, in one records step, on HEAD 6c7f8b22 plus the protocol appends listed below. Every "old" anchor occurs exactly once in the current file (checked at 6c7f8b22). Line endings: `docs/META_LEDGER.md` is LF in both the index and the working copy. `docs/SYSTEM_STATE.md` and `docs/GOVERNANCE_INDEX.md` are LF in the index and CRLF in the working copy (`core.autocrlf`). Match and write each with the file's own working-copy line endings, so that git stores LF. I applied all of these edits in a scratch clone and verified the result (see "Verification of this edit set" at the end).

## Already written by the protocol itself (no action except to include it in the records commit)

`docs/PROCESS_SHADOW_GENOME.md` gained two lines (CRLF, like the rest of that working copy) during this run:

1. id `dde19ff227772de91ce953f13a2fb598b4dec6e85e6271923ecd1cff04291cc6`, a severity-2 `degradation` event, gate `feature_index_surface_lint`, untagged `FX922`, ts 2026-11-23T06:34:07Z. It was appended by `qor-logic scripts feature_index_verify --surface-lint` (skill Step 6 item 7). It repeats the pre-existing FX922 WARN that #974 also recorded.
2. id `89d12559bdadef6e2e30824a4cdb774b2fc461c66f70015a25277e1ac32f6735`, a severity-1 `gate_skipped_prerequisite_absent` event, gate `data_api_acl_lint`, ts 2026-11-23T06:36:58Z. It was emitted by `node FailSafe/extension/scripts/qor-skip-emitter.cjs` (FX943; the Phase 75 disclosed-skip) and closed at emission by `permanent_skips` (`addressed: true`, as in the five prior events for this gate).

Written by the Judge (force-add with `git add -f`, because `.failsafe/` and `.qor/gates/` are gitignored): `.failsafe/governance/evidence/issue-707/SUBSTANTIATE-iter2.md`, `substantiate-iter2-ledger-entry.md`, `substantiate-iter2-doc-edits.md`, and `.qor/gates/2026-11-23T0340-d5e334/substantiate-iter2.json`, `substantiate-iter2.provenance`, `substantiate.json`, `substantiate.provenance` (the last two are the refreshed singleton and its sidecar; `substantiate-iter1.*` are unchanged).

---

## Edit 1: docs/META_LEDGER.md (skill Step 7)

Append the text between the markers in `substantiate-iter2-ledger-entry.md` after the final `---` line that follows Entry #974. Layout: `---`, blank line, entry, blank line, `---`, final newline. LF only, ASCII only.

## Edit 2: docs/SYSTEM_STATE.md, Last Updated (skill Step 6 "ALWAYS update SYSTEM_STATE.md before sealing"; GOVERNANCE_INDEX Drift Detection Contract rule 1)

**old** (line 3):

```
**Last Updated:** 2026-11-14 (v6.1.0 development and live-queue reconciliation; historical release events remain in their dated sections below).
```

**new**:

```
**Last Updated:** 2026-11-23 (#707 browser voice vendoring isolation sealed on PR #712 at ledger #975, not merged or released; historical release events remain in their dated sections below).
```

## Edit 3: docs/SYSTEM_STATE.md, dated section (system-state-currency.test.cjs requires a `## <Last Updated date>` body section)

**old** (the first dated heading):

```
## 2026-11-14 — v6.1.0 development-queue and release-witness documentation reconciliation
```

**new**:

```
## 2026-11-23 — #707 browser voice vendoring isolated from core npm ci (SESSION SEAL #975; PR #712, not merged)

- PR #712 (`fix/707-isolate-optional-voice-vendoring`) is sealed against `plan-707-voice-dependency-isolation.md` iteration 3: audit PASS #972, implementation #973, substantiation VETO #974 on a documentation-integrity orphan, then PASS at the re-run (#975). It is not merged or released, and no version bump or tag was made.
- Core `npm ci` no longer installs `piper-tts-web` or `@xenova/transformers`, so `onnxruntime-node` and `sharp` are no longer installed. The six browser voice assets are committed under `FailSafe/extension/src/roadmap/ui/vendor/{piper,whisper}/`, are marked `-text` in `.gitattributes`, and are checked against their pinned upstream bytes by `npm run verify:voice-pins`. `bundle.cjs` refuses an empty, oversized or directory asset before it copies the vendor tree.
- `vendor-voice.cjs` is split into source, fs, transaction and verify modules. An existing asset is hashed with a bounded read (the supplied `fix.patch`). `vendor-piper.cjs` is removed (`vendor:piper` runs `vendor-voice.cjs --piper-only`). Failure cleanup in `package-voice-pack.cjs` now also covers prerelease versions.
- Governance: the glossary home of 'Vacuous pass' is now this file (the 2026-09-03 section below documents the same controls) instead of a gitignored brief that made strict doc_integrity abort on fresh checkouts. `.qor/secret-scanner-allowlist` suppresses the fake `xoxb-` fixture token quoted in the ledger.


## 2026-11-14 — v6.1.0 development-queue and release-witness documentation reconciliation
```

(The heading's dash is U+2014, as in the neighbouring headings. SYSTEM_STATE.md is UTF-8 and is not subject to the ledger ASCII rule. The two blank lines before the 2026-11-14 heading follow the file's existing spacing between sections.)

## Edit 4: docs/GOVERNANCE_INDEX.md, Last Reviewed refresh (CLAUDE.md; skill Step 4.7.5; Drift Detection Contract rule 5)

`qor-logic governance-index --advance-last-reviewed 2026-11-23 --enforce` in a scratch clone of HEAD: rc 0, no `unregistered` or `tier3-unarchived` drift, and no byte change, because the top line is already dated 2026-11-23 (the #974 VETO line). Following the precedent of #974, prepend a new line so the seal has its own description.

**old** (prefix of line 3; match only this prefix):

```
# Governance Index

**Last Reviewed**: 2026-11-23 (SUBSTANTIATE VETO - **#707
```

**new**:

```
# Governance Index

**Last Reviewed**: 2026-11-23 (SUBSTANTIATE SEAL - **#707 browser voice vendoring isolated from core npm ci** (`plan-707-voice-dependency-isolation.md`, iteration 3, Tier 4 plans glob; PR #712): a fresh independent Judge re-ran /qor-substantiate after the #974 VETO and sealed it. S1 is closed by the owner-authorized UNPLANNED commit 6c7f8b22 (the 'Vacuous pass' glossary home is now `docs/SYSTEM_STATE.md`; `.qor/secret-scanner-allowlist` suppresses the fake ledger fixture token), and conditions C1-C8 are met. Ledger #975; report `.failsafe/governance/evidence/issue-707/SUBSTANTIATE-iter2.md` (covered by the `evidence/issue-<N>/*.md` Tier 4 row). Not merged, released or tagged.)
**Last Reviewed**: 2026-11-23 (SUBSTANTIATE VETO - **#707
```

No tier registration is needed: the new report matches the `evidence/issue-<N>/*.md` row that 7003e07e added, and `.qor/` (the allowlist and the gates) is out-of-tier "Tool config + runtime state" (`docs/GOVERNANCE_INDEX.md:334`).

## Not edited (and why)

- `docs/SHADOW_GENOME.md`: PASS, so no Failure Entry is required. Optional, not required: a one-line resolution note under Failure Entry #336 ("Resolved by 6c7f8b22; sealed at #975"), if the repository records resolutions there. The Judge does not make it.
- `docs/FEATURE_INDEX.md`: the plan's Feature Inventory row is n/a-justified (Total 805 / verified 765 / unverified 0 / n/a 40, unchanged).
- `README.md`, `CHANGELOG.md`, `FailSafe/extension/CHANGELOG.md`, `FailSafe/extension/package.json`: Step 7.5/7.6 are SKIP (there is no root manifest, and the plan's non_goals forbid any bump, tag or release). Release preparation adds the #707 line under `## [Unreleased]` (N9).
- Tier 4 archive (GOVERNANCE_INDEX Drift Detection Contract rule 4): not performed, matching the #968 precedent (`plan-v6013-release-governance.md` and `plan-v6012-release-governance.md` remain under `.failsafe/governance/plans/`; `.failsafe/archive/` has 0 tracked files). Moving the plan would break the `**Plan**` path binding in #975, the intent-lock snapshot and `plan.json`'s `plan_path` (N15). This needs an owner decision, not a Judge edit.
- `docs/BACKLOG.md`: a row for the environment-dependent premise of `g4Witness.test.cjs:110` (N7) is recommended, not required.
- `.qor/session/current`: Step 9.8 session rotation is the operator's last step after the seal commit, and it rewrites this tracked file. The Judge did not rotate.

## Operator steps after applying (not Judge actions)

Skill Step 9.5 (`python -m qor.scripts.seal_stage --session 2026-11-23T0340-d5e334 --repo-root .`), then re-run `qor-logic scripts secret_scanner --staged` on the real staging (it must be rc 0 with the allowlist, and must not be vacuous), the seal commit with the full `qor.scripts.attribution.commit_trailer()` output, then Step 9.5.4 `seal_trailer_check --commit HEAD`. No Step 9.5.5 tag (no version). Step 9.6 push only, then Step 9.8 rotation.

## Verification of this edit set (scratch clone of HEAD 6c7f8b22 with Edits 1-4, the two protocol lines and the new evidence files applied)

See `SUBSTANTIATE-iter2.md`, section "Post-edit simulation", for the commands and results.
