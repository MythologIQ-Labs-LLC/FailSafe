# Plan: v3.2.5 FailSafe Console Overhaul + GitHub Standards Enforcement

## Execution Precedence Override (2026-02-11)

UI work is now hard-gated as first priority. Non-UI implementation is blocked until popout UI completion criteria are met.

Active execution checklist:
- `docs/Planning/plan-v3.2.5-ui-first-execution-checklist.md`

## Open Questions

- Should branch protection require signed commits on all branches or only protected branches (`main`, `release/*`)?
- Should UI overhaul ship behind profile-default changes in one release or staged profile rollout over multiple patches?
- Should PR evidence exports be generated on every push or only on labeled PR events?

## Objective

Deliver a complete v3.2.5 plan for FailSafe Console UI overhaul using the console spec packet, while enforcing branch and GitHub governance standards as product behavior and team workflow policy.

## Non-Goals

- Implementing the full UI overhaul in this planning pass.
- Changing marketplace distribution model.
- Replacing the existing governance engine with a new backend.

## Inputs and Source of Truth

- `docs/specs/failsafe-console-spec/README_SPEC_PACKET.md`
- `docs/specs/failsafe-console-spec/SPEC_FAILSAFE_CONSOLE_OVERVIEW.md`
- `docs/specs/failsafe-console-spec/SPEC_UI_CONFIGURATION_AND_PROFILES.md`
- `docs/specs/failsafe-console-spec/SPEC_WORKFLOW_RUN_AND_EVIDENCE_MODEL.md`
- `docs/specs/failsafe-console-spec/SPEC_SECURITY_PERMISSIONS_AND_SKILL_REGISTRY.md`
- `docs/specs/failsafe-console-spec/SPEC_ACCEPTANCE_CRITERIA_AND_TEST_PLAN.md`
- `docs/AUTONOMOUS_RELIABILITY_MANIFEST.md`
- `.agent/workflows/qor-plan.md`
- `.agent/workflows/qor-implement.md`
- `.agent/workflows/qor-substantiate.md`
- `validate.ps1`
- `docs/BACKLOG.md`
- `docs/SYSTEM_STATE.md`
- `docs/META_LEDGER.md`

## Failure Predicate

Plan fails if any of the following are true:

1. v3.2.5 scope does not map directly to console spec requirements and acceptance criteria.
2. Branch/PR/GitHub standards are only documented, not represented as enforceable checks in workflow or validation tooling.
3. UI overhaul tasks are too coarse to preserve evidence and testability by phase.
4. Backlog and governance artifacts are not aligned to v3.2.5 scope and deferred items.

## Constraints

- Enforce branch-first workflow (`plan/*`, `feat/*`, `release/*`) and PR-first merges to `main`.
- Keep gates deterministic: intent lock, reliability evidence, skill admission, gate-skill matrix.
- Maintain headless parity for governance outputs (CLI/CI same pass-fail semantics as UI).
- Keep changes composable and phase-bounded under Section 4 limits.
- Preserve current sealed v3.2.0 evidence history.

## Phase 1: Governance and Repo Standards Enforcement

### Affected Files

- `validate.ps1` - add GitHub governance checks (branch naming, PR flow markers, release discipline checks).
- `.agent/workflows/qor-plan.md` - enforce plan-branch creation and branch naming validation.
- `.agent/workflows/qor-implement.md` - require non-`main` implementation branch unless explicit override.
- `.agent/workflows/qor-substantiate.md` - default to PR path for protected branches and record merge mode in ledger.
- `docs/GOVERNANCE.md` - codify branch strategy and required checks.
- `docs/CONTRIBUTING.md` - contributor-facing branch/PR/signed-commit standards.
- `.github/workflows/*` (new or updated) - CI gates for lint/compile/validate and branch policy assertions.

### Changes

- Define canonical branch taxonomy: `plan/*`, `feat/*`, `fix/*`, `release/*`.
- Add deterministic policy checks in `validate.ps1` for governance doc presence and workflow hooks.
- Add CI gate contract for required checks before merge to `main`.
- Add policy path for emergency override that is explicit, logged, and risk-elevated.

### Unit Tests

- `FailSafe/extension/src/test/governance/BranchPolicy.test.ts` - validates policy parsing and allowed branch classes.
- `FailSafe/extension/src/test/governance/PrGatePolicy.test.ts` - validates merge-path decision rules.
- Script tests (PowerShell): verify `validate.ps1` fails on branch policy violations in simulated states.

