---
name: qor-substantiate
description: >-
  S.H.I.E.L.D. Substantiation and Session Seal that verifies implementation against blueprint and cryptographically seals the session. Use when: (1) Implementation is complete, (2) Ready to verify Reality matches Promise, (3) Need to seal session with Merkle hash, or (4) Preparing to hand off completed work.
metadata:
  category: governance
  author: MythologIQ
  source:
    repository: https://github.com/MythologIQ/Qor-logic
    path: qor/skills/governance/qor-substantiate
phase: substantiate
tone_aware: false
autonomy: interactive
gate_reads: implement
gate_writes: substantiate
permitted_tools: [Read, Grep, Glob, Bash, Edit, Write]
permitted_subagents: []
model_compatibility: [claude-opus-4-7]
min_model_capability: opus
---
# /qor-substantiate - Session Seal

<skill>
  <trigger>/qor-substantiate</trigger>
  <phase>substantiate</phase>
  <persona>Judge</persona>
  <output>Updated META_LEDGER.md with final seal, SYSTEM_STATE.md snapshot</output>
</skill>

## Governance Health Preflight

<!-- qor:governance-health-preflight -->
Run `qor-logic governance-health --profile skill-entry` before reading governance artifacts. If any finding is `DAMAGED` or `INCOMPLETE`, do not continue: report the finding's `path`, `reason`, and `legal_next`. Only `UNINITIALIZED` or scaffold-owned `MISSING` may be resolved by `qor-logic seed` (interactive: offer Y/N; autonomous: seed silently). `DAMAGED` and `INCOMPLETE` always route to `/qor-remediate` or section completion -- never to seed or bootstrap.

## Purpose

The final phase of the S.H.I.E.L.D. lifecycle. Verify that implementation matches the encoded blueprint (Reality = Promise), then cryptographically seal the session.

## Critical Invariants

The binding contracts /qor-substantiate cannot violate. ABORT halts the seal; the session does not seal until every invariant clears.

1. Step 4.6 reliability gates -> non-zero exit aborts substantiate. The ladder (intent-lock, secret-scanner, procedural-fidelity, dod-check, merge-velocity, skill-corpus-size-budget, data-api-acl, governance-index) extends forward; existing gates are not reordered.
2. Step 6.5 README badge currency check -> `|| ABORT` on drift.
3. Step 7.8 gate-chain completeness check -> `|| ABORT` on missing or mis-keyed gate artifacts.
4. Constraints section at file foot -> binding post-batch-1 contract inventory (verification-step requirement, dist-variant prohibition, load-bearing-gate preservation per the Phase 75 prerequisite-absent SKIP path).

See Step 4.6 for the reliability gate ladder, Step 6.5 for badge currency, Step 7.8 for gate-chain completeness, and the Constraints section at file foot for the post-batch-1 inventory.

## Environment (Phase 90 wiring; GH #79)

This skill invokes integrity gates via `qor-logic reliability <module>` / `qor-logic scripts <module>` (the bare `python -m qor.reliability.<module>` form is a valid in-venv fallback). The interpreter on PATH must have `qor-logic` importable; verify with `python -c "import qor.reliability"`. If that fails, activate the venv where `pip show qor-logic` resolves or `pipx install qor-logic`. On hosts where `qor-logic` is not installable, Phase 75 declarative-tolerance applies — missing-prerequisite gates record SKIP + emit `gate_skipped_prerequisite_absent` (`SG-HalfSealedClaim-A`). The Phase 90 preflight below surfaces the misconfiguration once at skill entry.

## Step Prerequisites (Phase 75 wiring; GH #38)

Each step declares its prerequisite so non-Python hosts can run `qor-logic substantiate-capability` to see which steps run vs skip on their archetype. When a prerequisite is absent, the operator records SKIP in the seal entry + emits a severity-1 `gate_skipped_prerequisite_absent` event. Rationale: `qor/references/doctrine-shadow-genome-countermeasures.md` SG-HalfSealedClaim-A.

