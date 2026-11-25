# Plan: Tier-1 currency, publication census, Tier-1 authority registry and glossary visibility (#722, #702; PR #721)

**change_class**: hotfix
**doc_tier**: standard
**terms**: none
**iteration**: 1
**Risk Grade**: L2
**Baseline**: `bc3786a5` = two-parent merge of PR #721 head `d208937c235567b4f05982859e94ecc882f78b24` and protected `main@7863a29e15a4ef06c185b6ba34a1a2053a7bfd8a` (which includes merged #712 and #706); `git rev-list --left-right --count origin/main...bc3786a5` -> `0	21`; no conflicts; local, not yet pushed.
**originating_remediation**: FailSafe #722 (stale Governance Index review marker and publication census), #702 (unclosed glossary YAML block hides `Sentry import outcome` from the frozen parser)

**boundaries**:
- limitations: the currency check reads only explicit current-release markers (manifest version, newest CHANGELOG heading, `**Current Release:**` in SYSTEM_STATE and ARCHITECTURE_PLAN, the first Governance Index `**Last Reviewed**`, the Tier-1 version-authority row, the Feature Index lead); it does not judge historical narrative or prove a review happened. The publication census uses FX939's narrow rule (first backticked `.md` per tier row). The file-symlink refusal case is reported as skipped on a Windows host without symlink privilege (the directory cases use junctions and run). Documentation claims are reconciled against the repository, not against installed hosts; no consumer behaviour changes, so no installed-host run applies.
- non_goals: importing or re-sealing the historical local governance line (#699 seal, #698 seal, #696 seal, #701 seal on local branches based on `main@0c0e30e0`); any Bicameral compatibility work (#692); modifying the frozen Qor-logic package; any version bump, tag or release.
- exclusions: Mocha/node:test `describe` registration callbacks are measured but exempt from the 40-line function limit (precedent Entries #940, #982); the workflow job's missing `timeout-minutes` is #708's scope.

## Authority and scope

Fresh native plan for the whole of PR #721 reconciled onto current main: every change in `origin/main...bc3786a5` (12 files) plus the Phase 2 repair below. Owner instruction (2026-11-25): register a fresh plan; preserve but do not import or impersonate the historical local #699/#698/#696/#701 evidence lineage; bind evidence to lineage, source revision, content hash and seal, not to entry numbers (historical #698 and merged #712 both used #975; historical #701 and merged #706 both used #984). Earlier #721 CI and author checks are engineering evidence only.

Historical lineage (recorded, not relied on): local worktrees `.failsafe/worktrees/issue-699`, `issue-698`, `line-696`, `issue-701`, `issue-705` carry a governance line based on `main@0c0e30e0`: #699 seal (`2a27f33b`), #698 seal (`78a82997`), #696 seal (`5083c262`), #701 seal (`2dad165e`), #695/#705 VETOs. That line's #698 glossary change (`Vacuous pass` home) is superseded on main by #707's `6c7f8b22`. Nothing from it is merged by this plan.

The Phase 2 candidate was prototyped in a scratch worktree (research): `.failsafe/governance/evidence/issue-722/candidate-iter1.patch` (against `bc3786a5`), sha256 f6178e2327d677ef0cc2044c92b9f3080dad1b10e564f9b866bc4bf9e9096b86, with `mutants721.py` and `mutation-map-721.txt` beside it.

## Open Questions

None.

## Locked decisions and evidence

- **LD1 (glossary, #702)**: frozen `qor.scripts.doc_integrity.parse_glossary` (qor-logic 0.176.1, installed, unmodified): `origin/main:qor/references/glossary.md` -> 16 entries; `bc3786a5` -> 17 entries including `Sentry import outcome`. The change is the two-line closing fence after the `Quarantined change set` block (`git diff origin/main bc3786a5 -- qor/references/glossary.md` -> `+```` and a blank line). On `bc3786a5`: `check_orphans('qor/references/glossary.md', ...)` PASS and `run_all_checks_from_plan(..., strict=True)` PASS.
- **LD2 (currency check)**: `node FailSafe/extension/scripts/check-governance-currency.cjs` at the repository root of `bc3786a5` -> `FailSafe Tier-1 candidate currency check: v6.0.13 (2026-11-13)` / `Findings: 0 errors, 0 warnings`; refusal exits 2 (`node scripts/check-governance-currency.cjs` from `FailSafe/extension` -> exit 2, no `docs/`); `--enforce` exits 1 on any error.
- **LD3 (release facts the docs state)**: `FailSafe/extension/package.json` version `6.0.13`; `CHANGELOG.md` newest heading `## [6.0.13] - 2026-11-13`; `gh release view v6.0.13` -> 10 assets, 8 `.vsix`; both `.nvmrc` -> `20.18.1` while workflows pin Node `22`; `install-handler.ts:23` -> `bicameral-mcp>=0.14,<0.16`; `agent-containment.ts:7` -> `export const AGENT_OS_CONTAINMENT_AVAILABLE = false;` (#475), checked at `agent-cli-command.ts:152` and `:179` before any Continue/Aider run; main's Governance Index top `**Last Reviewed**` is 2026-11-25 (the #703 seal).
- **LD4 (census)**: at `bc3786a5` the FX939 rule gives 111 registered rows = 79 tracked + 15 private + 17 shapes, 0 unexplained (the census test recomputes this from committed HEAD); the Feature Index has 823 distinct FX rows: 765 verified, 40 n/a, 15 removed, 2 partial, 1 superseded, 0 unverified (row count of `docs/FEATURE_INDEX.md`).
- **LD5 (workflow)**: `.github/workflows/repo-standards-enforcement.yml` triggers are unchanged (`pull_request` to `main`, `release/**`; `push` to `plan/**`, `feat/**`, `fix/**`, `release/**`, `hotfix/**`); #721 adds one `run` step after `npm ci` that runs the governance suites with `node --test`; no trigger, matrix leg, permission, concurrency or timeout change.
- **LD6 (Razor at the baseline)**: `check-governance-currency.cjs` `checkCurrency` 42 lines, `parseArgs` nesting 4; `governance-index-publication.test.cjs` 349 lines (122 at origin/main) with nesting 4 in the census tally; these are #721's own breaches.

## Phase 1: PR #721 as reconciled (no edits)

### Affected Files

`.github/workflows/repo-standards-enforcement.yml`, `FailSafe/extension/scripts/check-governance-currency.cjs` (new), `FailSafe/extension/src/test/scripts/governanceCurrency.test.cjs` (new), `FailSafe/extension/src/test/governance/governance-index-publication.test.cjs`, `FailSafe/extension/src/integrations/bicameral/README.md`, `docs/ARCHITECTURE_PLAN.md`, `docs/FEATURE_INDEX.md`, `docs/GOVERNANCE_INDEX.md`, `docs/INTEGRATIONS.md`, `docs/architecture/INTEGRATION_PORTFOLIO.md`, `docs/architecture/integrations/bicameral.md`, `qor/references/glossary.md`.

### Changes

None beyond `bc3786a5`.

## Phase 2: Razor repair, prospective real-tree guard, refusal coverage (one commit on the #721 branch)

### Affected Files

- `FailSafe/extension/src/test/governance/governanceIndexReaders.cjs` - NEW: the Governance Index readers moved unchanged from the publication test (indexText, registeredPaths, declaredPrivatePrefixes, trackedFiles, census, Tier-1 registrations, committedModes), with the census tally flattened through a `kindOf` classifier
- `FailSafe/extension/src/test/governance/governance-index-census.test.cjs` - NEW: the six #721 Tier-1 and census tests moved unchanged, plus one assertion that a committed root `package.json` cannot replace the nested manifest registration
- `FailSafe/extension/src/test/governance/governance-index-publication.test.cjs` - back to the three original FX939 tests, requiring the readers (79 lines)
- `FailSafe/extension/scripts/check-governance-currency.cjs` - `parseArgs` through a frozen option table (nesting 3; same accepted grammar and refusals); FC001-FC006 move from `checkCurrency` into `markerFindings` (each function at most 40 lines); outputs unchanged
- `FailSafe/extension/src/test/scripts/governanceCurrency.test.cjs` - real-tree guard "#722: the checked-out repository has no current-release marker error"; refusals of `--format text`, a valueless `--repo-root`, an oversized source, a malformed manifest version and a linked repository root; directory links use junctions on Windows; a host that cannot create a file symlink reports the case as skipped instead of passing
- `.github/workflows/repo-standards-enforcement.yml` - the same step also runs `governance-index-census.test.cjs`
- `docs/GOVERNANCE_INDEX.md` - the census sentence names its measurement on `main@7863a29e` and the test that recomputes it (counts unchanged)
- `docs/FEATURE_INDEX.md` - FX939 cites the census suite and the currency suite (no new FX row; totals unchanged)

### Changes

`candidate-iter1.patch` applied byte-for-byte.

## Definition of Done

### Deliverable: Tier-1 currency, census and glossary integrity

- **D1**: exactly the claims below; nothing else is claimed.

| Row | Claim | Proof (tests or command) | Mutants killed |
|---|---|---|---|
| G1 | The frozen Qor glossary parser sees all 17 glossary entries, including `Sentry import outcome`, and strict doc_integrity and the orphan check pass | command: frozen `parse_glossary` count 17 (main 16); `check_orphans`, `run_all_checks_from_plan(strict=True)` PASS | not mutated (documentation) |
| G2 | Each current-release marker disagreeing with the manifest version, or a Governance Index review marker older than that version's release date, is an error (FC001-FC004); a stale Feature Index lead is a warning only (FC005); the Tier-1 version authority must be exactly one row naming `FailSafe/extension/package.json` inside a present Tier 1 section (FC006) | currency suite: stale review marker, stale architecture marker, changelog mismatch, dated Feature Index lead, FC006 phantom root, FC006 missing/duplicate rows, FC006 missing section | C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C24 |
| G3 | The check refuses (exit 2) rather than reporting: duplicate current CHANGELOG heading, impossible date, malformed or ambiguous markers, malformed manifest version, a symlink component, an oversized source, a linked root, unknown, duplicate or valueless options and any `--format` other than `json`; `--enforce` exits 1 on errors | currency suite: the refusal cases | C11, C12, C13, C14, C15, C16, C17, C18, C19, C20, C21, C25 |
| G4 | The real checked-out repository has no current-release marker error | currency suite: "#722: the checked-out repository has no current-release marker error" | C5 (and any future marker drift) |
| G5 | Every backticked Tier-1 first-cell path is a regular blob in committed HEAD, unique, with the nested manifest registered and only the disclosed operator-local tracker absent | census suite: the two Tier-1 tests | R6, R7, R8, R9, R10, R11 |
| G6 | The publication totals stated in the Governance Index equal the FX939 recount from committed HEAD (not the index, not staged files), are read from exactly one claim inside the publication section, and any unexplained path fails | census suite: the four census tests | R1, R2, R3, R4, R5 |
| G7 | FX939: shapes and out-of-tier rows are not counted as registered files | publication and census suites | R12, R13 |
| G8 | Repo Standards runs all three governance suites on every PR to main or release and every push to its branch patterns, without changing triggers or job permissions | workflow readback (LD5) | not mutated (workflow) |
| G9 | The reconciled documents state the facts in LD3 and LD4 (v6.0.13 published with 8 VSIX packages; v6.1.0 unpublished; Node 22 in CI versus 20.18.1 `.nvmrc`; Bicameral legacy adapter frozen under #692 with its pinned `bicameral-mcp>=0.14,<0.16`; Continue/Aider disabled pending #475; Feature Index counts) | readback against the cited sources (LD3, LD4) | not mutated (documentation) |

Equivalent survivors, recorded: C22 (the outside-repository branch cannot be reached once every path component is lstat-checked for links) and C23 (`lstat` never reports a link as a directory, so the root's `isSymbolicLink()` clause is redundant).

**Not claimed**: that a review happened (only that the marker is not older than the release); historical or narrative release text; Bicameral compatibility; installed-host behaviour; anything about the historical local governance line.

- **D2**: files as in Phase 2; every added or changed function and test body at most 40 lines with nesting at most 3; every changed or new code file at most 250 lines.
- **D3**: ledger entries for this plan's audit, implementation and seal under session `2026-11-25T1958-4f4867` on the #721 branch; evidence under `.failsafe/governance/evidence/issue-722/`; Governance Index Last Reviewed refreshed at seal.
- **D4**: (C1) the mutation map re-run on the committed tree: every listed mutant KILLED, only C22 and C23 surviving; (C2) the three suites pass (one skip allowed only for the Windows file-symlink case); (C3) the full local gate and exact-head CI with counts recorded; G1 commands re-run on the committed tree.

## CI Commands

- `node --test src/test/governance/governance-index-publication.test.cjs src/test/governance/governance-index-census.test.cjs src/test/scripts/governanceCurrency.test.cjs` (in `FailSafe/extension`)
- `node FailSafe/extension/scripts/check-governance-currency.cjs --enforce` (repository root)
- `npm run test:node`, `npm run lint`, `npm test` (in `FailSafe/extension`)
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/reliability/prepush-validate.ps1` (no skip flags)
