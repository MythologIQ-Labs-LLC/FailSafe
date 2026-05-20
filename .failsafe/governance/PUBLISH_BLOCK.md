# Publish Block

**Active**: no
**Set**: 2026-05-06
**Set by**: operator (chat directive: "nothing gets published until everything gets a test")
**Cleared**: 2026-05-19 (operator chat directive: "push, merge and publish v5.1.5")
**Cleared rationale**: `docs/FEATURE_INDEX.md` shows 0 entries with `Status: unverified` (433 verified / 43 operator-justified `n/a` per 2026-05-14 audit). Coverage gate condition 1 satisfied; v5.1.0 substantiate seal PASSED. v5.1.5 carries forward this coverage state (Phases 2-9 added FX511-FX525 all verified).
**Reason**: `docs/FEATURE_INDEX.md` shows 264 of 476 features unverified (55.5%). Per memory rule `feedback_no_publish_until_full_coverage.md`, no FailSafe build publishes until every FEATURE_INDEX entry has a corresponding test or per-row `n/a` justification approved by the operator.
**Cleared by**: operator-explicit removal of this file (or `Active: no` flip) in a commit whose message references the FEATURE_INDEX state showing 100% `verified` or operator-justified `n/a`.

## What this blocks

- `vsce publish` (VS Code Marketplace)
- `ovsx publish` (Open VSX)
- `npm publish` (any npm registry)
- `release-gate.cjs --tag` (annotated release-tag creation)
- `git push --tags` to a release branch
- Any GitHub Actions workflow with publishing intent (`marketplace-publish.yml`, `ovsx-publish.yml`, etc.)
- Any `gh release create` invocation

This is **outward-facing publish only**. Local actions remain unblocked: `npm run compile`, `npm test`, `npm run test:ui`, `git commit`, `git push` to non-release branches for review, `npm run package` (builds VSIX without uploading), etc.

## What this does NOT block

- FailSafe Pro repository (`FailSafe-Pro/`, separate Tauri repo, BSL-1.1) — has its own governance.
- Internal preview builds shared via direct VSIX file (not marketplace upload).
- Plan/audit/implement/substantiate cycles — those happen freely; only the publish step is gated.

## Clearing protocol

Operator clears this block by:

1. Confirming `docs/FEATURE_INDEX.md` shows 0 entries with `Status: unverified`. Every entry must be `verified` (test exists + exercises feature + currently passes) or `n/a` with per-row operator-approved justification text.
2. Either:
   - Deleting this file in a commit (message references the FEATURE_INDEX state).
   - OR flipping `Active: yes` → `Active: no` in this file.
3. Re-running `/qor-audit` to obtain a new PASS verdict on the publish-readiness question (Entry #285's findings 1, 2 specifically — release-class coverage + ghost-ui).
4. Re-running `/qor-substantiate` for a release-class seal.

## Tooling integration (planned, not yet implemented — see REMEDIATE_PROPOSAL_v5.1.0.md)

- `tools/reliability/prepush-validate.ps1` reads this file; blocks pushes from a release branch when `Active: yes`.
- `release-gate.cjs --doctor` reads this file; refuses bump when `Active: yes`.
- Memory rule `feedback_no_publish_until_full_coverage.md` instructs the implementer to refuse publish-class commands silently until this file is cleared.

## Out-of-scope reminders

This block does NOT mean "fix all 5 audit findings before clearing." Findings 2, 3, 4, 5 from Entry #285 are independent concerns. **Coverage is the binding gate.** The other findings still need resolution paths (per `REMEDIATE_PROPOSAL_v5.1.0.md`) but they don't gate publish in the way coverage does.

If the operator decides at any point that a specific feature is intentionally untested, that's a per-row `n/a` justification in FEATURE_INDEX with a `notes` field explaining why — not a block-clear.

## Lifting protocol

PUBLISH_BLOCK can flip Active=no only when ALL of:

1. FEATURE_INDEX shows 0 unverified entries (achieved 2026-05-07; re-confirmed 2026-05-14 at Phase 60 §5 ledger Entry #353; 433 verified / 43 n/a / 0 unverified).
2. BROWSER_VERIFICATION.md exists with `Active: yes` flipped to `Active: no` AND every Playwright-covered page has a passing spec run within 24h of seal.
3. Every screenshot-covered page in BROWSER_VERIFICATION.md has an operator note + screenshot with date stamp.
4. Operator has signed the sign-off line.
5. Substantiate seal of plan-monitor-coherence-and-browser-verification.md PASSED with no VETO.

`scripts/check-publish-block.cjs` validates conditions 1-4 mechanically. Condition 5 is read from the META_LEDGER seal entry.

Until all five conditions met, the pre-push hook blocks any [RELEASE] commit.
