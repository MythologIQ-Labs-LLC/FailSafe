# FailSafe Substrate Modules (v1)

**Status**: v1 (added 2026-05-27 under plan-qor-substrate-modules-v1; target release v5.3.0)
**Posture**: WARN-only (findings surface in transparency stream + Output channel; never block operator workflow)
**Invocation surface**: VS Code Command Palette → `FailSafe: Run Governance Substrate Checks` (`failsafe.substrate.run`)

## What is a substrate module?

A **Substrate Module** is a thin wrapper around a `qor.scripts.*` governance check (a Python subprocess) — or, in one case (`feature_index_verify`), a local TypeScript adapter that implements the same intent. Substrate modules produce **SubstrateFindings**: structured records of governance-relevant signals detected in the workspace.

Substrate modules are distinguished from FailSafe's runtime governance pipeline (sentinel, enforcement engine, ledger) by their **observability-only** posture:

- They do not BLOCK any operator action.
- They do not VETO commits, builds, or deploys.
- They do not gate the publish pipeline.
- They surface findings via:
  1. A dedicated VS Code Output channel ("FailSafe Substrate")
  2. A single `substrate.run.complete` event on the FailSafe EventBus (consumed by the transparency stream)

This is a deliberate **WARN-only governance signal** disposition (see *Terms* below). Raising any module to a BLOCK posture is a separate plan + operator decision.

## v1 modules

| Module | Implementation | Default Args | Expected Baseline | Notes |
|---|---|---|---|---|
| `secret_scanner` | `python -m qor.scripts.secret_scanner` (gitleaks v8 underneath) | `--staged --out dist/secrets.findings.json` | 0 findings on a clean working tree | Findings JSON written to `dist/` (gitignored). Each finding maps to one SubstrateFinding with severity=`warn`. |
| `feature_index_verify` | **TS-local adapter** (NOT subprocess) | n/a | 0 findings when every FEATURE_INDEX entry is `verified` with a populated test-path cell | Reads `docs/FEATURE_INDEX.md`. Upstream column-naming DRIFT corrected locally (FailSafe uses `Status` column header; upstream expects `verification status`). |
| `model_pinning_lint` | `python -m qor.scripts.model_pinning_lint --repo-root <ws>` | n/a | 0 findings against FailSafe's `.claude/skills/` layout (upstream module walks `qor/skills/`) | The 0-finding baseline is **expected silent-no-op**, NOT a broken lint. Documented in `summary.note` on every run. |
| `dependency_admission_lint` | **TS-local module** (NOT subprocess; Node port of `qor.scripts.dependency_admission_lint`, B-SUBSTRATE-2) | n/a (reads `FailSafe/extension/package.json` + `docs/META_LEDGER.md`) | 0 findings when no dep changed vs base, or every changed version is ≥14 days old / overridden | Diffs direct deps vs `git merge-base origin/main HEAD`, queries the npm registry for each new/bumped version's publish time, and WARNs on versions inside the 14-day cooling window lacking a `**Dependency admission override**: <pkg>@<ver>; upload_age_days=N; justification=...` entry in `docs/META_LEDGER.md`. **Outbound network egress to `registry.npmjs.org`** — the only v1 substrate module that makes a network call (mirrors the upstream PyPI query); degrades to an `info` finding when the registry is unreachable. WARN-only. v1 boundary: direct deps with a concrete-version spec (lockfile-resolved transitive coverage deferred). |

## How to invoke

There are two triggers:

**Manual (Command Palette):**

1. Open the VS Code Command Palette (Ctrl/Cmd+Shift+P).
2. Run `FailSafe: Run Governance Substrate Checks`.
3. The "FailSafe Substrate" Output channel is revealed and receives:
   - A `[FailSafe Substrate] starting manual run at <iso-timestamp>` line.
   - A `[FailSafe Substrate] complete: <N> finding(s) across 4 module(s) in <ms>ms` line.
   - One indented per-module summary line (with any error or note suffix).
4. A `vscode.window.showInformationMessage` toast surfaces the total finding count and points back at the Output channel.

**Automatic on seal (B-SUBSTRATE-3):** when `/qor-substantiate` seals a session it appends a new `### Entry #N: SESSION SEAL` to `docs/META_LEDGER.md`. A `WorkspaceMutationBus` watcher detects that new seal (via `seal-detection.ts`) and auto-runs the same module list (WARN-only, **no toast**), writing a `[FailSafe Substrate] new SESSION SEAL detected — auto-running substrate` line + the usual complete/per-module lines to the Output channel. The pre-existing latest seal is seeded at activation, so startup does not trigger a run.

