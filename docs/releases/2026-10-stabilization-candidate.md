# FailSafe stabilization release candidate (October 2026)

Status: **staging only / NOT RELEASE APPROVED**. Branch: `release/stabilization-candidate-oct2026`.

## Base and scope

- Base: main at `cd63e437f9e5393b4b729ff7930d5545588eecd4`.
- Candidate integrates the source changes for #489, #490, #491, #492, #494 and #495, plus the underlying no-PASS-before-receipt guard from #493.
- Intentional overlap resolution: #490 provides a neutral manual GitHub advisory surface; #493 additionally blocks direct publishing of an operator-chosen PASS at the client boundary. The original draft PRs remain unmerged.
- Current package manifest version in the staging source: **6.0.5**. Do not assign a release tag/version until actual main/release tags and publication status are verified. A subsequent patch or minor number requires a separate explicit release decision.

## Mandatory release blockers

- [ ] Review and settle P0 marketplace execution issues #468/#469: mitigate or disable unsafe execution paths before general publication.
- [ ] Confirm authorization coverage for #494: preflight hardening is NOT sandboxed execution, and an authorized agent may mutate workspace files before high-risk diff review. Document, isolate, or disable this mode appropriately.
- [ ] Confirm #495 mixed legacy/v2 ledger histories verify on reopening; legacy rows do not authenticate formerly unsigned fields. Reject corruption rather than treating degraded integrity as PASS.
- [ ] Verify #493's client-level no-unverified-PASS guard and #490's neutral advisory remain effective in the combined artifact.
- [ ] Independently review all combined source diffs, with focus on secret handling, trust boundaries and fail-closed behavior.

## Local-first acceptance tests before opening a CI-triggering PR

- [ ] `cd FailSafe/extension && npm ci && npm run compile && npm run lint`
- [ ] Run targeted tests for GitHub Checks, Sentry, integration catalog, Continue/Aider, ledger, Console and Mind Map; retain exact commands, environment, exit codes and logs.
- [ ] Run `npm run test:all` with supported VS Code/Electron dependencies and capture result.
- [ ] Manually verify VS Code activation, Console listener readiness, integration status, no-PASS GitHub advisory behavior, Sentry failure fixtures, keyboard/voice interaction and package installation/rollback.
- [ ] Verify package contents and absence of proprietary or secret files; test VSIX installation.
- [ ] Confirm release notes and support/rollback instructions.

## GitHub Actions budget policy

Keep this branch without a main-targeted PR until local and independent review gates pass. Stage further changes here, then open **one** integrated PR to main with one intentional candidate CI cycle (plus the required main-push/release checks). Never skip mandatory required checks. Avoid repeated pushes after opening the release PR, avoid workflow_dispatch and avoid creating premature tags. Branch protection and security requirements are not budget optimization knobs.

## Acceptance record

No runtime tests or GitHub-hosted validation were executed as part of preparing this integrated branch. Its existence and file count alone do not prove release suitability. Release publication needs explicit approval after the above evidence is attached.
