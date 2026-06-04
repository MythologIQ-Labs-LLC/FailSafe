# Integration Documentation Index

> **Purpose.** A maintained registry of the official documentation for every
> external surface FailSafe integrates with — so the team (and any agent working
> in this repo) stays grounded in the *current* API contract instead of
> training-data memory.
>
> **Maintenance rule (binding).** Every integration cycle (`/qor-auto-dev-1` or
> SHIELD plan→deliver) that adds or changes an integration MUST add/refresh its
> row here in the same change. This index is the canonical source the
> **verify-external-names-at-plan-time** discipline cites: every external name in
> a plan code-block (endpoints, fields, auth headers) is back-cited to the doc
> linked here before the plan ships to `/qor-audit`. A stale or missing row is a
> governance bug. Registered in `docs/GOVERNANCE_INDEX.md`.
>
> **Pattern legend.** `ingest` = read-only pull of external data → FailSafe
> risk/intent record. `notify` = outbound governance notification. `wrapper` =
> spawn/govern an agent CLI. `observe` = read-only detect + policy/config audit.
> `installer` = governed install of an external tool. `mcp` = Model Context
> Protocol client/host.

_Last reviewed: 2026-06-04._

## Shipped

| Integration | Pattern | Official documentation | Local reference / status |
|---|---|---|---|
| **SARIF import** (#99) | ingest | SARIF v2.1.0 spec — https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html | `src/integrations/sarif/` · shipped v5.4.x |
| **MCP Registry scoring** (#108) | mcp | Model Context Protocol — https://modelcontextprotocol.io · Registry — https://github.com/modelcontextprotocol/registry | `src/integrations/mcp-registry/` · shipped v5.4.x |
| **MCP Catalog — Context7** | mcp / installer | https://github.com/upstash/context7 | `src/integrations/mcp-catalog/` · shipped |
| **MCP Catalog — Mermaid Chart** | mcp / installer | https://docs.mermaidchart.com · MCP: https://github.com/Mermaid-Chart/mermaid-chart-mcp | `src/integrations/mcp-catalog/` · shipped |
| **MCP Catalog — Playwright MCP** | mcp / installer | https://github.com/microsoft/playwright-mcp | `src/integrations/mcp-catalog/` · shipped (governed high-risk) |
| **Slack notify-only** (#100) | notify | Incoming Webhooks — https://api.slack.com/messaging/webhooks · Block Kit — https://api.slack.com/block-kit | `src/integrations/slack/` · shipped v5.4.x |
| **Open Design observer** | mcp / observe | https://github.com/nexu-io/open-design | `src/integrations/open-design/` · shipped v5.x |
| **Bicameral MCP** | mcp | Upstream repo (see contract review) | `src/integrations/bicameral/` · shipped v5.1.5 |
| **Agent Governance Toolkit (AGT) installer** | installer | https://github.com/microsoft/agent-governance-toolkit | `src/integrations/agt/` · built (PR #140, held) |

> **Integrations-tab "Catalog" sub-view** (#167) — the command/config integrations
> without a dedicated sub-view (Continue, Aider, OpenHands, Cline/Roo/Kilo, Linear,
> Jira, GitHub Checks, Sentry, Teams, Slack) are surfaced as a registry-driven card
> grid with live enabled/configured state. Source of truth:
> `src/integrations/catalog/integration-catalog.ts` (pure, secret-safe) →
> `GET /api/v1/integrations/catalog`. Adding/removing an integration here MUST keep
> this index and the per-integration READMEs in sync.

## In review (PR open, merge-blocked by `main` ruleset)

| Integration | Pattern | Official documentation | Local reference / status |
|---|---|---|---|
| **Linear** (#97) | ingest | https://linear.app/docs/api-and-webhooks · GraphQL: https://studio.apollographql.com/public/Linear-API/ | `src/integrations/linear/` · PR #145 |
| **Microsoft Teams** (#101) | notify | Teams platform — https://learn.microsoft.com/en-us/microsoftteams/platform/teams-sdk/essentials/api · Incoming webhooks / Adaptive Cards — https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/connectors-using | `src/integrations/teams/` · PR #144 |
| **GitHub Checks** (#96) | notify (merge gate) | REST API — https://docs.github.com/en/rest?apiVersion=2026-03-10 · Checks: https://docs.github.com/en/rest/checks/runs | `src/integrations/github-checks/` · PR #147 |
| **Jira** (#98) | ingest | Cloud REST v3 — https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/ · Server/DC REST 7.6.1 — https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/ | `src/integrations/jira/` · PR #148 (uses REST v2 for string descriptions) |
| **ACP governance adapter** (#172) | mcp / JSON-RPC (govern) | Agent Client Protocol — https://agentclientprotocol.com · schema: https://github.com/agentclientprotocol/agent-client-protocol (`/schema/schema.json`, v1) | `src/integrations/acp/` · PR #173 · **foundation only** (types + mapper + interceptor + permission authority; no transport yet). Govern any ACP agent (Devin Desktop/Zed/JetBrains) via the existing interceptor seam. |
| **Devin Desktop** (#161) | observe (host detection) | Devin Desktop (formerly Windsurf) — https://docs.devin.ai/desktop/getting-started · ACP — https://docs.devin.ai/desktop/acp | `src/qorelogic/AgentDefinitions.ts` (+ ModelAdapterConfigs/AgentConfigInjector/TerminalCorrelator) · host-detection alias only (Part 1); ACP enforce-proxy is forward work (see docs/plan-devin-acp-enforce-2026-06-04.md) |

## Planned (backlog)

| Integration | Pattern | Official documentation | Backlog |
|---|---|---|---|
| **Sentry** (#102) | ingest | API — https://docs.sentry.io/api/ · Releases — https://docs.sentry.io/api/releases/ · GitHub source-code mgmt — https://docs.sentry.io/organization/integrations/source-code-mgmt/github/ | #102 |
| **Continue.dev** (#104) | wrapper | https://docs.continue.dev/ · Headless mode — https://docs.continue.dev/cli/headless-mode | #104 (Group B) |
| **Aider** (#107) | wrapper | https://aider.chat/docs/ · Scripting — https://aider.chat/docs/scripting.html | #107 (Group B) |
| **OpenHands** (#105) | observe | Cloud API — https://docs.openhands.dev/openhands/usage/cloud/cloud-api · SDK — https://docs.openhands.dev/sdk/api-reference/openhands.sdk.agent | #105 (Group C) |
| **Cline / Roo / Kilo** (#106) | observe | Cline — https://docs.cline.bot/api/overview · Cline MCP — https://docs.cline.bot/mcp/mcp-overview · Kilo — https://kilo.ai/docs/automate/mcp/using-in-kilo-code · Roo — https://roocodeinc.github.io/Roo-Code/providers/ | #106 (Group C) |

## Integration families (grouping by similarity)

- **A — Read-only data ingest** (pure parse + injectable transport + secret-masked config → FailSafe risk/intent record): SARIF, Linear, Jira, **Sentry**.
- **B — CLI agent wrappers** (argv-form spawn, capture diff/exit/receipt, gate writes through L3): Continue, Aider.
- **C — Agent detect / observe / config-audit** (read-only detection + policy/config inspection + risk-flagging, no spawning): OpenHands, Cline/Roo/Kilo.
- **Notify** (outbound governance signal): Slack, Teams, GitHub Checks.
- **MCP / installer** (governed install or MCP client/host): MCP Registry, MCP Catalog (Context7 / Mermaid Chart / Playwright), Open Design, Bicameral, AGT.
