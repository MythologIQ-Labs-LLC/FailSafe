# AUDIT REPORT: v6.0.13 release governance, iteration 1

**Verdict: PASS**
**Risk grade:** L3 (supply chain and governance integrity)
**Auditor:** independent fresh-context Judge (`/qor-audit`); did not author the candidate.
**Date:** 2026-11-12
**Target:** worktree `C:\dev\mythologiq\FailSafe-6013rel`, branch `release/v6.0.13-rc1`, draft PR #663 (OPEN, draft=true, head `589b515734182a0b94b0713e7557eac123b0fb29`, verified with `gh pr view`).
**Base:** `origin/main` `23e254d956f83b12d336df649301b85d927c0d5f` (fetched; equal). Previous release tag `v6.0.12`.
**Plan:** `.failsafe/governance/plans/plan-v6013-release-governance.md`, iteration 1.
**Procedure:** `docs/releases/RELEASE_INTEGRATION_PATH.md`, `docs/releases/G4_WITNESS_OPERATIONS.md`.

**Scope boundary.** G4 code and the owner certificate were not re-audited. Their receipts are reused: Entries #958, #963, #965, #966 (all GATE TRIBUNAL PASS, present in `docs/META_LEDGER.md`). I confirmed only that this candidate does not change them relative to `main`.

This audit authorizes nothing: not a seal, genesis, merge, tag or publication. Per the caller's read-only constraint, no ledger entry, gate file or SHADOW_GENOME entry was written; recording this verdict is left to the governor.

---

## 1. Diff against main (release-only content)

`git diff --stat origin/main 589b5157`: 20 files, +314 / -19.

| Path | Content | Status |
|---|---|---|
| `.failsafe/governance/plans/plan-v6013-release-governance.md` | the plan | governance |
| `.qor/gates/2026-11-12T2324-8d58c3/plan*.json`, `*.provenance`; `.qor/session/current` | gate records | governance |
| `CHANGELOG.md`, `FailSafe/extension/CHANGELOG.md` | `[6.0.13] - 2026-11-13` | release docs |
| `FailSafe/extension/README.md`, `README.md` | What's New, Current Release, Continue/Aider rows | release docs |
| `FailSafe/extension/docs/COMPONENT_HELP.md`, `PROCESS_GUIDE.md` | version banner | release docs |
| `FailSafe/extension/package.json`, `package-lock.json` | 6.0.12 -> 6.0.13 (3 lines) | version metadata |
| `src/integrations/catalog/integration-catalog-data.ts` | two `configHint` strings: "in v6.0.12" -> "in this release" | text only |
| `src/integrations/agent-cli/agent-containment.ts` | comment: "in v6.0.12" -> "yet"; constant `AGENT_OS_CONTAINMENT_AVAILABLE = false` unchanged | comment only |
| `docs/BACKLOG.md`, `docs/SYSTEM_STATE.md` | release markers | governance/docs |
| `docs/architecture/integrations/marketplace.md`, `shield-receipts.md` | README line anchors 76->85, 100->109 (verified: README lines 85 and 109 hold the quoted text) | docs |

`git diff --stat origin/main 589b5157 -- tools/g4 FailSafe/extension/scripts/g4-create-checkpoint.cjs FailSafe/extension/scripts/lib/g4 .github/workflows`: empty. No G4 trust configuration, key, script or workflow change. `docs/META_LEDGER.md`: no diff.

Result: OK.

## 2. Shipped product changes since v6.0.12

`git diff --name-only v6.0.12 589b5157 -- FailSafe/extension/src ':!FailSafe/extension/src/test'`:

1. `src/integrations/agent-cli/agent-containment.ts` (comment)
2. `src/integrations/catalog/integration-catalog-data.ts` (two hint strings)
3. `src/roadmap/ui/modules/integration-catalog-renderer.js` (imports and renders the Statewright section)
4. `src/roadmap/ui/modules/statewright-handoff.js` (new)

