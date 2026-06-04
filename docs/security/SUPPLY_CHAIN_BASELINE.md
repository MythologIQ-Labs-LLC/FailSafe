# Tier 1 Supply-Chain & AI-Agent Workflow Security Baseline

> Issue #90 — defenses against Shai-Hulud / Mini Shai-Hulud-class supply-chain
> attacks affecting dependencies, CI workflows, AI-assisted SDLC execution, and
> developer tooling. This document records the controls FailSafe enforces, the
> controls that remain **operator settings actions** (cannot be set from a PR),
> and the indicators-of-compromise (IOC) review.

## 1. Workflow security baseline

| Control | Status | Where |
|---|---|---|
| GitHub Actions default token minimized to read-only | **Enforced** | Every workflow declares a top-level `permissions:` block. Five are `contents: read`; `wiki-init.yml` is `contents: write` (it pushes generated wiki content); `release.yml` is `contents: read` with the `github-release` job re-granting `contents: write` per-job. |
| Privileged Actions pinned to audited commit SHAs | **Enforced** | All `actions/*` uses are pinned to a full commit SHA with a `# vX.Y.Z` comment. SHAs were resolved from each action's current `@v4` tag (behavior-preserving — no silent major bump). |
| Pin currency / rot prevention | **Enforced** | `.github/dependabot.yml` (github-actions ecosystem, weekly) proposes the next audited SHA + comment. |
| CODEOWNERS review for workflows / manifests / lockfiles | **Enforced (file) + operator (ruleset)** | `.github/CODEOWNERS` declares ownership; enforcement requires the `main` ruleset to "Require review from Code Owners" (§4). |
| Privileged jobs do not restore cache from untrusted PR contexts | **Enforced by design** | No workflow uses `actions/cache` restore in a privileged job. The publish jobs (`release.yml`) run only on `push: tags` (never on `pull_request`), so untrusted PR HEAD never reaches a privileged context. |

## 2. Dependency admission

| Control | Status | Where |
|---|---|---|
| Dependency review check | **Enforced** | `.github/workflows/dependency-review.yml` runs `actions/dependency-review-action` on every PR to `main`, `fail-on-severity: high`. |
| Deterministic / frozen lockfile installs | **Enforced** | All CI installs use `npm ci` (lockfile-frozen, fails on drift), never `npm install`. |
| Dependency cooling-period policy | **Documented policy** | New direct dependencies (and major bumps) should age **≥ 7 days** on the registry before adoption, to let the ecosystem surface a compromised publish. Dependabot's `github-actions` updates are reviewed under the same window. |
| Disable install/lifecycle scripts where practical | **Partial / documented** | Lifecycle scripts cannot be globally disabled in CI because the build legitimately requires native rebuilds (`better-sqlite3`) and `playwright install`. Scripts run only against the **frozen, review-gated** lockfile — never against arbitrary PR-introduced packages without dependency review first. |

## 3. AI-agent workflow boundaries

FailSafe's own governance posture *is* the agent-boundary control; this section
makes the boundaries explicit and auditable.

- **Untrusted input treatment.** PR titles/bodies, issue text, review comments,
  and commit messages are treated as hostile input. No workflow interpolates
  that text into a shell context, and no automation derives privileged actions
  from it.
- **No AI-authorized side effects without deterministic validation.** No
  AI-assisted workflow may directly authorize shell execution, deployment,
  publication, or repository mutation. Every irreversible/outward action passes
  a deterministic gate first:
  - **Publish** is gated behind the `production` GitHub Environment (a human
    reviewer must approve before either marketplace receives a VSIX), and only
    fires on a `push: tags` event whose tag is verified to be an ancestor of
    `main`.
  - **Merge** is gated by the `main` repository ruleset (review + status
    checks); agent tooling surfaces PRs but does not self-merge.
  - **Release object creation** runs only after both publish jobs succeed.
- **Privileged workflows are isolated from untrusted public input.** Privileged
  jobs (publish, release) trigger on tag pushes, not on `pull_request`, so a
  fork PR can never enter a context that holds publish secrets. PR-triggered
  workflows hold only a read-only token.

## 4. Operator settings follow-ups (cannot be set from a PR)

These complete the baseline but are GitHub **settings / ruleset** changes the
operator must make in the UI — a merged PR alone does not activate them:

1. **Repository default workflow permissions** → Settings → Actions → General →
   *Workflow permissions* → "Read repository contents and packages
   permissions" (belt-and-suspenders to the per-workflow blocks).
2. **`main` ruleset → Require review from Code Owners** — activates
   `.github/CODEOWNERS` enforcement.
3. **`main` ruleset → Require status checks** → add **Dependency Review** (and
   keep the existing checks) to the required set.
4. **Settings → Actions → General → Fork pull request workflows** → keep
   "Require approval for all external contributors" so a fork PR cannot run
   workflows without maintainer approval.
5. Review **environment secrets** (`VSCE_PAT`, `OVSX_TOKEN`) scope and rotation;
   confirm the `production` environment retains its required reviewer.

## 5. IOC review

Reviewed for the Shai-Hulud / Mini Shai-Hulud indicators called out in #90.
**Result: clean** (no matches in the tracked tree at baseline time):

- `setup_bun.js` — not present.
- `bun_environment.js` — not present.
- `/tmp/transformers.pyz` — no reference.
- Unexpected workflow mutations — workflow history reviewed; the only changes
  are this baseline.
- Unexpected dependency introductions — none surfaced; the dependency-review
  gate now guards future PRs.

## 6. Acceptance-criteria mapping (#90)

- Workflow permissions are minimized → §1.
- Dependency review is enforced → §2.
- Privileged cache inheritance is blocked → §1 (no privileged cache restore; PR
  context never reaches privileged jobs).
- AI-agent workflow boundaries documented and enforced → §3.
- Deterministic install policy is active → §2 (`npm ci`).

The repository-settings half of "enforced" (ruleset/Code-Owners/required-check
activation) is itemized in §4 for the operator.
