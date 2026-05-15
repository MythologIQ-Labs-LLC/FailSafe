# FailSafe Wiki

**Agent Debugger & Stability Monitor for AI-Assisted Development**

> _Local-first safety for AI coding assistants._

## Welcome

FailSafe is an open-source VS Code and Cursor extension that provides deterministic governance, stability monitoring, and audit trails for AI-assisted development. It adds intent-gated saves, Sentinel audits, and a ledgered audit trail so risky changes are surfaced and controlled.

This wiki is the comprehensive reference for FailSafe's architecture, configuration, and workflows.

## Quick Links

| Page | Description |
|------|-------------|
| [[Getting Started]] | Installation, first-run setup, and quick start guide |
| [[Architecture Overview]] | Core systems, layers, and directory structure |
| [[QoreLogic Governance Layer]] | Deterministic governance engine and policy system |
| [[Sentinel Enforcement Engine]] | File watching, heuristic analysis, and verdict system |
| [[SHIELD Lifecycle Workflow]] | The 6-phase governance lifecycle (S-H-I-E-L-D) |
| [[Governance Modes]] | Observe, Assist, and Enforce mode reference |
| [[Skills System]] | qor-logic skill ingestion and cross-agent portability |
| [[Command Center & Monitor]] | UI surfaces, Command Center tabs, and Monitor sidebar |
| [[Risk Grading & Policies]] | L1/L2/L3 risk classification and policy configuration |
| [[Trust Engine & Agents]] | Trust dynamics, agent personas, and quarantine |
| [[Ledger & Checkpoints]] | SOA Ledger, hash chains, and checkpoint integrity |
| [[MCP Server & CLI]] | Model Context Protocol server and headless integration |
| [[SRE Dashboard]] | SLO monitoring, fleet health, and error budgets |
| [[Configuration Reference]] | Complete settings and configuration file reference |
| [[API Reference]] | REST API endpoints for the ConsoleServer |
| [[Security Model]] | Cryptographic operations, attack surface, and hardening |
| [[FailSafe Pro]] | Comparison with FailSafe Pro desktop application |
| [[Troubleshooting & FAQ]] | Common issues and frequently asked questions |
| [[Contributing Guide]] | Development setup, branch policy, and PR process |
| [[Changelog & Releases]] | Release history and versioning policy |

## Core Concept

FailSafe separates **prompt-based safety** from **kernel-style safety**:

| Approach | How It Works | Risk |
|----------|-------------|------|
| **Prompt-based** | Asks the LLM to follow rules | LLM decides whether to comply |
| **Kernel-style** (FailSafe) | Evaluates actions at the editor boundary using deterministic policies | Code cannot be persuaded |

Governance decisions in FailSafe are made by deterministic TypeScript code, not by asking an LLM. A file containing `api_key` will always trigger L3 classification — no prompt can persuade the code to ignore this trigger.

## Current Release

**v5.1.0** (2026-05-06)

- Comprehensive E2E coverage methodology
- Monitor functional proof (B191)
- Playwright test harness with SHIELD progression specs
- Three latent Monitor bugs surfaced and fixed

## Resources

- **GitHub**: https://github.com/MythologIQ-Labs-LLC/FailSafe
- **VS Code Marketplace**: https://marketplace.visualstudio.com/items?itemName=MythologIQ.mythologiq-failsafe
- **Open VSX**: https://open-vsx.org/extension/MythologIQ/mythologiq-failsafe
- **FailSafe Pro**: https://mythologiq.studio/products/failsafe-pro
- **Specification**: `docs/FAILSAFE_SPECIFICATION.md`