## Phase 2: Console IA and Profile-Driven UI Foundation

### Affected Files

- `FailSafe/extension/src/genesis/panels/PlanningHubPanel.ts` - evolve toward route-aware console shell behavior.
- `FailSafe/extension/src/genesis/panels/templates/PlanningHubTemplate.ts` - implement profile-dependent layout composition.
- `FailSafe/extension/src/genesis/components/*` - extract reusable route modules (`home`, `run`, `skills`, `genome`, `reports`, `settings`).
- `FailSafe/extension/src/shared/content/quickstart.ts` - first-win onboarding lane content.
- `FailSafe/extension/src/shared/styles/common.ts` - visual language constraints and status system consistency.
- `FailSafe/extension/src/shared/types/*` (new) - profile/config schema contracts.

### Changes

- Implement minimum route-set information architecture mapped to spec.
- Build profile presets (`guided`, `standard`, `expert`) with complexity/transparency defaults.
- Add progressive disclosure rules and component visibility matrix.
- Preserve single-source state model for profile/config resolution (`run > workspace > user > default`).
- Add explicit Home/Quick Action CTA: `Prep Workspace (Bootstrap)` that runs required workspace injection/hygiene flow before first run.
- Map `Prep Workspace (Bootstrap)` to existing secure-workspace pipeline and extension artifact injection orchestration path.
- Add explicit Run View safety controls:
  - `Panic` button (`Stop/Cancel Run`) to hard-abort active execution paths.
  - `Undo Last Attempt` to trigger bounded rollback flow from latest attempt transaction.
- Add empty-state UX contracts for:
  - no workspace open
  - no detected failure signals
  - no admitted skills
  - no existing runs

### Unit Tests

- `FailSafe/extension/src/test/console/ProfileDefaults.test.ts` - verifies default matrix per profile.
- `FailSafe/extension/src/test/console/VisibilityRules.test.ts` - ensures component flag behavior by profile/complexity.
- `FailSafe/extension/src/test/console/ConfigPrecedence.test.ts` - validates override priority semantics.
- `FailSafe/extension/src/test/console/WorkspacePrepAction.test.ts` - validates bootstrap CTA wiring and success/failure user messaging.
- `FailSafe/extension/src/test/console/RunPanicAction.test.ts` - validates panic stop behavior and run-state transition.
- `FailSafe/extension/src/test/console/UndoLastAttemptAction.test.ts` - validates rollback action wiring and integrity checks.
- `FailSafe/extension/src/test/console/EmptyStates.test.ts` - validates all required empty-state messages and next actions.

## Phase 3: Workflow Run, Evidence, and Claim Model Integration

### Affected Files

- `FailSafe/extension/src/qorelogic/planning/types.ts` - align stage/gate/run entities with spec.
- `FailSafe/extension/src/qorelogic/planning/events.ts` - expand event taxonomy for run/evidence model.
- `FailSafe/extension/src/qorelogic/planning/PlanManager.ts` - add run-level entity orchestration and stage states.
- `FailSafe/extension/src/shared/EventBus.ts` - enforce event schema for run/evidence events.
- `tools/reliability/*` - align validators with new run and claim contracts.
- `docs/Planning/templates/reliability/*` - include claim-evidence linkage expectations.

### Changes

- Introduce explicit `Run`, `StageGate`, `Artifact`, `Claim`, `Evidence`, and `AttemptTransaction` schemas.
- Enforce verified-claim evidence requirement.
- Ensure export bundles include stage outcomes, claim/evidence table, and override records.
- Keep headless parity: same data model and verdict semantics across UI, CLI, CI.

### Unit Tests

- `FailSafe/extension/src/test/planning/RunModel.test.ts` - run status transitions and stage ordering.
- `FailSafe/extension/src/test/planning/ClaimEvidencePolicy.test.ts` - verified claims require evidence.
- `FailSafe/extension/src/test/planning/ExportBundle.test.ts` - ensures required artifact set in bundle manifests.

## Phase 4: Security, Permissions, and Skill Registry Surface

### Affected Files

- `tools/reliability/admit-skill.ps1` - align permission scope fields with security spec.
- `tools/reliability/validate-skill-admission.ps1` - enforce pinned versions and permission policy.
- `tools/reliability/validate-gate-skill-matrix.ps1` - bind workflow compatibility checks to permissions.
- `FailSafe/extension/src/genesis/services/*` - add permission decision projections for UI.
- `FailSafe/extension/src/genesis/panels/*` - render skill registry and invocation audit visibility.
- `docs/specs/failsafe-console-spec/*` - maintain traceability updates as implementation decisions are finalized.