All four are in the plan's scope table. Other paths changed since v6.0.12 are `scripts/**` and `tools/g4/**` (excluded from the VSIX: `.vscodeignore` lists `scripts/`, and `tools/` lies outside `FailSafe/extension`), `.gitattributes`/`.gitignore` (G4 byte handling), two workflow runner pins (`ubuntu-latest` -> `ubuntu-24.04`, #640/#643, named in the plan), tests and governance records. Packaged docs (`README.md`, `CHANGELOG.md`, `docs/COMPONENT_HELP.md`, `docs/PROCESS_GUIDE.md`) are covered in section 3.

Claim checks:
- **Statewright card.** `statewright-handoff.js` is static markup: one `<a href="https://statewright.ai/runs" target="_blank" rel="noopener noreferrer">`, the URL as text, no fetch, no credential, no status, no adapter. The renderer appends it to the loading, error and loaded states. CHANGELOG/README claims ("opens Statewright's Run History website ... FailSafe sends nothing to Statewright, shows no connection status, and does not read Statewright history or enforce Statewright workflows") match. PASS #946 reused for behaviour. Accurate.
- **Continue/Aider refusal.** `src/extension/agent-cli-command.ts` checks `AGENT_OS_CONTAINMENT_AVAILABLE` (false) first in both commands and returns with a warning before reading the enabled flag, the credential (`optionalCredential`) or prompting; the wrappers additionally refuse when no `runInSandbox` runner is supplied. README rows "refuses before launching", "no setting or credential is read through this command" are accurate.
- **G4 as release tooling, not packaged.** CHANGELOG Security and README What's New both say so. Accurate per `.vscodeignore`.
- **Shallow/grafted clones refused.** `scripts/lib/g4/git.cjs` blocks `--is-shallow-repository`, `.git/shallow` and `.git/info/grafts` (`REPO_INCOMPLETE_HISTORY`). Accurate.
- **Known Limitations current.** `gh issue view`: #660, #505, #476, #475, #463 OPEN; #603, #604, #605, #606, #608 OPEN; #652 CLOSED; #638 OPEN. CRL `nextUpdate` = 2027-09-18 (openssl), matching the plan. FreeTSA "pinned after independent corroboration" is supported by `V6_0_13_G4_TSA_OWNER_SELECTION_2026-11-12.md` (DER SHA-256 match, 10 sources) and `tsa-policy.json` (single root, `a6379e7c...aabc`). True and current.
- **CHANGELOG identity.** The `[6.0.13]` section extracted from both files is byte-identical (same md5). Result: OK.

## 3. Release markers

- `package.json` / `package-lock.json`: 6.0.13.
- `FailSafe/extension/README.md`: line 3 `## What's New in v6.0.13`; line 91 `**Current Release**: v6.0.13 (2026-11-13)`.
- Root README: Current Release v6.0.13, previous v6.0.12.
- SYSTEM_STATE: v6.0.13 candidate, "not yet sealed, tagged or published"; latest published v6.0.12.
- BACKLOG: v6.0.12 RELEASED, v6.0.13 CANDIDATE.
- COMPONENT_HELP / PROCESS_GUIDE banners name v6.0.13.
- `node scripts/release-gate.cjs --preflight`: 9/9 `[PASS]`, exit 0. (The date it prints is the run date, `new Date()`, not a release date.)

Result: OK.

## 4. G4 sequence vs RELEASE_INTEGRATION_PATH.md

| Required (RIP) | Plan | Match |
|---|---|---|
| S sealed commit; R = first commit after S whose ledger holds this release's SESSION SEAL | identical definitions | yes |
| checkpoint attests R; genesis carries `after clean epoch #914` (ops doc) | `--commit R`, owner authorization, separate | yes |
| head retained outside Git before commit | "retained offline before the checkpoint is committed" | yes |
| K: one commit, exactly five `A` files in one new `g4-NNNNNN/` | "One commit adding exactly the five checkpoint files" | yes |
| checks 1-7 on H; release verification on clean H with owner fingerprint and new head; `mode: release`, `ok g4-NNNNNN commit <R>`, `PASS OK` no limitation | same, on "fresh full clone" | yes |
| merge-commit only; M parents/tree; repeat check 7 on M; rule suite `result=pass` | same | yes |
| no tag without these | owner GO separate and explicit before annotated tag on M | yes |

