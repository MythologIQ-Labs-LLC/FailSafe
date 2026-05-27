# Research Brief - Day-One Integration Candidates

**Date**: 2026-05-27
**Analyst**: The Qor-logic Analyst
**Target**: FailSafe integration candidates that provide obvious day-one product value beyond Bicameral MCP and Open Design.
**Scope**: External API feasibility, local integration fit, issue-ready first slices.

---

## Executive Summary

FailSafe has a strong local governance core, but the current Integrations tab is intentionally thin: `integrations.js:2` says Bicameral MCP is the only v1 entry and `integrations.js:46` renders only the Bicameral card. The best day-one expansion path is not another single-purpose card; it is a portfolio of integrations that attach SHIELD evidence to the systems teams already use: GitHub, ticket trackers, security scanners, team chat, runtime observability, agent runtimes, and MCP server discovery.

Top priority should be GitHub PR checks/reviews, Linear/Jira intent sync, Semgrep/SARIF ingestion, Slack/Teams notification surfaces, Sentry/OpenTelemetry runtime correlation, and selected agent-runtime adapters. Open Design remains the UI-efficacy integration, but it is not a substitute for delivery, security, and team-workflow surfaces.

## Local Baseline

### L1 - Integrations tab is currently Bicameral-only

- **Location**: `FailSafe/extension/src/roadmap/ui/modules/integrations.js:2`, `FailSafe/extension/src/roadmap/ui/modules/integrations.js:46`
- **Finding**: The renderer hosts third-party cards but only imports and renders Bicameral.
- **Implication**: A second integration should trigger the B-INT-5 sub-tab/card-layout rethink already tracked in backlog.

### L2 - Shared MCP/tool-call governance already exists

- **Location**: `FailSafe/extension/src/governance/interceptor/README.md:9`, `FailSafe/extension/src/governance/interceptor/README.md:19`, `FailSafe/extension/src/governance/interceptor/adapters/McpInterceptor.ts:28`
- **Finding**: `McpInterceptor` maps MCP tool-call envelopes into FailSafe evaluation requests.
- **Implication**: MCP-like integrations should reuse the interceptor; non-MCP integrations should still emit the same receipt/risk/event vocabulary.

### L3 - Existing research already warns against Bicameral monoculture

- **Location**: `docs/research-brief-integration-alternatives-2026-05-23.md:12`, `docs/research-brief-integration-alternatives-2026-05-23.md:108`
- **Finding**: Prior research recommended a generic MCP host, GitHub MCP, and OpenTelemetry as provider-neutral fallback lanes.
- **Implication**: New issues should preserve provider-neutral shapes where possible.

### L4 - Current architecture plan is stale for this decision

- **Location**: `docs/ARCHITECTURE_PLAN.md:1`, `docs/ARCHITECTURE_PLAN.md:5`
- **Finding**: The active architecture plan is a v4.9.2 Command Center hotfix plan, not a current integration strategy.
- **Status**: DRIFT. These issues should be research/roadmap entries only until a fresh `/qor-plan` is authored and audited.

## Candidate Findings

| Priority | Candidate | Verified interface | Day-one value | First FailSafe shape |
|---|---|---|---|---|
| P0 | Open Design | REST/SSE daemon surface per prior research entry #397 | UI generation efficacy, artifact finalization governance | Read-only observer plus L3 gate on finalize |
| P0 | GitHub PR checks/reviews | Checks API creates check runs; PR Reviews API can comment/request changes | Puts SHIELD verdicts where merges happen | GitHub App or PAT-backed direct integration; checks first, review comments second |
| P0 | Linear | GraphQL API plus webhooks for create/update events | Converts issue intent into active FailSafe intent/acceptance criteria | Read issue by ID, sync webhook updates, link PR/check evidence back |
| P0 | Jira | REST webhook registration for issue created/updated/deleted | Same as Linear for enterprise teams | JQL-scoped webhook plus issue fetch/cache |
| P0 | Semgrep/SARIF | Semgrep CLI exports SARIF; GitHub accepts SARIF uploads | Turns code scanner output into FailSafe risks/gates | Local scan/import first, GitHub code-scanning upload optional |
| P1 | Slack | Incoming webhook posts JSON message payloads | Low-friction VETO/L3/release notifications | Outbound notifications first; approval links route back to local Command Center |
| P1 | Microsoft Teams | Webhook workflows receive HTTP POST and post cards | Same notification value for Microsoft shops | Workflow/webhook notification card; note connector deprecation/orphan-owner risk |
| P1 | Sentry | Releases API and GitHub integration expose commits/suspect commits | Correlates production issues to PRs/intents/agents | Import suspect-commit issue events into Risk Register |
| P1 | OpenTelemetry | Vendor-neutral traces/metrics/logs signals | Evidence export/import when no product-specific runtime exists | Export FailSafe receipts as spans; later ingest agent/tool spans |
| P1 | Continue.dev | `cn -p` headless mode, JSON output, CI API key | Govern a popular headless/local coding agent | Wrapper around `cn` with write/tool allowlist and receipt capture |
| P1 | OpenHands | SDK agent API and fixed per-conversation tools | Govern full agent-loop actions | SDK/runtime observer; start new conversation when tool policy changes |
| P1 | Cline/Roo/Kilo family | Cline SDK/CLI, MCP config; Kilo/Roo VS Code agent surfaces | High install base, file-write/terminal governance | Policy adapter around MCP/tool approval configs and CLI execution |
| P2 | Aider | Git-integrated CLI and scripting support | Simple commit/diff gate for CLI pair-programming | Pre/post-run wrapper, diff review, commit-message and auto-commit policy |
| P2 | MCP Registry | Official registry REST/OpenAPI metadata | Server admission, risk scoring, install guidance | Read-only registry browser plus trust policy annotations |

