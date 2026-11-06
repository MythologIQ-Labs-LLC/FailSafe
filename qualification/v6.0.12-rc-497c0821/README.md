# v6.0.12 combined candidate: native qualification receipts

**Subject:** PR #623, `497c0821aa944ba07388fd14af3d66965a96bd68` (base `main` `e5b0aee9`).
This branch is that commit plus this folder only. It is evidence, not for merge.

- **Recorded:** 2026-11-06, Windows 11 Pro, Node 22.23.4.
- **Release decision:** NO-GO. Nothing is tagged, merged or published.

## 1. Governance (#467 / AGENTS.md)

| Check | Result | Receipt |
|---|---|---|
| qor-logic `governance-health` (0.176.1) | 8/8 OK | `governance/native-governance-497c0821.txt` |
| `verify-ledger --post-anchor` | clean at boundary #382; only disclosed pre-anchor residuals | same |
| FailSafe `check-ledger-anchor` (FX946) | exit 0: #914 epoch holds, prefix pin, reconciled set exact | same |
| External-record cross-check | 8/8 (see below) | `governance/witness-crosscheck-497c0821.json` |
| **G4 independent witness** | **BLOCKED** (see below) | — |
| **Release governance seal** | **BLOCKED** (see below) | — |

**External-record cross-check.** The candidate ledger was compared with two records:
- the published `v6.0.11` tag (commit `73eca5b4`, GitHub release published 2026-10-30T03:20:11Z);
- the GitHub-timestamped #467 decision comment (issuecomment-6513152200, 2026-10-30T02:04:39Z).

Results:
- The ledger is append-only since that tag.
- The band before #383 and the #914 block are unchanged, and the hash prefixes match the public record.
- This is **not** G4: there is no signature, no independent key custody and no witness outside GitHub and the maintainers.

**G4 independent witness.** #467 defines G4 as an append-only, signed, externally witnessed anchor. Only the operator can choose its key custody, witness location, cadence, revocation and recovery. Nothing was invented here.

**Release governance seal.** `docs/META_LEDGER.md` is byte-identical to v6.0.11; its last entry is #914. No `/qor-audit` PASS or `/qor-substantiate` seal exists for any v6.0.12 change, and AGENTS.md requires both before a release. No fourth ordinary audit was started.

**Native coverage finding.** qor-logic 0.176.1 `content_hash` hashes the referenced artifact file, not the entry text. In a copy of the ledger:
- flipping post-anchor entry #900's `**Verdict**` PASS→VETO still verifies "post-anchor clean";
- rewriting its `**Decision**` text also still verifies clean;
- removing #913's chain-hash markup is detected.

So the native chain protects the recorded hashes and their order, **not entry prose**. This is relevant to the #467/#473 claims and to the case for G4.

## 2. Qor-logic 0.176.1 conformance: NOT PASS (`qor-logic/`)

- **Provenance.** The wheel sha256 `dd6eec66…0e31` equals PyPI's 0.176.1 wheel. All 813 wheel `RECORD` entries are present and unchanged in the install (817 files hash-checked); the only extras are pip's `Scripts/*.exe` and `.pyc` files. `importlib.metadata` reports 0.176.1.
- **Harness** (`qor-conformance-0.176.1.json`, run in disposable folders): **15 pass, 4 fail.**
  - **Pass:** host `install_map` for claude, codex, kilo-code and gemini matches FailSafe. Cursor and cline are upstream-only and declared unmirrored. Base directories match. Unknown host or scope is refused. A real repo-scope install writes 32 skills, and uninstall removes them. Governance is clean on a copy. A removed chain-hash line is detected. An empty ledger is reported DAMAGED. An exact pin fails offline without a wheel, installs offline from the verified wheel, and is not satisfied by a different version.
  - **Fail:** `install --dry-run --json` is not supported. **Neither 0.169.0 nor 0.176.1 has `install --json` or `--include`**, so FailSafe's install preview has never matched the real CLI. Separately, production calls `previewInstall` without its deps, so the preview always degrades. That is P1. The other 3 failures are the prose-tamper negatives in section 1.