5. One `substrate.run.complete` event is emitted on the FailSafe EventBus per run (manual or auto) with the shape:

```ts
{
  totalFindings: number,
  runDurationMs: number,
  startedAt: string,           // ISO timestamp
  modules: Array<{
    name: string,              // e.g., 'secret_scanner'
    count: number,             // findings produced
    ok: boolean,               // module-level success
  }>
}
```

The event is consumed by FailSafe's transparency stream for persistence + replay.

## How to interpret findings

Each **SubstrateFinding** has the following shape:

```ts
{
  module: string,                          // e.g., 'secret_scanner'
  severity: 'info' | 'warn' | 'high',      // v1 modules emit 'warn' exclusively
  rule: string,                            // module-specific rule id (e.g., 'aws-access-key', 'unverified-entry')
  message: string,                         // human-readable description
  location?: { file?: string, line?: number },
  raw?: unknown,                           // module-specific payload (e.g., the gitleaks v8 record)
}
```

WARN-only posture means: the appearance of findings is informational. They should be reviewed by the operator and addressed when appropriate, but they do not gate any FailSafe workflow.

## v1 scope + limitations

- **Operator-triggered only.** No auto-invocation during `/qor-substantiate`, no pre-commit hook, no CI integration. (See v2 roadmap below.)
- **Hard-coded module list.** The 3 v1 modules are wired in `src/extension/substrate-command.ts`. Adding a module currently requires a code change. A registry pattern is being considered for v2+.
- **No persistent run history.** Each run's findings are surfaced in-channel + in-event. No on-disk run log beyond `dist/secrets.findings.json` (which is gitignored and overwritten on each run).
- **`dependency_admission_lint` deferred to v2.** The upstream module is Python-archetype-specific (reads `pyproject.toml` / `requirements*.txt`). FailSafe is a Node/TS extension; a v2 plan will either npm-port the check or contribute upstream cross-archetype support.

## v2 roadmap

Tracked in `docs/BACKLOG.md` as `B-SUBSTRATE-2` through `B-SUBSTRATE-6`:

- **B-SUBSTRATE-2** — `dependency_admission_lint` integration (npm-side port OR upstream cross-archetype contribution).
- **B-SUBSTRATE-3** — Auto-hook the substrate runner into `/qor-substantiate` execution (FailSafe extension intercept OR upstream skill modification).
- **B-SUBSTRATE-4** — Console UI panel for substrate run history + per-finding drill-down.
- **B-SUBSTRATE-5** — SBOM emit integration (Phase 108 substrate).
- **B-SUBSTRATE-6** — Skill-frontmatter backfill so `model_pinning_lint` produces meaningful coverage against `.claude/skills/`.

## Compliance posture

- **EU AI Act Annex III**: Substrate is observability/transparency tooling. No scoring, grading, or inference is performed on operator behavior; findings cite source artifacts (file/line) and rule ids only.
- **GDPR**: Findings are session-ephemeral in the transparency stream + Output channel. The only persistent disk write is `dist/secrets.findings.json`, which is gitignored.
- **FailSafe Pro repo boundary**: Substrate is an extension-side observer + WARN-emitter only. No Pro-daemon work is involved.

## Terms

- **Substrate Module**: a wrapper around a governance check (qor.scripts subprocess or local TS adapter) producing SubstrateFindings under a WARN-only posture.
- **Substrate Finding**: a structured record of a governance-relevant signal detected by a substrate module (see shape above).
- **WARN-only governance signal**: a finding disposition that surfaces information without blocking any operator workflow — distinct from Phase 49 ABORT semantics, which terminate execution.

## See also

- Plan: `plan-qor-substrate-modules-v1.md` (root, gitignored; archived to `.failsafe/governance/plans/` post-release).
- Research brief: `.failsafe/governance/RESEARCH_BRIEF_qor-substrate-modules-v1-2026-05-27.md`.
- Substrate event type: `'substrate.run.complete'` in `src/shared/types/events.ts`.
- Source: `src/qorlogic/substrate/` + `src/extension/substrate-command.ts`.
- Tests: `src/test/qorlogic/substrate/*.test.ts` + `src/test/extension/substrate-command.test.cjs`.
