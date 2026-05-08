# Changelog & Release History

This page summarizes major releases. For the complete changelog, see [CHANGELOG.md](https://github.com/MythologIQ-Labs-LLC/FailSafe/blob/main/CHANGELOG.md).

## Release Policy

- **Versioning**: Semantic Versioning (MAJOR.MINOR.PATCH)
- **Release cadence**: As-needed, no fixed schedule
- **Release notes**: All changes documented in CHANGELOG.md
- **Tags**: Created on `main` after merge
- **Publishing**: VS Code Marketplace + Open VSX via GitHub Actions

## Major Releases

### v5.1.0 (2026-05-06) — Current

Comprehensive E2E coverage methodology + release-class CI gate (B199 Phase 1) + Monitor B191 functional proof.

**Key Changes**:
- Playwright test harness with SHIELD progression specs
- Release-class CI coverage gate for `feature` and `breaking` changes
- Fixed Monitor never bootstrapping in production (missing `type="module"`)
- Fixed SEAL phase rendering
- Fixed IDLE phase rendering
- 958 → 959 Mocha tests, 7 → 16 Playwright tests

### v5.0.0 (2026-04-25) — Major

Public reveal of FailSafe / FailSafe Pro product split. Skills ingestion from `qor-logic` PyPI package. Command Center reads workspace truth.

**Key Changes**:
- `qor-logic` package installer with auto-detected Python
- Workspace-truth UI (META_LEDGER, BACKLOG, plan files)
- ConsoleServer decomposition (1371→1177 lines)
- Voice & brainstorm UX with multilingual STT/TTS
- Security hardening (XSS, allowlist, voice substrate)
- Install transparency report

### v4.9.0 (2026-03-13)

Agent debugging, execution replay, and cross-agent skill portability.

**Key Changes**:
- Agent Run Replay and Execution Timeline
- Risk & Stability Indicators
- Shadow Genome and DiffGuard panels
- Cross-Agent Skill Propagation

### v4.8.0 (2026-03-13)

Agent execution visualization and debugging panels.

**Key Changes**:
- Agent Execution Timeline
- Risk & Stability Indicators
- Shadow Genome Debugging Panel

### v4.7.0 (2026-03-10)

Agent Marketplace and security scanning.

**Key Changes**:
- Agent Marketplace (11 repositories)
- Security Scanner integration (Garak/Promptfoo)
- Microsoft Agent Governance Toolkit Adapter
- Trust tiers for marketplace items

### v4.6.6 (2026-03-09)

Repository governance and workspace management.

**Key Changes**:
- Repository Governance as a Service
- Multi-workspace server registry
- Compliance metric in Monitor UI
- SHIELD phase tracker

### v4.6.0 (2026-03-08)

Section 4 Razor decomposition sprint.

**Key Changes**:
- ConsoleServer 3265→1124 lines across 16 extracted modules
- Voice brainstorm bug fixes
- Hook toggle UI enhancements
- Governance doc storage migrated to `.failsafe/governance/`

### v4.2.0 (2026-02-27)

Multi-agent governance fabric.

**Key Changes**:
- Runtime detection and governance injection for multiple AI agents
- Governance ceremony for multi-agent setup
- Undo Last Attempt
- Agent coverage dashboard

### v4.0.0 (2026-02-27)

Token economics and governance modes.

**Key Changes**:
- Token Economics Dashboard
- Governance Mode System (Observe/Assist/Enforce)
- Risk Register Panel
- Transparency Stream Panel
- Chat Participant (`@failsafe`)

### v3.6.0 (2026-02-17)

Governance modes introduced.

### v2.0.0 (2026-02-05)

Gold Standard repository skills and ambient integration.

### v1.0.0 (2026-01-22)

Initial stable release with Genesis UI, governance, and Sentinel.

## Upcoming Features (Roadmap)

- **CI/CD Pipeline Enforcer**: Headless Judge verification during PRs
- **Shared Core Axioms**: Team-wide policy synchronization
- **Air-Gapped Judge Verification**: Local LLM routing for zero-leak compliance
- **CLI Overseer Lite**: Lightweight CLI-compatible FailSafe

See [ROADMAP.md](https://github.com/MythologIQ-Labs-LLC/FailSafe/blob/main/docs/ROADMAP.md) for the full roadmap.
