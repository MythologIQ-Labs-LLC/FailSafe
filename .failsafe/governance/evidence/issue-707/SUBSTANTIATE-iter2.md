# SUBSTANTIATION REPORT: plan-707-voice-dependency-isolation (iteration 3), substantiate iteration 2

**Timestamp**: 2026-11-23T06:38:28Z
**Phase**: SUBSTANTIATE (re-run after the Entry #974 VETO)
**Judge**: The Qor-logic Judge, a fresh-context independent subagent. It authored none of the plan, code, tests or records, and it is not the Judge of #974.
**Session**: `2026-11-23T0340-d5e334`
**Target**: PR #712 as a whole, `origin/main...6c7f8b2292ec32859eb6aaedb69b36c9ec2c0f47` (merge base and origin/main 0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc, re-fetched), plus the supplied bounded-read patch
**Plan**: `.failsafe/governance/plans/plan-707-voice-dependency-isolation.md` iteration 3, raw sha256 and LF-normalized `content_hash` both 6191b7a3218fd639b0925ceffcb0e00f65a58ea9ce48176f5470a520776bfbe7 (re-hashed: equal)
**Authority chain**: #970 VETO, #971 VETO, #972 PASS L3 (`AUDIT-PLAN-iter3.md`, C1-C8), #973 IMPLEMENT, #974 SUBSTANTIATE VETO (S1 only)
**Risk Grade**: L3
**Tooling**: qor-logic 0.176.1 (frozen, not modified), QOR_SKILL_ACTIVE=substantiate, QOR_MODEL_FAMILY=claude; Node 22.23.5; System32 first on PATH; gh authenticated
**Skill followed**: installed `qor/dist/variants/claude/skills/qor-substantiate/SKILL.md` and its three references

---

## VERDICT: PASS (SESSION SEAL, Entry #975)

Reality matches Promise. The single blocking ground of #974 (S1) is closed, and I verified that by execution on the real worktree. The two edits made after Entry #974 are sound, minimal and honestly disclosed, and they are recorded as UNPLANNED. No other ABORT-class gate fails in a way this repository has not already declared inapplicable. Every skip and deviation is disclosed below with its reason.

Seal: content hash 6191b7a3... (the plan), previous hash 81dba965... (#974), chain hash **b9571093ac543c0e291850bfe05627da2e4e2e8cfbd584a68a60c9f031413510**, Entry ID `e40d415e2c32`.

---

## Previous S1 (Entry #974): CLOSED

- `doc_integrity.run_all_checks_from_plan(plan_artifact, repo_root=".", strict=True)` on the real worktree (tier `standard`, no placeholder; `.failsafe/governance/RESEARCH_BRIEF_qor169-alignment-2026-09-03.md` is still absent): returns with no ValueError.
- Falsifier, in a `git archive HEAD` export: unmodified gives PASS. Reverting only `qor/references/glossary.md:111` to the old home gives exactly `ValueError: Orphan home: 'Vacuous pass' -> '.failsafe/governance/RESEARCH_BRIEF_qor169-alignment-2026-09-03.md' does not exist.` Pointing it at a nonexistent file also raises. The gate is live, and S1 was its only failure.

## Commits after Entry #974

- **7003e07e** (records of the #974 VETO): governance text only. I recomputed the #974 content hash (LF-normalized `SUBSTANTIATE.md`) and chain hash, and both are equal.
- **6c7f8b22** (owner-authorized, UNPLANNED): two files, 4 insertions and 1 deletion. Its commit message describes both changes accurately.

### U1 (UNPLANNED, WARNING): `qor/references/glossary.md:111`

The `home:` line changed from the gitignored brief to `docs/SYSTEM_STATE.md`.

- **Sound**: the target is tracked (`git ls-files`). Its 2026-09-03 section (line 198 at HEAD) lists the same five vacuous-pass controls that the term's definition names: `skill_size_budget_lint` with 0 files, `gate_chain_completeness` with 0 sessions, `secret_scanner --staged` with 0 bytes, the post-anchor fork guard, and `governance-index --cross-check-ledger`. It also cites the brief that was the old home. Another glossary term (line 14) already homes in SYSTEM_STATE.md.
- **Minimal**: it changes one line and nothing else in the term.
- No repository test parses the glossary (`git grep` over FailSafe, .github, tools and scripts finds none).
- Minor: the commit message cites "line 198". That coordinate will shift when the seal prepends the 2026-11-23 SYSTEM_STATE section, but the glossary cites the file only.

### U2 (UNPLANNED, WARNING): `.qor/secret-scanner-allowlist` (new)

- **Format**: it matches `secret_scanner.load_consumer_allowlist` (GH #359): one token per line, and `#` comments are ignored. The INFO line confirms "consumer allowlist: 1 token(s)".
- **Necessary**: with the file moved aside, `secret_scanner --files docs/META_LEDGER.md` gives `BLOCK: 1 ... [slack-token] xoxb...EN`, rc 1. With it in place the result is rc 0.
- **Accurate**: the token is the fake fixture quoted in the ledger's plan-v608 implementation entry (added by 7e3c35be, an ancestor of origin/main). The ledger line itself calls it one of "4 matches, all fake test fixtures". The same literal is the test fixture at `FailSafe/extension/src/test/integrations/catalog/integration-health.test.ts:94`.
- **Minimal**: it holds one fixture-unique token. Suppression is per line ("a line containing a token is not reported"), so any other credential-shaped string on a line that contains this token would also be hidden. I accept that residual because the token is unique to fixtures.
- `.qor/` is out-of-tier "Tool config + runtime state" (`docs/GOVERNANCE_INDEX.md:334`), so it needs no registration.

Also UNPLANNED (carried as N11): `docs/architecture/integrations/acp-devin.md` (04c69c85, a citation shift forced by `bundle.cjs`). Planned files missing: none. Every planned file exists with the expected change status, `vendor-piper.cjs` is deleted, and `vendorVoiceIsolation.test.ts` is split away as planned. The other non-listed paths are inside the plan's declared whole-PR scope (`origin/main...a465bd85`, 15 files) or are governance state (`.qor/session`, `.qor/intent-lock`).

---

## Conditions C1-C8 (audit #972)

| Condition | Status | Evidence (executed in this run unless stated) |
|---|---|---|
| C1 | MET | `git ls-files --eol`: both JS assets and both notes `i/lf w/lf attr/-text`; the four binaries `i/-text w/-text attr/-text`; `.gitattributes:16-17`. `npm run verify:voice-pins` exit 0 on Windows: "pinned upstream bytes match 6 browser assets on disk and committed HEAD; no source files changed". Moved-code AST identity: carried from #974 (the bytes are unchanged since f4251d89). I re-checked `hashExistingVendorAsset` textually: 477955a7 `vendor-voice.cjs` and HEAD `vendor-voice-fs.cjs:66` are identical (34 lines) |
| C2 | MET | `gh run view 45118465441`: PR Full Test, pull_request, headSha f4251d8908e27d5ad088a7150b21d1c69afe7521, completed, success. Log line 129: `HEAD is now at f01c36c Merge f4251d89... into 0c0e30e0`. `gh api commits/f01c36c9`: parents 0c0e30e0 and f4251d89, tree e8dd4dd7, equal to `git rev-parse f4251d89^{tree}`. Log: 6215 passing and 15 pending (extension host); test:node 1170 tests, 1135 pass, 0 fail, 35 skipped; the prerelease packaging test passes; no failing count anywhere. `git diff f4251d89 HEAD` touches no path under `FailSafe/`, and origin/main is unchanged, so this evidence applies to HEAD |
| C3 | MET (carried) | The #974 TS-AST digest result (30 names, 29 equal bodies, the 1 declared exception, 3 equal helpers) stands, because the test bytes are unchanged since f4251d89. Not re-digested |
| C4 | MET | `package-voice-pack.cjs:39` `packageVoicePack(repoRoot, run = spawnSync)`; `removeCandidateArtifacts` (59) calls `assertSafeDistDirectory` (61) before removal; the CLI root is at line 25 only |
| C5 | MET | Archive `failsafe-pr-712-adversarial-bounded-vendor-v2.zip` sha256 89e9f70a...e5377; the extracted `fix.patch` sha256 2ff29ced...8458. Applied with `git apply` to the a465bd85 blobs 299d60a5 and a7d07252 in a fresh repository, it gives 493993375fafe1ba3a14449bdaad535b9c51722f and b4d30c50b42c6d5e056269761f3f697e48f8f66e, equal to `477955a7:` for both files. 477955a7 has the single parent a465bd85 and touches exactly those two files |
| C6 | MET | Prerelease mutation M2 below fails the test with "6.1.0-rc.1: partial archive removed" |
| C7 | MET | `bundle.cjs:113` `assertCommittedVoiceAssets(...)` precedes `copyDir(` at 116; TS-AST `main` is 93 lines; the file is 296 lines |
| C8 | MET | Focused run (`npx mocha --ui tdd --timeout 60000 out/test/scripts/vendorVoice*.test.js out/test/scripts/packageVoicePack.test.js` after `npm run compile`): 36 passing, 11 pending, 0 failing. The 11 pending are exactly the listed symlink and dangling-link set |

D1-D4 (core install): `package.json` names neither `piper-tts-web` nor `@xenova/transformers` (0); the lock has 0 `node_modules/onnxruntime-node`; `node_modules/onnxruntime-node` and `sharp` are absent; `require('better-sqlite3')` loads.

## Mutations (scratch copy of `scripts/` and `out/test/scripts/`; worktree untouched; restored files `cmp`-equal)

- Scratch baseline for the two target files: 12 passing, 4 pending.
- **M1** (Phase 1b): inserting `if (original) io.readFileSync(target);` before the bounded hash (`vendor-voice-transaction.cjs:38`) fails "oversized or empty old asset is refused without reading, staging or overwriting" with "the rejected existing file must never be opened or read".
- **M1c** (Phase 1b, stream path): inserting `io.createReadStream(target).destroy()` at the same point fails the same test in isolation (`reads` 1, expected 0).
- **M2** (prerelease): restoring `if (!/^\d+\.\d+\.\d+$/.test(version)) return;` in `cleanupAfterFailure` fails "a tar failure after writing a partial prerelease archive leaves no archive or checksum" with "6.1.0-rc.1: partial archive removed". A first attempt lost its backslashes through sed, so I discarded it and redid the mutation with an exact-string Python replacement.

## Section 4 Razor (TypeScript compiler AST; suite callbacks are containers)

| File | Lines | Max function or test body | Max nesting | Nested ternary |
|---|---|---|---|---|
| vendor-voice.cjs | 69 | 24 | 3 | 0 |
| vendor-voice-source.cjs | 102 | 21 | 2 | 0 |
| vendor-voice-fs.cjs | 186 | 34 | 3 | 0 |
| vendor-voice-transaction.cjs | 181 | 35 | 3 | 0 |
| vendor-voice-verify.cjs | 112 | 32 | 3 | 0 |
| package-voice-pack.cjs | 197 | 24 | 2 | 0 |
| bundle.cjs | 296 | main 93 (declared cap 93) | 4 in bundlePattern (declared pre-existing exclusion) | 0 |
| vendorVoice*.ts (7 files), packageVoicePack.test.ts | 13 to 218 | 36 | 2 | 0 |

There is no TODO, FIXME or NotImplemented. Every `console.log` in the #712 scripts is CLI operator output. No CSS or TSX is touched, so Visual Silence does not apply.

## Protocol steps

| Step | Result |
|---|---|
| Preflight governance-health | 8 of 8 OK |
| 0 prior artifact | found, valid (`implement-iter1.json`) |
| 2 PASS / implementation | #972 PASS; implementation present |
| 2.5 version | `version_applicability.validate` raises FileNotFoundError (pyproject.toml): SKIP. Manual: `change_class: feature`; `FailSafe/extension/package.json` 6.0.13 equals the highest tag v6.0.13; the plan declares no target version, and its non_goals forbid "any version bump, tag or release". No tag has moved since PASS |
| 3 reality, ledger_commitment | see above; `ledger_commitment: OK (23 touched artifact(s) checked)` |
| 3.5 BACKLOG | Security Blockers: none; Development Blockers: no open item. B287 (publish the Voice Pack) is backlog, not a blocker |
| 4 test audit | no tests changed since #974; the mutations show the new tests invoke their units; runtime-principal not applicable (no DB path) |
| 4.5 skill files | none modified by #712 |
| 4.6 substantiate_gates | default path crashes (`qor/skills/governance/...` absent in a consumer). With `--skill <installed SKILL.md>`: "10 gate(s) parsed, order verified", rc 0 (N13) |
| 4.6 intent_lock verify / skill_admission / gate_skill_matrix / session_id_lint | VERIFIED / ADMITTED / 0 broken of 156 / rc 0 |
| 4.6.5 secret_scanner | `--staged` on the worktree: 0 staged, rc 0 (vacuous). `--files` over all 76 added or modified files of `origin/main...HEAD`: rc 0 with the allowlist. Falsifier without it: BLOCK on META_LEDGER (U2). Real seal staging, simulated: see below |
| 4.6.6 procedural_fidelity | rc 0 |
| 4.6.7 dod_check | rc 0 (plan path passed as argv; `current_phase_plan_path` raises "Not on a phase branch") |
| 4.6.8 merge_velocity | healthy (0 merged in 7 days) |
| 4.6.9 skill_size_budget | WARN only (qor-substantiate 37.0 KB) |
| 4.6.10 data_api_acl | SKIP (no SQL migrations); disclosed-skip event emitted and closed at emission |
| 4.6.12 continuity | not applicable (no `execution_continuity`) |
| 4.6.13 install_drift | OK (N10: possibly vacuous) |
| 4.6.14 publication_boundary | rc 1, scope structural. 537 at HEAD, 537 at f4251d89, 528 at origin/main (`git archive` exports, `--no-git`, full lists diffed through `collect_findings`). The 9 added are all in #712 records: the System32 tar executable (3), the Git for Windows system gitconfig (5) and a literal drive-letter placeholder (1). 7003e07e and 6c7f8b22 add 0. Non-blocking (N1): see Rationale |
| 4.7 doc_integrity strict | PASS (S1 closed) |
| 4.7.5 governance-index | `--advance-last-reviewed 2026-11-23 --enforce` in a scratch clone, before and after the seal edits: rc 0, no drift, no byte change (the top line is already 2026-11-23); a prepended line is proposed |
| 6 FEATURE_INDEX | `feature_index_verify`: total 805, verified 765, unverified 0, n/a 40, rc 0; no prior snapshot; surface lint WARN FX922 (pre-existing; event appended) |
| 6 ac_close_guard | PR #712 body (8468 bytes): "no closing references found" |
| 6.5 doc currency | WARN: README.md and CHANGELOG.md not in `files_touched` (N9) |
| 6.8 hash gate | `require_toolkit_modules` OK; `validate_sha256` on merkle_seal, content_hash, previous_hash, chain_hash: OK |
| 7 seal entry | `substantiate-iter2-ledger-entry.md` |
| 7.4 SSDF | `**SSDF Practices**: PO.1.4, PS.2.1, PW.1.1, RV.1.1, RV.1.2` (the tool's output at this head; #974's line lacked RV.1.1 and RV.1.2) |
| 7.5 / 7.6 / 9.5.5 | SKIP: no root `pyproject.toml`, `package.json` or `Cargo.toml`, and non_goals forbid a bump, stamp or tag |
| 7.7 seal_entry_check | inapplicable (N14): on the edited clone it prints `FAIL: no parseable latest entry` because `ledger_dialect.entry_phase` needs a numeric phase that this ledger dialect does not carry (the #601, #616, #631 and #637 precedent). Verified directly: the chain hash recomputes; content_hash equals `ledger_hash.content_hash` of the cited `**Plan**`; the entry is ASCII; `check_previous_hash_uniqueness` ok; post-anchor clean |
| 7.7.5 seal_artifacts | `--check` fails: `agents root not found: .claude\agents` (the layout config declares `.claude/agents`, which does not exist on this host). Inapplicable, matching precedent (N14) |
| Z gate artifact | written: `substantiate-iter2.json` plus the refreshed singleton and both sidecars |
| 7.8 gate_chain_completeness | rc 0 but "inspected 0 sessions" (vacuous); the four session artifacts `plan.json`, `audit.json`, `implement.json` and `substantiate.json` exist |
| 7.9 spec fold | `fold_session_deltas` returns `{}` (no deltas) |
| 8 staging cleanup | not performed by the Judge (no `.agent/staging` artifact belongs to this session) |
| 8.5 dist_compile | `--dry-run` targets the frozen install's `qor/dist`; this consumer has no `qor/skills`. A real run would edit the frozen qor-logic. SKIP |
| 9.5, 9.5.4, 9.6-9.8 | operator steps (no commit, push, tag or rotation authority); listed in the doc-edits file |
| Ledger | `verify-ledger --post-anchor --boundary 382`: post-anchor clean at HEAD. #970-#974 content and chain hashes recomputed independently: all equal |

## Post-edit simulation (scratch `git clone` of HEAD 6c7f8b22; the edits applied by a script that parses the code blocks of `substantiate-iter2-doc-edits.md`, so the file itself is what was tested)

- All four anchors matched exactly once, using the working-copy CRLF for SYSTEM_STATE.md and GOVERNANCE_INDEX.md and LF for META_LEDGER.md.
- `verify-ledger --post-anchor --boundary 382`: `OK Entry #975: chain hash verified (post-anchor)`, post-anchor clean. A one-character tamper of the #975 chain hash gives `FAIL Entry #975` and `post-anchor DIRTY`, rc 1.
- governance-health 8 of 8 OK; ledger_commitment OK; strict doc_integrity PASS; governance-index enforce rc 0.
- `npm run test:node` (after compile and bundle in the clone): 1170 tests, 1159 pass, 2 fail, 9 skipped. FX938 SYSTEM_STATE currency, FX946 ledger anchor, the ledger fork, governance-index publication and skip-emitter tests all pass. The 2 failures are (a) `g4Witness.test.cjs:110`, the pre-existing full-clone premise (N7, the same on the worktree), and (b) `bundleDeps.test.cjs` "holds chokidar 4", a scratch artifact: the clone's node_modules is a junction, so esbuild embeds an absolute path. The same file passes 3 of 3 on the real worktree.
- Seal staging. I staged the 11-file seal set in the clone: the four edited docs (including the two protocol lines in PROCESS_SHADOW_GENOME.md), the three force-added evidence files and the four gate files.
  - `secret_scanner --staged`: rc 0 with the allowlist, so the run is not vacuous (11 files staged). Without the allowlist: BLOCK, 1 finding, the pre-existing ledger fixture only. An earlier draft of the #975 Decision quoted the token literally and produced a second finding, so I removed the literal.
  - `publication_boundary_lint` (git mode, staged files visible): 537, of which 0 are in this run's records. An earlier draft added 1 ("Post-#974" read as a cross-repo issue shape) and quoted two absolute OS paths; both are reworded.
  - `test:citation-parity` and `test:runner-coverage` (768 files): PASS. `verify-ledger --post-anchor --boundary 382`: #975 OK, post-anchor clean.
  - Governance guard files (system-state-currency, ledgerAnchor, checkLedgerFork, governance-index-publication, qorSkipEmitter, qorlogic-config): 64 of 64 pass.

## Rationale

The #974 VETO rested only on S1, and S1 is gone by execution, not by assertion. The code evidence that #974 verified rests on bytes that have not changed since f4251d89. I re-executed the parts I rely on: patch custody, the bounded-read identity, the focused run, the two required mutations, the Razor, the eol attributes and the CI provenance.

On Step 4.6.14, the ladder names ABORT. The lint is miscalibrated for this consumer: 528 findings already exist at origin/main, and every seal in this repository has run with rc 1 as declared standing debt. The doctrine's Rule governs Qor-logic's own published artifacts. Its path class is "local paths that reveal an outside workspace or repository", and none of the 9 added findings is one; they are generic OS install paths and a placeholder. The remedy in N1 (per-line `boundary-lint: ok=` markers when those hash-committed records are next amended) stands. I do not treat this as a blocking ground, and I say so here rather than leaving it implicit.

## Non-blocking disclosures (carried into the seal entry)

N1, N3-N11 as in `SUBSTANTIATE.md`, re-verified where relied on (N1 counts, N7 locally, N11 by diff). N2 is resolved by U2. New in this run: N12 (secret_scanner line-number quirk: it reports META_LEDGER:30367 for physical line 32531), N13 (substantiate_gates needs `--skill`; substantiate-capability crashes), N14 (the SKIP and inapplicable list in the table), N15 (the GOVERNANCE_INDEX Tier 4 archive-at-seal rule is not performed, matching #968, because the ledger, intent lock and gates cite the plan path; owner decision).

## CI after the records push

No further Linux code-test evidence is required for the seal. The post-seal delta from f4251d89 is governance text plus `.qor/secret-scanner-allowlist` and `qor/references/glossary.md`, and no path under `FailSafe/` changes, so run 45118465441's merged tree equals the sealed FailSafe tree. The repository-side governance guards that read the edited documents are part of `test:node`; I ran them on the edited tree, and they must be re-run locally on the real records commit before the push. Do not use `ci:full` or `workflow_dispatch`. The PR's normal checks on its final head when it leaves draft are the merge gate, not seal evidence. Before pushing, confirm `git diff --stat f4251d89 <seal-commit> -- FailSafe/` is empty.

## Disposition

SEALED (pending the operator's ordered application of the edits and the seal commit). Not merged, released or tagged; no version bump.