### Changes

- Normalize permission scopes (`filesystem.read/write`, `git.read/write`, `shell.exec`, `network.http`, `secrets.read/write`).
- Deny `shell.exec` and `network.http` by default in policy model unless explicit grant.
- Require version pin for runnable skills; unpinned skills blocked or forced conditional mode with explicit consent.
- Add redaction guarantees for export outputs by default.
- Add first-run permission preflight summary dialog for requested scopes and default denials.

### Unit Tests

- `FailSafe/extension/src/test/security/PermissionDefaults.test.ts` - verifies deny-by-default for sensitive scopes.
- `FailSafe/extension/src/test/security/SkillPinPolicy.test.ts` - blocks unpinned skill execution.
- `FailSafe/extension/src/test/security/ExportRedaction.test.ts` - ensures secret patterns are redacted in exports.
- `FailSafe/extension/src/test/security/PermissionPreflight.test.ts` - validates consent and denial handling for first-run scope grants.

## Phase 5: Acceptance and Adversarial Validation

### Affected Files

- `docs/Planning/sprints/sprint-v3.2.5-failsafe-console-overhaul.md` - operational sprint acceptance map.
- `docs/BACKLOG.md` - v3.2.5 scoped backlog and status tracking.
- `docs/META_LEDGER.md` - phase gates and seal decisions.
- `docs/SYSTEM_STATE.md` - system state transitions and chain references.
- `tests/e2e/*` (new) - end-to-end journey validation for spec acceptance.

### Changes

- Encode journey-based acceptance tests (P1-P5) from spec packet.
- Add adversarial checks as first-class pass/fail conditions.
- Add CI compatibility report output for PR annotation artifacts.
- Ensure deterministic replay criteria for CI runs with same inputs/environment.
- Add accessibility baseline gates for keyboard navigation, focus management, and labeled controls.
- Add PR evidence checklist update to `.github/PULL_REQUEST_TEMPLATE.md`.
- Add branch-protection parity checks (required checks/PR requirement/signature policy) to governance validation.

### Unit Tests

- `tests/e2e/console-guided-first-win.spec.ts`
- `tests/e2e/console-expert-auditability.spec.ts`
- `tests/e2e/console-security-permission-denial.spec.ts`
- `tests/e2e/console-ci-parity.spec.ts`
- `tests/e2e/console-workflow-authoring-sandbox.spec.ts`
- `tests/e2e/console-panic-stop-and-recovery.spec.ts`
- `tests/e2e/console-accessibility-baseline.spec.ts`

## Adversarial Review of Plan

### Risks

1. UI overhaul could complect display concerns with governance engine decisions.
2. Branch standards may remain soft guidance if not hard-failed in CI and local validation.
3. Spec breadth could cause phase drift and unfinished acceptance coverage.
4. Security scope expansion may regress usability for guided users.

### Countermeasures

1. Keep shared contracts in typed schemas and treat UI as a projection layer.
2. Gate merge path with deterministic checks in `validate.ps1` and CI workflow.
3. Enforce phase acceptance checkpoints and lock backlog progression on evidence.
4. Preserve profile defaults and progressive disclosure while maintaining strict backend policy.

## Updated Plan (Post-Adversarial Review)

- Add explicit Phase 1 deliverable: CI-enforced branch-policy checks with PR-only merge mode for protected branches.
- Add explicit Phase 2 deliverable: profile-config schema published and versioned.
- Add explicit Phase 3 deliverable: claim/evidence policy tests required before stage-model completion.
- Add explicit Phase 4 deliverable: unpinned skill execution block path with clear user-facing remediation.
- Add explicit Phase 5 deliverable: journey acceptance tests must map one-to-one to spec criteria.

## Verification Criteria

- `docs/Planning/sprints/sprint-v3.2.5-failsafe-console-overhaul.md` exists with executable phase acceptance.
- `docs/BACKLOG.md` includes v3.2.5 tasks that map directly to this plan.
- Branch and PR standards are represented as enforceable checks in tooling, not narrative only.
- Console architecture plan preserves headless parity and evidence-first governance.
- Acceptance suite definitions cover all five spec journeys and adversarial checks.
