# Issue #696: test correction verified, delivery blocked

Source base: `0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc`.
Branch: `fix/696-g4-fixture-cli`, isolated worktree.
Node 22.23.5, npm 10.9.9. Product version remains 6.0.13.

## Native authority

Fresh-context independent native audit: **PASS, L3**. The reviewer substantively
accepted `change_class: governance` only for this non-release governance test
harness correction, not the release-class dependency work.
Session: `2026-11-16T2154-926a3e`. Plan SHA256:
`6b909cdfd573271a6df7c247d59c9909342e9cc39c01db7c02e41a19ceeaca01`.
Report SHA256: `b6530a3387f57b75971d4edb645595ec902f9829b762e4cd58083bafd1309476`.
The native runtime emitted plan/audit/implement artifacts with provenance;
gate JSON was not hand-written. Native fragment/renderer APIs recorded the
ledger. No previous VETO was changed or overridden.

## Implemented change

Only `FailSafe/extension/src/test/scripts/g4Witness.test.cjs` changes in
application/test source. It reuses existing g4Scenario buildBase/initRepo/copyRepo
helpers and actual CLI subprocesses. Generated temporary-root teardown checks
the resolved parent and expected prefix before recursive removal.

- Disposable unwitnessed Git fixture: exact **BLOCKED NO_CHECKPOINTS / exit 2**,
  and no PASS output.
- Disposable known-good witnessed fixture: exact **PASS OK / exit 0**, with
  **diagnostic (NOT release evidence)** explicitly asserted.

The verifier, live witness, production keys, TSA trust, workflows, package
manifest/lock and release assets are unchanged. Test-only PKI stays disposable.
The modified test file is 163 lines; added callbacks remain below 40 lines.

## Executed checks

| Command/scope | Actual result |
| --- | --- |
| Unrestricted unchanged g4Witness baseline | exit 1: 10 tests, 9 pass, 1 stale assertion failure |
| Corrected g4Witness test | exit 0: 11 pass, zero failures/skips |
| All existing g4*.test.cjs suites | exit 0: 164 pass, zero failures/skips, including tamper refusals |
| npm ci, unchanged pinned lock | exit 0; 708 packages installed |
| npm run compile | exit 0 |
| npm run lint | exit 0: zero errors, 136 warnings |
| Native post-anchor ledger verification | exit 0 at declared boundary #382 |
| Full prepush-validate.ps1 / test:all | INCONCLUSIVE, interrupted after disposable extension host became unresponsive |
| Native substantiation documentation gate | exit 1: ValueError for existing missing glossary home |

The full pre-push gate passed branch policy, compile, source release metadata,
lint, runner coverage (762 files claimed) and citation structure checks, then
ran the real source extension-host tests using repository-pinned VS Code
1.122.1. It stopped producing test progress after reporting extension host
PID 32720 unresponsive. The already-blocked run was cancelled using its managed
session; an owner-context executable-path check found no surviving processes
under this worktree's isolated .vscode-test directory. No operator editor was
stopped. No final extension-host/full-suite passing count exists. The later
Node/UI/VSIX gate stages were not completed. This is not a packaged installed
host acceptance or a successful full gate.

The initial restricted targeted run also hit sandbox TPM-provider restrictions;
the unrestricted baseline distinguished that environment failure from #696.
Logs remain local beside this report and were not uploaded blindly.

## Mandatory stop: native substantiation Step 4.7

Exact native API invocation, through installed frozen qor-logic 0.176.1:

```python
plan = gate_chain.read_phase_artifact("plan", session_id=sid)
plan["plan_slug"] = Path(plan["plan_path"]).stem
doc_integrity.run_all_checks_from_plan(plan, repo_root=".", strict=True)
```

Actual error:

```text
ValueError: Orphan home: 'Vacuous pass' ->
'.failsafe/governance/RESEARCH_BRIEF_qor169-alignment-2026-09-03.md'
does not exist.
```

The native skill requires ABORT on this ValueError with no retry-with-waiver.
No tier downgrade, fake brief, glossary deletion, seal, delivery PASS or release
was substituted. The source-level correction is locally preserved but #696
remains unqualified for delivery. No PR, push, merge or CI dispatch occurred.

Lawful next action: establish the truthful glossary home/authority and repair
that governance defect under its own approved native plan/audit; then rerun
substantiation, full local tests and host/package qualification at the exact
candidate revision. Do not infer approval from these passing targeted tests.

## Other lanes

Qortara #331 isolated current-main resolver tests: 101 passed, 1 skipped.
The additional mandatory Windows-junction containment probe failed: a declared
manifest path reached a sibling outside the consumer root and its version was
accepted for a dry-run bump. Source correction and successor authority proof
stopped there; no predecessor skill was changed or accepted.

Consequently #695 has no new release-class native PASS and no dependency fix.
Its original evidence commit `7b4e8d3e`, historical VETOs and supplied collector
remain intact in the original checkout. Protected main and v6.0.13 remain intact.
