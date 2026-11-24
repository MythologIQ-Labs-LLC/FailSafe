# Document edits for the plan-707 SUBSTANTIATE VETO (Entry #974)

Apply in this order, in one records step together with the ledger entry in `substantiate-ledger-entry.md`. Every "old" anchor below occurs exactly once in the current file (checked at f4251d89). The working copies are CRLF (core.autocrlf=true) and the blobs are LF, so match and write with the file's own line endings. Edits that the skill requires only at a seal (SYSTEM_STATE.md sync at Step 6, FEATURE_INDEX changes, version, CHANGELOG stamp, tag) are deliberately absent, because the session is not sealed. The plan's Feature Inventory Touches row is n/a-justified, so FEATURE_INDEX.md needs no edit in any case.

Already written by the protocol itself (no action except to include it in the records commit): `docs/PROCESS_SHADOW_GENOME.md` gained one line, a severity-2 `degradation` event, id `cfeead6a93a589a1e4b0000fc1db590649f1db90f32c7e926d4bafcdc1b905e4`, gate `feature_index_surface_lint`, untagged `FX922`. It was appended by `feature_index_verify --surface-lint` (skill Step 6 item 7).

Gitignored records to force-add (`git add -f`): `.failsafe/governance/evidence/issue-707/SUBSTANTIATE.md`, `substantiate-ledger-entry.md`, `substantiate-doc-edits.md`, and `.qor/gates/2026-11-23T0340-d5e334/substantiate.json`, `substantiate.provenance`, `substantiate-iter1.json`, `substantiate-iter1.provenance`.

---

## Edit 1: docs/META_LEDGER.md

Append the text between the markers in `substantiate-ledger-entry.md` after the final `---` line that follows Entry #973, then end it with a blank line and `---`. Layout: `---`, blank line, entry, blank line, `---`. I verified this layout on a scratch copy with `verify-ledger --post-anchor --boundary 382`: `OK Entry #974: chain hash verified (post-anchor)`, post-anchor clean. A one-character tamper of the chain hash makes the same run fail at #974.

## Edit 2: docs/SHADOW_GENOME.md (VETO requires a Failure Entry)

**old** (the file's last line):

```
Iteration 2 amendment (answers to V1, V2, V4, V6 held under execution). VETO issued on four plan-text grounds; the Governor amends the plan and re-runs /qor-audit.
```

**new**:

```
Iteration 2 amendment (answers to V1, V2, V4, V6 held under execution). VETO issued on four plan-text grounds; the Governor amends the plan and re-runs /qor-audit.

## Failure Entry #336

**Date**: 2026-11-23T06:10:24Z
**Verdict ID**: SUBSTANTIATE plan-707-voice-dependency-isolation iteration 3 VETO (session 2026-11-23T0340-d5e334; report .failsafe/governance/evidence/issue-707/SUBSTANTIATE.md; ledger Entry #974)
**Failure Mode**: documentation-integrity ABORT (orphan glossary home); a known pre-seal blocker carried to seal unremediated

### What Failed
The session seal for PR #712 (#707 voice dependency isolation). The implementation itself matched the plan under execution (patch custody, mutations, body digests, Razor, conditions C1-C8, Linux run 45118465441).

### Why It Failed
- Skill Step 4.7 strict doc_integrity raised ValueError: the 'Vacuous pass' glossary term (qor/references/glossary.md:111) names a home, .failsafe/governance/RESEARCH_BRIEF_qor169-alignment-2026-09-03.md, that is gitignored and absent on this host. The skill gives this ABORT no waiver path.
- The defect is pre-existing at origin/main. Audit #972 printed it in its Documentation Drift section as one that "would hard-block at /qor-substantiate", and nobody acted on it before the seal.
- Earlier seals passed the gate by supplying the gitignored brief from a local copy, so the gate's result depended on one workstation's untracked files.

### Pattern to Avoid
- A Documentation Drift item that an audit marks as substantiate-blocking is a seal obligation. Remediate it in the implement phase, or record a plan item for it, before claiming readiness to seal.
- A glossary home must be a tracked file. A home that exists only in a gitignored local file passes on one machine and fails on every fresh checkout.
- Before sealing, check that every ABORT-class gate passes in a fresh checkout, not only in a workspace with local leftovers.

### Remediation Attempted
None by the Judge, who may not edit source or governance. Required: point the glossary home at an existing tracked file (recorded as UNPLANNED in the seal entry), add the pre-existing ledger fixture token to .qor/secret-scanner-allowlist before staging, and re-run /qor-substantiate.
```

## Edit 3: docs/GOVERNANCE_INDEX.md, Last Reviewed refresh (CLAUDE.md: any substantiate cycle that writes governance)

Running `governance-index --advance-last-reviewed 2026-11-23 --enforce` in a scratch export gave rc 0, with no unregistered or tier3-unarchived drift. It only re-dates the existing top line, which would attach a new date to a prior cycle's description. Following repository precedent, prepend a new line instead.

**old**:

```
# Governance Index

**Last Reviewed**: 2026-10-22 (SUBSTANTIATE
```

(the anchor is the first `**Last Reviewed**` line, which continues with the Dependabot #584 description; match only this prefix)

**new**:

```
# Governance Index

**Last Reviewed**: 2026-11-23 (SUBSTANTIATE VETO - **#707 browser voice vendoring isolated from core npm ci** (`plan-707-voice-dependency-isolation.md`, iteration 3, Tier 4 plans glob; PR #712): an independent Judge verified Reality = Promise for the code and found conditions C1-C8 met, but refused the seal at skill Step 4.7, because the strict doc_integrity orphan home of the 'Vacuous pass' glossary term (qor/references/glossary.md:111) is a pre-existing gitignored file absent on this host. Ledger #970-#974; reports under `.failsafe/governance/evidence/issue-707/`; Shadow Genome #336. Not sealed, merged or released.)
**Last Reviewed**: 2026-10-22 (SUBSTANTIATE
```

## Edit 4: docs/GOVERNANCE_INDEX.md, register the per-issue evidence pattern (GOVERNANCE_INDEX rule 2, line 286)

`--enforce` does not flag `.failsafe/governance/evidence/issue-707/` (plan iterations, audit, implementation and substantiation records, ledger and Shadow Genome entry texts), and no tier row names an `evidence/` pattern. Register it next to the existing report patterns in the Tier 4 pattern table.

**old**:

```
| `SUBSTANTIATE_REPORT_<plan>.md` | `.failsafe/governance/` | at next housekeeping cycle |
```

**new**:

```
| `SUBSTANTIATE_REPORT_<plan>.md` | `.failsafe/governance/` | at next housekeeping cycle |
| `evidence/issue-<N>/*.md` (plan iterations, audit, implementation and substantiation reports, pending ledger and Shadow Genome entry texts) | `.failsafe/governance/evidence/` | at substantiate seal of the plan |
```

## Not edited (and why)

- `docs/SYSTEM_STATE.md`: Step 6 sync applies only at a seal; it is not reached after the Step 4.7 ABORT.
- `docs/FEATURE_INDEX.md`: the plan's row is n/a-justified (Total 805 / verified 765 / unverified 0 / n/a 40, unchanged).
- `README.md`, `CHANGELOG.md`, `FailSafe/extension/CHANGELOG.md`: no release in scope (doc-currency WARN N9). Release preparation adds the #707 line under `## [Unreleased]`.
- `qor/references/glossary.md`: this is the S1 remedy, which the operator or Governor makes before the re-run. It is not a Judge edit.
- `docs/BACKLOG.md`: recommended (not required) row for the environment-dependent premise of `g4Witness.test.cjs:110` (N7).
