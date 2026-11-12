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

**A recent call is not end-to-end qualification or proof of customer value.** An integration may be configured or successfully contact its service without proving the entire workflow works. Every advertised action needs independent host and provider evidence. FailSafe's internal governance MCP service uses an in-process stdio transport and is **not reachable by external MCP clients**. A supported agent workflow is not proof that every agent write is intercepted.

## What you can do with FailSafe

- **See workspace activity.** Review Sentinel findings, change signals, and operational risk in the Monitor and Console.
- **Work from explicit intent.** Associate work with an active intent and review policy decisions and higher-risk approvals.
- **Review supported agent workflows.** Inspect governed changes and apply them deliberately, rather than assuming every agent write is automatically safe.
- **Trace decisions and evidence.** Use checkpoints, audit history, and governance records to understand what happened and what remains unverified.
- **Bring external work into governance.** Opt-in Jira and Linear issue previews can become reviewed local intent drafts. Other integrations offer risk ingestion, agent observations, or notifications, depending on their capabilities.

## See it in action

[![Poster for the narrated FailSafe v6.0.12 walkthrough, From Change to Confidence](https://raw.githubusercontent.com/Knapp-Kevin/MythologIQ/c96560437c974e7de08504493a2608641fe602d2/public/assets/failsafe-v6.0.12/video/failsafe-6.0.12-from-change-to-confidence-poster.jpg)](https://raw.githubusercontent.com/Knapp-Kevin/MythologIQ/c96560437c974e7de08504493a2608641fe602d2/public/assets/failsafe-v6.0.12/video/failsafe-6.0.12-from-change-to-confidence.mp4)

[Watch the v6.0.12 walkthrough (1:53, MP4)](https://raw.githubusercontent.com/Knapp-Kevin/MythologIQ/c96560437c974e7de08504493a2608641fe602d2/public/assets/failsafe-v6.0.12/video/failsafe-6.0.12-from-change-to-confidence.mp4) · [English captions](https://raw.githubusercontent.com/Knapp-Kevin/MythologIQ/c96560437c974e7de08504493a2608641fe602d2/public/assets/failsafe-v6.0.12/video/failsafe-6.0.12-from-change-to-confidence.en.vtt) · [Transcript](https://github.com/Knapp-Kevin/MythologIQ/blob/c96560437c974e7de08504493a2608641fe602d2/public/assets/failsafe-v6.0.12/transcript.md) · [Capture provenance and limits](https://github.com/MythologIQ-Labs-LLC/FailSafe/blob/aa7380381a7428364816c144279652ba3bf638e3/docs/marketing/failsafe-v6.0.12/PROVENANCE.md)

The film shows the published v6.0.12 extension in VS Code using a **fictional project**. Developer edits were scripted for the recording; no AI agent performed them. A denied editor save is **reported, not prevented**, and the film does not demonstrate a completed governance approval or release seal. Media links are pinned to reviewed source assets, not to an unverified website deployment.

### Screenshots from v6.0.12

![FailSafe v6.0.12 Console and Monitor sharing a dark theme, composited from simultaneous recordings](https://raw.githubusercontent.com/Knapp-Kevin/MythologIQ/c96560437c974e7de08504493a2608641fe602d2/public/assets/failsafe-v6.0.12/screenshots/web/06-homepage-console-monitor-6.0.12.webp)

*Console and Monitor in the same theme (composite of two simultaneous recordings).*

![VS Code showing the FailSafe v6.0.12 Monitor sidebar next to the fictional demo repository](https://raw.githubusercontent.com/Knapp-Kevin/MythologIQ/c96560437c974e7de08504493a2608641fe602d2/public/assets/failsafe-v6.0.12/screenshots/web/02-monitor-vscode-dark.webp)

*The FailSafe Monitor inside VS Code.*

For older screenshots and deeper technical references, see the [historical UI reference](docs/archive/README_LEGACY_REFERENCE.md).

## Get started

1. **Install** FailSafe from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MythologIQ.mythologiq-failsafe) or [Open VSX](https://open-vsx.org/extension/MythologIQ/mythologiq-failsafe).
2. **Open** a project workspace in VS Code or Cursor.
3. **Open the Console** with `FailSafe: Open Console (Browser Popout)` or `Ctrl+Alt+F`.
4. **Inspect your workspace** with `FailSafe: Audit Current File`.
5. **Configure governance** with `FailSafe: Set Up Agent Governance` if you want supported agents to receive FailSafe guidance.

The extension's [full getting-started and command reference](FailSafe/extension/README.md) explains optional setup and platform constraints.

## Local-first by design

FailSafe's core monitoring and governance run locally. External integrations are opt-in and may send data to their configured providers when you invoke them. Review each integration's privacy and permission contract before enabling it. Local-first is not a claim that every optional integration is offline.

## Current release and what's coming

**Current Release**: v6.0.12, the latest release ([release notes](https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/tag/v6.0.12)). See the [release history](CHANGELOG.md) for fixes, security corrections, and packaged platform support.

Newer work on `main` may not yet be available in the marketplace release. Check [GitHub Releases](https://github.com/MythologIQ-Labs-LLC/FailSafe/releases) before assuming a repository feature is installed.

## For developers and agentic contributors

**Start here: [Architecture Index](docs/ARCHITECTURE_INDEX.md).** It routes you to canonical design documents, existing decisions, related implementation contracts, and verification. Search that index before adding a new architecture document or changing a design boundary.

- [Architecture Index](docs/ARCHITECTURE_INDEX.md): the design-intent spine and document registration path.
- [Governance Index](docs/GOVERNANCE_INDEX.md): Qor-logic governance artifact authority, tiers, and history.
- [Contributing](CONTRIBUTING.md): how to make and review contributions.
- [Integration portfolio](docs/architecture/INTEGRATION_PORTFOLIO.md): value contracts and current integration assessments.
- [Historical technical README](docs/archive/README_LEGACY_REFERENCE.md): detailed material previously carried in this landing page; not canonical authority.

FailSafe is open source under the [Apache 2.0 license](LICENSE).
