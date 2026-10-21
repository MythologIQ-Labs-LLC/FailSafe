<div align="center">

# FailSafe

**Know what your AI coding agents are doing. Keep development decisions accountable.**

Local-first governance, workspace monitoring, and evidence for AI-assisted software development.

[![VS Code Marketplace](https://img.shields.io/badge/VS_Code-Install-007ACC?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=MythologIQ.mythologiq-failsafe)
[![Open VSX](https://img.shields.io/badge/Open_VSX-Install-orange)](https://open-vsx.org/extension/MythologIQ/mythologiq-failsafe)
[![Latest Release](https://img.shields.io/github/v/release/MythologIQ-Labs-LLC/FailSafe)](https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue)](LICENSE)

Developing FailSafe? Start with the [Architecture Index](docs/ARCHITECTURE_INDEX.md).

</div>

## Understand and govern AI-assisted development

AI coding agents can write code faster than teams can always review their decisions. FailSafe adds a local, inspectable governance layer to your editor workflow. It helps you see what changed, understand relevant risks, establish intent, and retain evidence for review.

FailSafe is a VS Code extension with a Monitor and a broader Console. It **does not** promise that every agent action is intercepted, that arbitrary processes are sandboxed, or that VS Code editor saves can be prevented. Controls depend on the action path and integration involved.

## What you can do with FailSafe

- **See workspace activity.** Review Sentinel findings, change signals, and operational risk in the Monitor and Console.
- **Work from explicit intent.** Associate work with an active intent and review policy decisions and higher-risk approvals.
- **Review supported agent workflows.** Inspect governed changes and apply them deliberately, rather than assuming every agent write is automatically safe.
- **Trace decisions and evidence.** Use checkpoints, audit history, and governance records to understand what happened and what remains unverified.
- **Bring external work into governance.** Opt-in Jira and Linear issue previews can become reviewed local intent drafts. Other integrations offer risk ingestion, agent observations, or notifications, depending on their capabilities.

## See it in action

![FailSafe Console overview](FailSafe/extension/media/FailSafe-Overview.PNG)

![FailSafe Monitor sidebar](FailSafe/extension/media/FailSafe-Sidebar.PNG)

For more screens, see the [UI and technical reference](docs/archive/README_LEGACY_REFERENCE.md).

## Get started

1. **Install** FailSafe from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MythologIQ.mythologiq-failsafe) or [Open VSX](https://open-vsx.org/extension/MythologIQ/mythologiq-failsafe).
2. **Open** a project workspace in VS Code or Cursor.
3. **Open the Console** with `FailSafe: Open Console (Browser Popout)` or `Ctrl+Alt+F`.
4. **Inspect your workspace** with `FailSafe: Audit Current File`.
5. **Configure governance** with `FailSafe: Set Up Agent Governance` if you want supported agents to receive FailSafe guidance.

The extension's [full getting-started and command reference](FailSafe/extension/README.md) explains optional setup and platform constraints.

## Local-first by design

FailSafe's core monitoring and governance run locally. External integrations are opt-in and may send data to their configured providers when you invoke them. Review each integration's privacy and permission contract before enabling it. Local-first is not a claim that every optional integration is offline.

## Integration reality and boundaries

FailSafe has **opt-in, capability-specific integrations**, not a universal agent or MCP enforcement proxy. Some integrations fetch evidence, some produce notifications, and a smaller set can gate supported actions. Configured is not proof of connected or operational; see the [canonical integration portfolio](docs/architecture/INTEGRATION_PORTFOLIO.md) and its per-integration contracts for actual feature states, network egress, tests, and unresolved gaps.

- **MCP clients:** A shared stdio client substrate currently serves the Bicameral and Open Design integrations. It does not automatically govern or connect to arbitrary third-party MCP servers. The optional MCP catalog configures selected servers, subject to its documented checks.
- **FailSafe MCP server:** Governance tools exist in extension source, but the in-process stdio transport is **not reachable by external MCP clients** today ([B209 and contract](docs/architecture/integrations/failsafe-mcp-server.md)). Do not treat an extension startup notice as evidence of a functioning external server.
- **Evidence and verification:** The ledger records governance and supported delivery reviews, with limitations documented in the [ledger-integrity issues](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/473). A verified, production-connected SHIELD PASS publisher is not wired; the user-facing GitHub command produces a **neutral manual advisory**. FailSafe does **not** currently verify arbitrary production database outcomes or integrate natively with third-party outcome-verification platforms.
- **Enforcement scope:** Supported tool/commit boundaries can refuse actions, but editor-save policy is observational, a disposable Git worktree is not a process sandbox, and external write prevention is not universal. The Agent Marketplace installer remains disabled pending isolation and scanner qualification.

A proposed integration, a tested module, a reachable service, and a released capability are different states. These READMEs describe what is usable; the canonical [Architecture Index](docs/ARCHITECTURE_INDEX.md) remains the authority for design decisions.

## Current release and what's coming

**Current Release**: v6.0.9, the latest published release ([release notes](https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/tag/v6.0.9)). See the [release history](CHANGELOG.md) for fixes, security corrections, and packaged platform support.

Newer work on `main`, including Workspace Architecture and Delivery views, may not yet be available in the marketplace release. Check [GitHub Releases](https://github.com/MythologIQ-Labs-LLC/FailSafe/releases) before assuming a repository feature is installed.

## For developers and agentic contributors

**Start here: [Architecture Index](docs/ARCHITECTURE_INDEX.md).** It routes you to canonical design documents, existing decisions, related implementation contracts, and verification. Search that index before adding a new architecture document or changing a design boundary.

- [Architecture Index](docs/ARCHITECTURE_INDEX.md): the design-intent spine and document registration path.
- [Governance Index](docs/GOVERNANCE_INDEX.md): Qor-logic governance artifact authority, tiers, and history.
- [Contributing](CONTRIBUTING.md): how to make and review contributions.
- [Integration portfolio](docs/architecture/INTEGRATION_PORTFOLIO.md): value contracts and current integration assessments.
- [Historical technical README](docs/archive/README_LEGACY_REFERENCE.md): detailed material previously carried in this landing page; not canonical authority.

FailSafe is open source under the [Apache 2.0 license](LICENSE).