- **FX942 probe:**
  - `publication_boundary_lint` and `skill_size_budget_lint` are FALSIFIABLE.
  - `instruction_hygiene_lint` does not exist in 0.169.0 or 0.176.1. The probe called that a fixture problem; it is fixed on `fix/v6012-fx942-missing-control-20261106`.
  - `version_boundary` is UNTESTED (0.176.1 vs 0.169.0).
- **`TESTED_AGAINST_QOR_LOGIC_VERSION` stays `0.169.0`.**
- **Installer defect, governance-blocked:** `install()` runs `pip install --upgrade "qor-logic>=0.31.1"`. That is unbounded, and it silently upgrades an operator's install. The exact-pin correction needs the governance authorization the brief requires, and plan #466 has no audit PASS, so it was not implemented.

## 3. Installed-host acceptance

**Setup:**
- **Packages:** built from the clean candidate tree with `GITHUB_EVENT_NAME=push` and `GITHUB_REF=refs/heads/release/v6.0.12-rc2`. That is the candidate's own RC ref, so `validate-vsix` accepts the truthful unpublished-candidate README.
- **win32-x64 VSIX:** sha256 `0fab7f1d…7ccc` (`rv/SHA256SUMS.txt`).
- **Host:** clean **stable VS Code 1.141.1** (commit `7baac39ec3`), with a disposable HOME, USERPROFILE, user data and extensions. The external Console URL was captured through `workbench.externalBrowser` and opened in a separate Chromium.

| Area | Result | Receipt |
|---|---|---|
| Six themes live across the external Console, sidebar chrome and Monitor; settings sync; forged messages and keys; SRE switching; sidebar and window reload; high contrast; full restart | **30/30** | `installed-theme/` |
| Console WebSocket probes | 10/10 on `127.0.0.1` and on `localhost`; adversarial 2 authorized (101 + `init`) / 23 refused | `installed-theme/security/` |
| Theme write route with the real key | Every hostile variant refused | `installed-theme/security/theme-route-matrix.json` |
| Audio vault (#465) | **16/16** with the #505 save checks (consent, inventory, escapes, quota, junction, delete, persistence across a full restart) | `installed-audio-save/` |
| Editor save in Enforce mode (#505) | Policy denial shown ("write not prevented: AXIOM 1"); the bytes **are** written; no rollback after restart. Matches the disclosed observation-only contract; P0 open | same |
| Agent containment (#475) | See below | `agent-475/` |
| SQLite, upgrade, rollback | `rv lifecycle` 12/12 (published 6.0.11 `72f2d231…` → candidate: S1–S7, persistence, registries, no residual processes); `rv inventory` 50/50; `rv report` rehearsal-pass 62/62 | `rv/` |
| Bicameral, OpenHands, Sentry, Continue, Aider live providers | **UNVERIFIED**: not installed on this machine and no provider credentials | — |
| Real-profile monitor | No FailSafe writes under the real profile during these runs | `profile-watch/` |

**Agent containment (#475).** This used the real compiled wrapper with production deps and a hostile stand-in `aider.exe` (`aider.cs`, compiled locally). It is **not Aider**.
- **Unauthorized:** blocked before any execution, with nothing written.
- **Authorized:**
  - The in-worktree change is quarantined, not applied.
  - The agent **wrote outside the worktree**.
  - The outcome listed only the in-worktree file.
  - The escaped child was stopped.
- **The Apply dialog's `BOUNDARY_NOTE` discloses this.** P0 stays open.

## 4. Local gates (`gates/summary.txt`)

lint, `test:node` (938/956, 0 fail) and `test:ui` (253) all pass.

The extension-host suite on stable 1.141.1 had 36 failures:
- **34** are the known Windows teardown class, the same as the v6.0.11 tree.
- **2** are the B231 Windows symlink-privilege test, fixed test-only on `fix/v6012-b231-windows-linked-lock-test-20261106`.

**Still owed:** the extension-host suite on the pinned 1.122.1, either through CI or locally once the user's VS Code update completes.

## Tools (`tools/`)

The scripts used, so every result can be re-run. They are qualification tools, not shipped product.