Pre-seal inputs on `main` 23e254d9 (`git ls-tree origin/main -- tools/g4`): certificate `a50c0071...265d8b.cer` (file SHA-256 equals its name), `tsa-roots/freetsa-root-ca.pem`, `tsa-policy.json` (`selected`, one root), `tsa-crls/freetsa-root-ca-2026-09-18.crl`, `revocations.json` (version 1, empty), `enroll-tpm-key.ps1` and `sign-checkpoint.ps1` (#666 merged as `7f8e0ba6`; #667 merged as `23e254d9`, verified with `gh`). None is changed by the candidate. Result: OK.

## 5. Commands run (from `FailSafe/extension` unless noted)

| Command | Result |
|---|---|
| `node --test src/test/docs/*.test.cjs` | 145 pass, 0 fail |
| `node --test src/test/scripts/g4*.test.cjs` | 163 pass, 0 fail |
| `node scripts/release-gate.cjs --preflight` | 9 PASS, exit 0 |
| `node scripts/g4-verify-checkpoint.cjs --repo-root ../..` | `mode: diagnostic (NOT release evidence)`, `BLOCKED NO_CHECKPOINTS` (as expected) |
| `npm run test:node` | 1165 tests: 1146 pass, 18 skipped, 1 fail: `bundleDeps.test.cjs` "holds chokidar 4", the known junction-linked `node_modules` artefact (plan discloses it) |
| `tools/reliability/validate-docs-coherence.ps1 -RepoRoot <root>` (repo root) | passed, exit 0 |

## 6. Ledger

- `git diff origin/main 589b5157 -- docs/META_LEDGER.md`: empty.
- `python -I -m qor.cli verify-ledger --post-anchor` (repo root): only DISCLOSED_PRE_ANCHOR residuals; final line `post-anchor clean (boundary=#382)`.

## 7. Standard passes

- **Security:** no credential, key or secret added; no bypassed check; the containment constant stays false; no trust-input change. Clean.
- **Ghost UI:** the only new UI element is an anchor with a real `href`; no placeholder. Clean.
- **Razor:** product delta is two strings and one comment; `statewright-handoff.js` is 28 lines. Clean.
- **Dependencies:** none added (lockfile changes only the version field). Clean.
- **Macro architecture / orphans:** `statewright-handoff.js` is imported by `integration-catalog-renderer.js`; no new module boundary. Clean.

## Violations

None.

## Observations (not blocking)

- O1. The plan marks genesis and release GO as needing separate owner authorization; M is labelled "owner merge" and the head record "owner" without the word "separate". Both are owner actions, the plan states it carries no release authority, and RIP does not require more. Not a defect.
- O2. The plan's G4 sequence leaves out step 2 of `G4_WITNESS_OPERATIONS.md` "Checkpoint cadence" (a diagnostic verify before committing K). It is not a RIP gate, and the H/M release verifications cover it.
- O3. Root and extension CHANGELOGs differ in older `[6.0.11]` wording (pre-existing, outside `[6.0.13]`).
- O4. The CHANGELOG/README describe the release ledger as witnessed. At this commit no checkpoint exists. This is true only after genesis, and the plan makes tagging conditional on release verification of that checkpoint on H and M. If G4 is not completed, the text must not ship.
- O5. COMPONENT_HELP and PROCESS_GUIDE "Audience" lines still say `v6.0.10` (pre-existing).

## Next action

The governor records this verdict in the ledger. Then: seal at S, owner-authorized genesis at R, K, H, and the RIP checks on H and M, then owner GO, each as the plan describes.