| Step | Requires | Notes |
|---|---|---|
| 4.6 intent_lock + skill_admission + gate_skill_matrix | module:qor.reliability.intent_lock | Python reliability toolkit |
| 4.6.5 secret_scanner | module:qor.scripts.secret_scanner | OWASP LLM06 / NIST AI 600-1 §2.10 |
| 4.6.6 procedural_fidelity | module:qor.scripts.procedural_fidelity | WARN-only doc-surface coverage gap |
| 4.7 doc_integrity (strict) | module:qor.scripts.doc_integrity | tier-driven glossary + orphan + term-drift checks |
| 4.6.10 data_api_acl_lint | module:qor.scripts.data_api_acl_lint | Phase 121 fail-closed Data-API grant/definer-view scan (#177); absent migrations -> disclosed-skip |
| 4.7.5 governance_index enforce | module:qor.scripts.governance_index | Phase 120 fail-closed index enforcement (advance Last-Reviewed + unregistered/tier3-unarchived) |
| 6.5 doc currency + badge currency | module:qor.scripts.doc_integrity_strict | release-class badge ABORT (Phase 49) |
| 6.8 seal hash integrity gate | module:qor.scripts.hash_guard | Phase 64 fail-closed gate |
| 7.4 SSDF tagger | module:qor.scripts.ssdf_tagger | NIST SP 800-218A practice tag emission |
| 7.5 version bump | file:pyproject.toml | python-archetype release shape |
| 7.6 changelog stamp | file:CHANGELOG.md | Keep-a-Changelog Unreleased convention |
| 7.7 seal_entry_check | module:qor.reliability.seal_entry_check | post-seal entry consistency verification |
| 7.8 gate_chain_completeness | module:qor.reliability.gate_chain_completeness | phase ≥ 52 grandfather boundary |
| 8.5 dist recompile | module:qor.scripts.dist_compile | per-host variant compile |

Operators run `qor-logic substantiate-capability` before invoking `/qor-substantiate` to confirm which gates will run on their host. Output is a paste-able markdown table for the seal entry body.

## Execution Protocol

```bash
# Phase 90 preflight (GH #79): surface qor-logic module misconfiguration
# once at skill entry. WARN-only -- Phase 75 SKIP fallback still applies.
if ! python -c "import qor.reliability" 2>/dev/null; then
  echo "WARN [qor-logic]: modules not importable from $(command -v python). Steps with module: prerequisites will record SKIP per Phase 75. Activate the venv where 'pip show qor-logic' resolves, or 'pipx install qor-logic', to restore the integrity gates." >&2
fi
```

### Step 0: Gate Check (advisory — Phase 8 wiring)

Verify prior-phase artifact exists and is well-formed before proceeding.

```python
from qor.scripts import gate_chain, session

sid = session.get_or_create()
result = gate_chain.check_prior_artifact("substantiate", session_id=sid)
if not result.found:
    # Prompt user to override; on confirm:
    gate_chain.emit_gate_override(
        current_phase="substantiate",
        prior_phase_name="implement",
        reason="user override: implement.json not found",
        session_id=sid,
    )
elif not result.valid:
    gate_chain.emit_gate_override(
        current_phase="substantiate",
        prior_phase_name="implement",
        reason=f"user override: {result.errors}",
        session_id=sid,
    )
```

Override is permitted (advisory gate) but logged as a severity-1 `gate_override` event. **Phase 54**: when `emit_gate_override` raises `OverrideFrictionRequired`, prompt for a written justification (>=50 chars) and re-call with `justification=<text>`. Per `qor/references/doctrine-ai-rmf.md` §MANAGE-1.1 + `qor/references/doctrine-eu-ai-act.md` Art. 14.

### Step 1: Identity Activation
You are now operating as **The Qor-logic Judge** in substantiation mode.

Your role is to prove, not to improve. Verify what was built matches what was promised.

### Step 2: State Verification

```
Read: docs/META_LEDGER.md
Read: docs/ARCHITECTURE_PLAN.md
Read: .agent/staging/AUDIT_REPORT.md
```

**INTERDICTION**: If no PASS verdict exists:

<!-- qor:fail-fast-only reason="PASS verdict is /qor-audit output; cannot auto-heal" -->
Abort with "Cannot substantiate without PASS verdict. Run /qor-audit first."

**INTERDICTION**: If no implementation exists:

<!-- qor:fail-fast-only reason="implementation is /qor-implement output; cannot auto-heal" -->
Abort with "No implementation found. Run /qor-implement first."

### Step 2.5: Version Validation (MANDATORY)

**Verify version consistency** between plan and current state:

```bash
git tag --sort=-v:refname | head -1
```

```
Read: Plan file (docs/Planning/plan-*.md or docs/ARCHITECTURE_PLAN.md)
Extract: Target Version from plan header
```

<!-- qor:fail-fast-only reason="version-state checks are logic gates; require operator correction" -->
**INTERDICTION**: If Target Version ≤ Current Tag → ABORT (version already shipped).
**INTERDICTION**: If governance files reference wrong version → PAUSE (fix before sealing).

Log: "Version validated: v[current] → v[target] (change type: [hotfix|feature|breaking])"

### Step 3: Reality Audit

Compare implementation against blueprint:

```
Read: All files in src/
Compare: Against docs/ARCHITECTURE_PLAN.md file tree
```

Template: `references/qor-substantiate-templates.md`.

**Findings**:
- **MISSING**: Planned but not created -> FAIL
- **UNPLANNED**: Created but not in blueprint -> WARNING (document in ledger)
- **EXISTS**: Matches -> PASS

### Step 3.5: Blocker Verification

Read `docs/BACKLOG.md`. Warn if open Security Blockers or related Development Blockers exist.

### Step 4: Functional Verification

#### Test Audit
```
Glob: tests/**/*.test.{ts,tsx,js}
Read: Test files
```

Template: `references/qor-substantiate-templates.md`.

**Presence-only seal gate**: refuse to seal if any test added this phase is presence-only for the unit it claims to verify. Acceptance question per new test: "If the unit's behavior were silently broken but the artifact still existed, would this test fail?" Any "no" ABORTs seal — amend the test to invoke the unit and assert its output, then re-run. Per `qor/references/doctrine-test-functionality.md` + SG-035.

**Runtime-principal fidelity gate (Phase 121 wiring; GH #177)**: for any feature with a DB read/write reachable by a non-privileged caller (authenticated/anon), confirm at least one test exercises that path under the real caller role. A proof only under `service_role` / a `SECURITY DEFINER` RPC (which bypass RLS + GRANTs) ABORTs the seal — UNLESS the operator records an explicit coverage-gap note in the seal entry ("data path verified only under service_role; authenticated/RLS path deferred to manual QA") and emits a `gate_skipped_prerequisite_absent` event. Per `qor/references/doctrine-runtime-principal-fidelity.md`.

#### Visual Silence Verification (if frontend)
```
Grep: "color:" in src/**/*.{css,tsx}
Grep: "background:" in src/**/*.{css,tsx}
```

Check for violations:
Template: `references/qor-substantiate-templates.md`.

#### Console.log Artifacts
```
Grep: "console.log" in src/**/*
```

Template: `references/qor-substantiate-templates.md`.

### Step 4.5: Skill File Integrity Check

If any skill files (`.claude/commands/qor-*.md`) were modified during this session:

1. List modified skill files from git diff
2. For each modified skill:
   - Verify it still has required sections: `<skill>` block, `## Execution Protocol`, `### Step Z: Write Gate Artifact`, `## Constraints`, `## Next Step`
   - Verify the `## Next Step` section references valid successor skills
   - Log in ledger: "Skill file [name] modified — structure verified"

If any skill is missing required sections after modification:

```
PAUSE
Report: "Skill [name] missing required section: [section]. Fix before sealing."
```

### Step 4.6: Reliability Sweep (Phase 17 wiring)

**Prerequisite (Phase 75; GH #38)**: requires `module:qor.reliability.intent_lock` (SKIP path if absent per the Step Prerequisites table + `SG-HalfSealedClaim-A`).

Three reliability enforcement gates run sequentially. Each is an interdiction: non-zero exit aborts substantiation.

```bash
# session_id via canonical helper (reads .qor/session/current; validates SESSION_ID_PATTERN, Phase 23/50)
SESSION_ID=$(python -c "from qor.scripts.session import current; print(current() or 'default')")

# Re-verify the intent lock from /qor-implement Step 5.5 (fails on plan/audit/HEAD drift).
qor-logic reliability intent_lock verify --session "$SESSION_ID" || ABORT
# Current skill registered + frontmatter well-formed.
qor-logic reliability skill_admission qor-substantiate || ABORT
# All /qor-* handoff references resolve to real skills.
qor-logic reliability gate_skill_matrix || ABORT
# Phase 106: WARN-only session-ID convention lint (catches fall-through-to-'default').
qor-logic scripts session_id_lint || true
```

Any ABORT leaves the session unsealed. Operator must resolve the drift (re-audit, re-admit, or fix broken handoff) and re-run substantiation.

### Step 4.6.5: Secret-scanning gate (Phase 56 wiring)

**Prerequisite (Phase 75; GH #38)**: requires `module:qor.scripts.secret_scanner` (SKIP path if absent per the Step Prerequisites table + `SG-HalfSealedClaim-A`).

Pre-seal scan over staged content. ABORTs on any detected secret (operator remediates: remove from staging, redact, or allowlist a literal-match false-positive). Closes OWASP LLM06 + NIST AI 600-1 §2.10.

```bash
qor-logic scripts secret_scanner --staged --out dist/secrets.findings.json || ABORT
```

Rationale (Cedar `has_hardcoded_secrets` attribute, gitleaks-v8 findings schema): `references/seal-gate-ladder.md`.

### Step 4.6.6: Procedural-fidelity check (Phase 58 wiring)

Static-analysis pass over the implement-gate `files_touched` set. WARN-only: deviations append severity-2 events but do NOT abort. Catches the doc-surface coverage gap (skill/script/doctrine/schema changes without a `docs/SYSTEM_STATE.md` / `operations.md` / `architecture.md` / `lifecycle.md` update).

```bash
qor-logic scripts procedural_fidelity --session "$SESSION_ID" \
  --out dist/procedural-fidelity.findings.json
```

Four-class deviation catalog + remediation: `qor/references/doctrine-procedural-fidelity.md` (rationale in `references/seal-gate-ladder.md`).

### Step 4.6.7: Definition of Done check (Phase 92 wiring; GH #86)

WARN-only structural check that the plan's `## Definition of Done` section is well-formed (every deliverable declares D1 vision / D2 code / D3 governance / D4 empirical, or a `D4.d` waiver with rationale + follow-up phase). V1 enforces presence only.

```bash
PLAN_PATH=$(python -c "from qor.scripts.governance_helpers import current_phase_plan_path; print(current_phase_plan_path())")
qor-logic scripts dod_check --plan "$PLAN_PATH" || true
```

`PLAN_PATH` is argv-only (SG-Phase47-A). Findings (`missing-dod-section`, `deliverable-missing-tier`, `waiver-without-rationale`, `waiver-without-followup`) do NOT abort. Per `qor/references/doctrine-definition-of-done.md` + `SG-DoDImplicit-A`; rationale in `references/seal-gate-ladder.md`.

### Step 4.6.8: Merge-velocity throttle check (Phase 93 wiring; GH #89; fail-closed since Phase 129, GH #153)

Fail-closed throttle on stabilization-capacity strain from `origin/main`'s recent merge history (throughput / branch integration / shared-surface expansion exceeding the rate the project can reliably absorb).

```bash
qor-logic scripts merge_velocity_check --repo-root . --window-days 7 || ABORT
```

Exits 0 on `healthy`/`strained`, 1 on `exceeded` (ABORTs; Phase 129 removed the `|| true`). To seal during a deliberate high-velocity window, re-run with `--override` (logged `gate_override` shadow event, `details.gate = merge_velocity_check`). `--shared-core-path` patterns add shared-surface signals. Bicameral originating recurrence + `SG-MergePaceThrottle-A`: `references/seal-gate-ladder.md`.

### Step 4.6.9: Skill-corpus size-budget lint (Phase 95 wiring; GH #92)

WARN-only per-skill size-budget lint over `qor/skills/**/SKILL.md` (WARN at 25 KB, EXCEEDED at 40 KB).

```bash
qor-logic scripts skill_size_budget_lint --skills-root qor/skills || true
```

Does not abort; CLI exits 1 when any EXCEEDED finding is present so V2 can convert to a hard ABORT by removing the `|| true`. Operator-actionable: skills over WARN are progressive-disclosure-refactor candidates (move sub-pass/step prose to `references/`). Per `SG-SkillCorpusGrowth-A`; the corpus-growth history is in `references/seal-gate-ladder.md`.

### Step 4.6.10: Data-API access-control lint (Phase 121 wiring; GH #177)

**Prerequisite (Phase 75; GH #38)**: requires `module:qor.scripts.data_api_acl_lint`; no-SQL-migration repos print `SKIP:` and exit 0 (disclosed-skip — record SKIP + emit `gate_skipped_prerequisite_absent`).

Static scan over the target repo's SQL migrations. Fail-closed on blocking findings (`missing-grant` — an API-schema `CREATE TABLE` with no `GRANT` to authenticated/anon and no service-role-only marker; `definer-view` — a view without `security_invoker = true`); `security-definer-fn` is advisory. Closes the GH #177 privileged-principal false-PASS surface.

```bash
qor-logic scripts data_api_acl_lint --repo-root . || ABORT
```

Escapes: `-- qor:service-role-only` and `-- qor:definer-view-intended reason: ...`. No-migration repos print `SKIP:` and exit 0 (disclosed-skip). Full contract: `qor/references/doctrine-runtime-principal-fidelity.md`; rationale in `references/seal-gate-ladder.md`.

### Step 4.7: Documentation Integrity Check (Phase 28 wiring)

**Prerequisite (Phase 75; GH #38)**: requires `module:qor.scripts.doc_integrity` (SKIP path if absent per the Step Prerequisites table + `SG-HalfSealedClaim-A`).

Read the plan artifact and run doc-integrity checks against the declared tier. ABORTs on any `ValueError` per `qor/references/doctrine-documentation-integrity.md` (no silent override; `legacy` tier bypasses all checks).

```python
from qor.scripts import doc_integrity, gate_chain

plan_artifact = gate_chain.read_phase_artifact("plan", session_id=sid)
# plan_slug derived from plan_path filename stem (e.g., plan-qor-phase28-<slug>.md)
plan_artifact["plan_slug"] = derive_slug_from_plan_path(plan_artifact["plan_path"])
doc_integrity.run_all_checks_from_plan(plan_artifact, repo_root=".", strict=True)  # Phase 32 wiring: D/E strict-mode
```

Any raised `ValueError` ABORTs substantiation. Operator fixes (update glossary / adjust declared terms / raise tier) and re-runs. No retry-with-waiver path.

### Step 4.7.5: Governance Index enforcement (Phase 120 wiring; GH #149)

**Prerequisite (Phase 75; GH #38)**: requires `module:qor.scripts.governance_index` + `file:docs/GOVERNANCE_INDEX.md`; absent-index hosts print `SKIP` and exit 0 (disclosed-skip — record SKIP + emit `gate_skipped_prerequisite_absent`).

Makes the Hierarchical Governance Index self-policing (closes #140's deferred enforcement half). The gate auto-advances `Last Reviewed` to the seal date (clearing `stale-tier1`) and then **fail-closes** on residual drift: `unregistered` (a governance doc named in no tier) and `tier3-unarchived` (a Tier 3 row naming an already-SESSION-SEALed `phase <N>`).

```bash
SEAL_DATE=$(python -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).strftime('%Y-%m-%d'))")
qor-logic governance-index --advance-last-reviewed "$SEAL_DATE" --enforce --repo-root . || ABORT
```

On non-zero exit, the operator registers the new doc to a tier or archives the sealed Tier 3 row, then re-runs. The advanced `docs/GOVERNANCE_INDEX.md` is staged with the seal commit. Per `qor/references/doctrine-governance-index.md` "V2 (Phase 120; GH #149) -- shipped enforcement"; rationale in `references/seal-gate-ladder.md`.

### Step 5: Section 4 Razor Final Check

Template: `references/qor-substantiate-templates.md`.

### Step 6: Sync System State

Map the final physical tree:

```
Glob: src/**/*
Glob: tests/**/*
Glob: docs/**/*
```

Create/Update `docs/SYSTEM_STATE.md`:

Template: `references/qor-substantiate-templates.md`.

#### FEATURE_INDEX verification pass (Phase 73 wiring; GH #40)

When `FEATURE_INDEX.md` exists in the repo, verify every declared feature after re-syncing the system tree:

1. For each non-`n/a` row, verify the cited `Test path` exists.
2. Verify the cited test invokes the feature (not presence-only -- inherits `doctrine-test-functionality.md` acceptance question at feature scope).
3. Verify the cited test currently passes.
4. Surface counts in the SESSION SEAL ledger entry body:
   `**Feature Inventory**: Total: N / verified: V / unverified: U / n/a: A`
5. List newly unverified entries (regression from prior seal) with explicit names:
   `**Newly unverified**: FX091, FX093, ...`
6. Run the regression ABORT (Phase 114; fail-closed since Phase 122, GH #155/#40):
   `qor-logic scripts feature_index_verify --snapshot <prior-seal-session-id> --repo-root . || ABORT`
   Non-zero exit aborts on an outside-scope `verified->unverified` regression. To accept a known regression, re-run with `--override` (logged `gate_override` shadow event, `details.gate = feature_index_verify`).
7. Surface-tag lint (GH #196), WARN-only: `qor-logic scripts feature_index_verify --surface-lint --session "$SESSION_ID" --repo-root .`. See `references/seal-gate-ladder.md`.

Repos without `FEATURE_INDEX.md` record `**Feature Inventory**: not adopted` and skip the pass (`qor.scripts.feature_index_verify` prints `feature_index: skip`). Per `qor/references/doctrine-feature-inventory.md` + `qor/references/doctrine-verification-closure-integrity.md`.

#### Acceptance-criteria close guard (Phase 114; GH #158, WARN-first)

Before composing the PR body (Step 9.6), run the close guard over the issues this seal will close:
`qor-logic scripts ac_close_guard --pr-body-file <planned-pr-body> --qa-session <session-id>`
It parses each `Closes #N` target's AC checklist and WARNs when an unmet criterion has no linked follow-on or the `qa.json` verdict is not PASS. V1 WARN-first (exit 0); `--enforce` reserved for V2. Contract + QA evidence artifact: `qor/references/doctrine-verification-closure-integrity.md`.

### Step 6.5: Documentation Currency Check (Phase 31 wiring)

**Prerequisite (Phase 75; GH #38)**: requires `module:qor.scripts.doc_integrity_strict` (SKIP path if absent per the Step Prerequisites table + `SG-HalfSealedClaim-A`).

Verify that doc-affecting phase changes also updated the system-tier docs (`docs/architecture.md`, `docs/lifecycle.md`, `docs/operations.md`, `docs/policies.md`). Heuristic lives in `doc_integrity_strict.check_documentation_currency` and returns a warning list.

```python
from qor.scripts import gate_chain
from qor.scripts.doc_integrity_strict import check_documentation_currency

implement = gate_chain.read_phase_artifact("implement", session_id=sid)
plan_artifact = gate_chain.read_phase_artifact("plan", session_id=sid)
warnings = check_documentation_currency(
    implement, repo_root=".", plan_payload=plan_artifact,  # Phase 33 wiring: release-doc rule
)
if warnings:
    print("WARNING: Documentation currency check:")
    for w in warnings: print(f"  {w}")
    # Phase 31 semantics: WARN + continue. Future phase may upgrade to BLOCK.
```

Phase 33 addition: when `change_class` is `feature`/`breaking`, the check also requires README.md + CHANGELOG.md in `files_touched` (hotfix exempt). Operator judgment: continue on spurious warnings; PAUSE + amend on legitimate ones (new doctrine without a lifecycle.md update, feature shipped without release-doc authoring).

**Phase 49 addition: README badge currency (release-class only, ABORT semantics)**. When `change_class` is `feature`/`breaking`, parse the README literal-count badges (Tests, Ledger, Skills, Agents, Doctrines) against current truth and ABORT on mismatch (hotfix exempt):

```bash
if [[ "${CHANGE_CLASS}" == "feature" || "${CHANGE_CLASS}" == "breaking" ]]; then
  qor-logic scripts badge_currency \
    --repo-root . \
    --ledger docs/META_LEDGER.md \
    || { echo "ABORT: README badge currency mismatch — update Tests/Ledger/Skills/Agents/Doctrines counts to match truth before re-running /qor-substantiate"; exit 1; }
fi
```

The exit-1 ABORT distinguishes Phase 49 enforcement from the Phase 31 WARN above. Locked by `tests/test_readme_badge_currency.py` + `tests/test_substantiate_badge_currency_wiring.py` per `qor/references/doctrine-governance-enforcement.md` §"Badge currency".

### Step 6.8: Seal Hash Integrity Gate (Phase 64 wiring - GH #48)

Before Step 7 computes or records any seal hash, validate every hash value that will enter the ledger body. Fail-closed: no override path, not governed by Phase 47 skip semantics — cryptographic evidence must always be validated.

**Preparation (run BEFORE the validation block):** compute the four seal-critical hashes via the canonical helpers so `merkle_seal`, `content_hash`, `previous_hash`, `chain_hash` exist — `hash_guard.hash_file(path).sha256` for file digests, `ledger_hash.content_hash(path)` for the entry's content digest, `ledger_hash.chain_hash(content, previous)` for the chain digest. Do not pattern-fill hex strings or interpolate placeholders; the block below catches any digest the helpers did not actually produce.

```python
from qor.scripts.hash_guard import (
    require_toolkit_modules,
    validate_sha256,
)

require_toolkit_modules(
    ("qor.scripts.ledger_hash", "qor.scripts.hash_guard")
)

# Validate every hash value that Step 7 will write into the SESSION SEAL
# entry. Order matches the ledger entry layout. Each variable was produced
# by the helpers named in the Preparation paragraph above.
validate_sha256(merkle_seal,   label="merkle_seal")
validate_sha256(content_hash,  label="content_hash")
validate_sha256(previous_hash, label="previous_hash")
validate_sha256(chain_hash,    label="chain_hash")
```

Any raised `ValueError`/`RuntimeError` (missing toolkit or invalid hash) ABORTs: the operator installs the helper modules, regenerates the hash via `qor-logic scripts ledger_hash hash <path>`, or amends the fabricated value to a real digest, then re-runs. Per `qor/references/doctrine-governance-enforcement.md` (Seal Hash Integrity Gate).

### Step 7: Final Merkle Seal

**Phase 76 wiring (GH #51)**: each new SESSION SEAL entry body MUST include an `**Entry ID**: \`<12-char-hex>\`` line derived via `entry_id.derive_entry_id(ts, phase, content_hash)` — content-addressable, so it survives concurrent federation append without entry-number coordination. Forward-only (Entries #1-#207 unchanged). See `qor/scripts/entry_id.py`; `QOR_ENTRY_ID_FULL_HASH=1` for 64-char mode.

Calculate session seal:

Reference implementation: `.claude/commands/scripts/calculate-session-seal.py`.

Update `docs/META_LEDGER.md`:

Template: `references/qor-substantiate-templates.md`.

### Step 7.4: SSDF tag emission (Phase 52 wiring)

Computes NIST SSDF practice tags for the SESSION SEAL entry body BEFORE Step 7 computes content_hash. Forward-only: Phase 52+ entries get tags; Phase <= 51 grandfathered. Closes G-1 from `docs/compliance-re-evaluation-2026-04-29.md`.

```bash
# Compute SSDF tag line via pure-Python module (no python -c shell-variable
# interpolation; SG-Phase47-A countermeasure). $CHANGE_CLASS is consumed only
# as an argv argument and argparse-validated against {feature, breaking, hotfix}.
CHANGE_CLASS=$(python -c "from qor.scripts.governance_helpers import parse_change_class, current_phase_plan_path; print(parse_change_class(current_phase_plan_path()))")
SSDF_LINE=$(qor-logic scripts ssdf_tagger --change-class "$CHANGE_CLASS" --base-ref origin/main --repo-root .)
```

Operator pastes `$SSDF_LINE` into the SESSION SEAL entry body before Step 7 computes content_hash. Per `qor/references/doctrine-nist-ssdf-alignment.md` §"Phase 52 wiring (forward-only emission)".

### Step 7.5: Version bump (Phase 13 wiring; Phase 33 split)

**Prerequisite (Phase 75; GH #38)**: requires a supported version manifest — `file:pyproject.toml` OR `file:package.json` OR `file:Cargo.toml`; only when NONE is present does the step record SKIP + emit `gate_skipped_prerequisite_absent`. Phase 133 (GH #163) made the bump **pluggable** via `qor.scripts.version_backends` (detects python/node/rust). Tag creation is at Step 9.5.5 after the seal commit (Phase 33). Backend + off-by-one rationale: `references/release-and-tag-timing.md`.

```python
# Phase 13 wiring + Phase 133 pluggable backends (#163). Tag creation deferred to Step 9.5.5.
from qor.scripts import governance_helpers as gh, version_backends
from pathlib import Path

plan_path = gh.current_phase_plan_path()              # V-5: lexicographic suffix
phase_num, slug = gh.derive_phase_metadata(plan_path) # W-3: derive before use
change_class = gh.parse_change_class(plan_path)       # V-2: bold-form enforced
# version_backends.bump delegates the python path to gh.bump_version (unchanged
# tag-collision + downgrade interdiction); node/rust reuse the same guards.
new_version, backend = version_backends.bump(Path("."), change_class)
```

### Step 7.6: Stamp CHANGELOG (Phase 27 wiring)

After the version bump in Step 7.5 produces `new_version` and the seal date is known, stamp `CHANGELOG.md` in place via the **pluggable changelog backend** (Phase 133; GH #163) so non-keepachangelog repos are handled too:

```python
from qor.scripts import changelog_backends
from datetime import datetime, timezone
from pathlib import Path

changelog_backends.stamp(
    Path("CHANGELOG.md"),
    new_version,
    datetime.now(timezone.utc).strftime("%Y-%m-%d"),
)
```

`changelog_backends.stamp` detects the format: a `## [Unreleased]` section delegates to `changelog_stamp.apply_stamp` (keepachangelog — raises `ValueError` on missing/empty Unreleased or a `[new_version]` collision; PAUSE and fix, do NOT silently ship an unstamped CHANGELOG); otherwise the `prepend` backend inserts a `## v<version> - <date>` section near the top. Per `qor/references/doctrine-changelog.md`; backend detail in `references/release-and-tag-timing.md`.

### Step 7.7: Post-seal verification (Phase 47 wiring)

**Prerequisite (Phase 75; GH #38)**: requires `module:qor.reliability.seal_entry_check` (SKIP path if absent per the Step Prerequisites table + `SG-HalfSealedClaim-A`).

Runs *after* Step 7 has appended the SESSION SEAL entry. Verifies the entry exists for this phase and the latest chain hash is internally consistent — closes SG-AdjacentState-A (substantiate sealing without writing the ledger entry, which the pre-seal Step 4.6 gates cannot catch). **Phase 76 (GH #51)** adds a `previous_hash uniqueness` pass (`check_previous_hash_uniqueness(ledger_path, min_entry_num=207)`): duplicate `previous_hash` signals a concurrent federation race -> reconcile per `SG-ConcurrentLedgerRace-A` (pre-Phase-76 entries grandfathered).

```bash
PLAN_PATH=$(python -c "from qor.scripts.governance_helpers import current_phase_plan_path; print(current_phase_plan_path())")

qor-logic reliability seal_entry_check --ledger docs/META_LEDGER.md --plan "$PLAN_PATH" || ABORT
```

The `python -c` source is hardcoded (no shell-variable interpolation; OWASP A03 closed by construction); argv-form throughout. ABORT on non-zero exit leaves the session unsealed — amend the ledger (or re-run Step 7) and re-run.

### Step Z: Write Gate Artifact (Phase 11D wiring)

Persist the gate artifact at `.qor/gates/<session_id>/substantiate.json`. Written here (after Step 7's seal entry, before Step 7.8) so gate-chain completeness can verify it. Session rotation is deferred to Step 9.8 — rotating now would repoint `.qor/session/current` and break `SESSION_ID` for the remaining steps.

```python
from qor.scripts import gate_chain, shadow_process, ai_provenance

# Build payload conforming to qor/gates/schema/substantiate.schema.json
payload = {
    "ts": shadow_process.now_iso(),
    # ... phase-specific required fields (see schema)
}
manifest = ai_provenance.build_manifest(
    "substantiate",
    human_oversight=(
        ai_provenance.HumanOversight.PASS if payload.get("verdict") == "PASS"
        else ai_provenance.HumanOversight.VETO
    ),
)
gate_chain.write_gate_artifact(
    phase="substantiate", payload=payload, session_id=sid, ai_provenance=manifest,
)
```

Schema at `qor/gates/schema/substantiate.schema.json` validates before write. Per Phase 54 the seal verdict maps to `HumanOversight` (EU AI Act Art. 14).

### Step 7.8: Gate-chain completeness check (Phase 52 wiring)

Closes the skill-protocol bypass surface. Walks SESSION SEAL entries with phase >= 52 in `docs/META_LEDGER.md`; for each, asserts `.qor/gates/<sid>/{plan,audit,implement,substantiate}.json` all exist. ABORTs seal on any gap. Phase ≤ 51 entries grandfathered.

```bash
QOR_SKILL_ACTIVE=substantiate qor-logic reliability gate_chain_completeness \
  --repo-root . \
  --phase-min 52 \
  || { echo "ABORT: gate-chain completeness violated; bypass would be invisible to ledger math"; exit 1; }
```

Argv-form; no shell-variable interpolation (SG-Phase47-A). Runs after Step 7.7 confirms ledger integrity, ensuring this phase's session has all four gate artifacts before the seal commit lands.

### Step 8: Cleanup Staging

Clear: `.agent/staging/` (transient working directory).

Preserve only the final AUDIT_REPORT.md (or archive it).

### Step 8.5: Dist Recompile (Phase 30 wiring)

**Prerequisite (Phase 75; GH #38)**: requires `module:qor.scripts.dist_compile` (SKIP path if absent per the Step Prerequisites table + `SG-HalfSealedClaim-A`).

Rebuild variant outputs so the seal cannot complete with dist drift against source skills.

```bash
qor-logic scripts dist_compile
```

On non-zero exit, ABORT substantiation; operator must resolve compile errors and re-run seal.

### Step 9: Final Report

Template: `references/qor-substantiate-templates.md`.

### Step 9.5: Stage Artifacts (for user commit)

  **Stage All Artifacts**:
  ```bash
  git add CHANGELOG.md
  git add docs/CONCEPT.md
  git add docs/ARCHITECTURE_PLAN.md
  git add docs/META_LEDGER.md
  git add docs/SYSTEM_STATE.md
  git add docs/BACKLOG.md
  git add src/
  ```

  **Next Steps**: Review the staged files and then commit and push when ready.

  Example commit message — it MUST end with the full
  `qor.scripts.attribution.commit_trailer()` output (the `Authored via
  [Qor-logic SDLC]` line AND `Co-Authored-By:`); the compact `Co-Authored-By:`-only
  form is NOT acceptable on a seal commit (Step 9.5.4 verifies this).
  ```
  seal: [plan-slug] - Session substantiated
  Merkle seal: [chain-hash]
  Verdict: PASS
  Files: [file-count]

  [full commit_trailer() output: the Authored via line, a blank line,
   then the Co-Authored-By line]
  ```

REPORT: "Session committed and pushed to [current-branch]"

### Step 9.5.4: Seal-commit trailer verification (Phase 85 wiring; GH #96)

After the seal commit exists (Step 9.5) and before the annotated tag (Step 9.5.5), verify the seal commit message carries the full canonical attribution trailer.

```bash
qor-logic scripts seal_trailer_check --commit HEAD || ABORT
```

On non-zero exit, ABORT before tagging: amend the seal commit to contain the full trailer (see Step 9.5 example), then re-run from Step 9.5. Delegates to `qor.scripts.attribution.message_has_full_trailer`. Per `qor/references/doctrine-attribution.md` §"Tiered usage"; history in `references/release-and-tag-timing.md`.

### Step 9.5.5: Annotated seal-tag creation (Phase 33 wiring)

The seal commit now exists (created in Step 9.5). Capture its SHA via `git rev-parse HEAD` and tag it (this timing closes the off-by-one bug where tagging at Step 7.5 targeted the pre-seal HEAD).

```python
import subprocess
from qor.scripts import governance_helpers as gh

commit_sha = subprocess.run(
    ["git", "rev-parse", "HEAD"],
    capture_output=True, text=True, check=True,
).stdout.strip()

tag = gh.create_seal_tag(
    new_version, merkle_seal, ledger_entry_num, phase_num, change_class,
    commit=commit_sha,
)
```

`commit` is required — no HEAD-default; calling without it raises `TypeError` (verified by `tests/test_seal_tag_timing.py::test_create_seal_tag_raises_without_commit`). Off-by-one history: `references/release-and-tag-timing.md`.

### Step 9.6: Push/Merge Options (Phase 13 — 4-option menu)

Prompt user with four options (never offer continuation menus when work is sealable; the next decision is push/merge, not "what next phase"):

1. **Push only** — `git push origin <branch>`.
2. **Push + open PR** — `gh pr create` (description must cite plan file, ledger entry `#<n>`, and Merkle seal hash per `doctrine-governance-enforcement.md` §6).
3. **Merge to main locally (dry-run first)** — `git merge --no-commit --no-ff <branch>`; on conflict, abort and prompt operator.
4. **Hold local** — no push/merge this session.

The annotated tag (Step 9.5.5) is NOT pushed here — push the branch only; Step 9.7 pushes the tag after the seal commit reaches `origin/main`.

Template: `references/qor-substantiate-templates.md`.

### Step 9.7: Post-merge seal-tag push (Phase 86 wiring; GH #98)

The tag stays local until the seal commit is on `origin/main`. Push it only after the seal commit reaches `origin/main`, gated on the same reachability check `release.yml` uses:

```bash
git fetch origin main
if git merge-base --is-ancestor "$SEAL_COMMIT" origin/main; then
  git push origin "$SEAL_TAG"
else
  echo "Seal commit not on origin/main yet; tag $SEAL_TAG held local. Push after merge: git push origin $SEAL_TAG"
fi
```

Run after the merge (option 3: after `git push origin main`; option 2: after PR merge; options 1/4: later). Detail: `references/release-and-tag-timing.md`.

### Step 9.8: Session Rotation (Phase 30 wiring)

The final action of the seal. Rotate the session so the next `/qor-plan` starts with a clean gate directory. Run LAST — after every Step 7.x-9.7 command that resolves `SESSION_ID` from `.qor/session/current`.

```python
import session
new_sid = session.rotate()  # prior artifacts preserved at .qor/gates/<old-sid>/
```

## Failure Scenarios

### If Reality != Promise:

Template: `references/qor-substantiate-templates.md`.

## Constraints

- **NEVER** seal a session with Reality != Promise
- **NEVER** skip a verification step whose prerequisite is PRESENT. The Phase 75 prerequisite-absent SKIP path (record SKIP in the seal entry + emit `gate_skipped_prerequisite_absent`; see `## Step Prerequisites` block and `SG-HalfSealedClaim-A`) is the only sanctioned exit and applies only when the per-step Prerequisite directive's named module/file is unreachable. A reachable-but-undesired verification step MUST run.
- **NEVER** seal with Section 4 violations present
- **NEVER** seal with version mismatch (Target ≤ Current Tag)
- **ALWAYS** validate version before sealing
- **ALWAYS** update SYSTEM_STATE.md before sealing
- **ALWAYS** calculate proper chain hash
- **ALWAYS** document any unplanned files in ledger
- **ALWAYS** verify chain integrity before sealing
- **ALWAYS** call `governance_helpers.bump_version` at Step 7.5 and `governance_helpers.create_seal_tag` at Step 9.5.5 (after the seal commit); never author tags manually and never tag at Step 7.5 (SG-Phase33-A: tagging before commit targets the pre-seal HEAD, producing off-by-one tags).
- **NEVER** push the seal tag before the seal commit is reachable from `origin/main` (GH #98): tag creation is Step 9.5.5 (pre-merge), tag push is Step 9.7 (post-merge). Pushing the tag with the branch fails `release.yml`'s `build-and-publish` guard and blocks the seal PR.
- **ALWAYS** run `qor-logic scripts dist_compile` at Step 8.5 so variant outputs are rebuilt on seal; prevents dist drift.
- **ALWAYS** call `session.rotate()` at Step Z after writing `substantiate.json`; prior session directory preserved for archaeology.

## Success Criteria

Substantiation succeeds when:

- [ ] PASS verdict exists in AUDIT_REPORT.md
- [ ] Version validated (Target > Current Tag)
- [ ] Reality matches Promise (all planned files exist, no missing)
- [ ] Open security blockers reviewed
- [ ] Test audit completed
- [ ] Section 4 Razor final check passed
- [ ] SYSTEM_STATE.md synced with actual file tree
- [ ] Merkle seal calculated and recorded in META_LEDGER
- [ ] Session committed and pushed
- [ ] Merge/PR/tag options presented to user

## Integration with S.H.I.E.L.D.

Session Seal: cryptographic proof that Reality matches Promise — a version gate, a file-by-file Reality Audit against the blueprint, and Merkle hash-chain finalization in META_LEDGER.