## External Interface Notes

### GitHub

- Checks API can create a check run for a commit, but write access is GitHub-App-oriented and requires Checks repository write permission.
- PR review creation supports `APPROVE`, `REQUEST_CHANGES`, and `COMMENT`, but line comments require diff positions, not raw file line numbers.
- Code scanning accepts SARIF upload with code-scanning write permission and returns `202 Accepted`.

### Work Trackers

- Linear's public API is GraphQL, and its webhooks send HTTP(S) notifications when data is created or updated.
- Jira Cloud supports JQL-filtered webhook registrations for issue created/updated/deleted events.
- Both should be read-mostly first; write-back comments/statuses can follow after auth posture is settled.

### Security Scanning

- Semgrep can run locally and export text, JSON, and SARIF outputs.
- `semgrep scan` is suitable without a Semgrep account; `semgrep ci` is better for organization policy but can require login.
- FailSafe should store source, rule id, severity, path, and waiver state rather than treating scanner output as a final verdict.

### Team Notification

- Slack incoming webhooks are a unique URL receiving JSON payloads.
- Teams now strongly favors Workflows for webhook receive/post behavior; Teams workflows are user-owned and need co-owner continuity.
- Both should start outbound-only; remote inbound approvals should be deferred until threat model and auth are planned.

### Runtime Observability

- Sentry can relate stack-trace files to commits and recently merged PRs.
- OpenTelemetry provides vendor-neutral telemetry signals. Use it for evidence export/import, not as the authoritative ledger.

### Agent Runtimes

- Continue headless mode can run one-shot prompts, emit JSON, and take explicit `--allow` tool permissions.
- OpenHands SDK exposes an agent API; tools are part of the system prompt and cannot change mid-conversation.
- Cline offers SDK/CLI/IDE surfaces and MCP server configuration; Kilo exposes MCP and permission-style config; Roo is model-provider flexible but has less obvious public automation surface.
- Aider is git-integrated and scriptable, making it the simplest CLI-diff gate.

## Blueprint Alignment

| Claim / Direction | Actual Finding | Status |
|---|---|---|
| Current Integrations tab can host more cards | The renderer is card-shaped but Bicameral-only today | MATCH |
| B-INT-4 should wait for a second MCP integration | MCP Registry/Cline/Kilo/GitHub MCP candidates justify generic lifecycle extraction | MATCH |
| Open Design should be treated like Bicameral MCP | Prior research found Open Design is a REST/SSE agent host, not an MCP server | DRIFT |
| Current architecture plan guides this integration set | The plan is a stale v4.9.2 hotfix plan | DRIFT |
| Team chat approvals can be implemented as simple webhooks | Outbound notification is simple; inbound approval is not yet threat-modeled | PARTIAL |

## Recommendations

1. **Open GitHub issues for each candidate, not one mega-epic.** The auth models differ too much to share a single implementation plan.
2. **Promote three near-term epics:** delivery gate (GitHub), intent sync (Linear/Jira), and security ingestion (Semgrep/SARIF).
3. **Keep chat integrations outbound-first.** Inbound approvals need signed callbacks or local-only handoff.
4. **Treat OpenTelemetry as evidence, not truth.** The ledger and receipts remain the source of record.
5. **Route agent adapters through wrappers before deep plugin work.** CLI/process wrappers produce value faster than trying to patch every IDE extension internals.

## Issue Set

This research should produce open issues for:

1. Open Design REST/SSE observer.
2. GitHub PR checks and review comments.
3. Linear issue-to-intent sync.
4. Jira issue-to-intent sync.
5. Semgrep/SARIF security ingestion.
6. Slack notifications and L3 prompts.
7. Microsoft Teams notifications and L3 prompts.
8. Sentry runtime regression correlation.
9. OpenTelemetry evidence export/import.
10. Continue.dev headless governance.
11. OpenHands runtime governance.
12. Cline/Roo/Kilo runtime and MCP policy adapter.
13. Aider CLI git gate.
14. MCP Registry server-admission/risk scoring.

## Updated Knowledge

Integration candidates should be split by control-plane boundary, not by product category. If two tools solve the same user story but use different auth, event, or execution models, they deserve separate research/issues until a shared abstraction is proven.

---

_Research complete. Findings are advisory; implementation decisions remain with the Governor._
