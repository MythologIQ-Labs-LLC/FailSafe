[![Socket Badge](https://badge.socket.dev/openvsx/package/mythologiq.mythologiq-failsafe/5.3.3?platform=universal)](https://badge.socket.dev/openvsx/package/mythologiq.mythologiq-failsafe/5.3.3?platform=universal)

# QoreLogic Roadmap

This roadmap tracks the sprinted remediation plan and future enhancements.

_Last refreshed: 2026-06-02 — current release **v5.3.3** (2026-05-28)._

## v5.x — Current Era (Reveal + Integration)

The M-Core→M11 phases below were the v1–v4 remediation arc and are largely shipped. v5 reframed the product:

- **v5.0.0 — Product reveal & split.** FailSafe (open VS Code/Cursor governance extension) + **FailSafe Pro** (downloadable desktop/daemon for OS-level enforcement, team workflows) named publicly for the first time. Download: `https://mythologiq.studio/products/failsafe-download`.
- **v5.1.5 — Bicameral MCP integration.** 5-phase plan sealed (META_LEDGER #372); FX483–FX490 verified.
- **v5.2.x — Educational surface + Learn tab** (multimode); Open Design v1 (REST + SSE observer, Pattern A).
- **v5.3.3 — Integration Beta.** Open Design write path + L3-mediated `create_artifact`; razor/clobber cleanup.

**In progress / next:** the **Research-Gated Integration Expansion (M11)** below, currently blocked on the **B-INT-8 integration research gate** (issue #109) which must disposition issues #95–#108 before any tranche is planned.

## Remediation Phases (From GapAudit)

- **M-Core: Governing Substrate** - Establish the Axioms and the Sovereignty Protocol (ALIGN phase).
- **M0: Spec/Manifest Alignment** - Ensure alignment between spec and implementation.
- **M1: Storage + Ledger Backbone** - Establish persistence layers.
- **M2: Sentinel Enforcement Engine** - Implement active monitoring.
- **M3: QoreLogic Governance Layer** - Build persona and policy logic.
- **M4: Genesis UI Completion** - Finalize visualization and interaction.
- **M5: Platform Extensions** - Expand to MCP/CLI.

## Future Enhancements

### M6: Community Feedback Loop

- **Automated Issue Reporting**: Convert `.failsafe/feedback/{GUID}.json` reports into GitHub Issues.
- **User Consent Flow**: Interactive prompt asking user to "Send Feedback" after a session.
- **Sanitization**: Ensure PII/Secrets are stripped from feedback JSON before upload.

### M7: Economics & Transparency ✅ IMPLEMENTED (v4.0.0)

- **Token ROI Dashboard**: Visual quantification of token expenditure and context-sync savings. ✅ `failsafe.showEconomics` command.
- **Visual Chain of Governance**: Real-time tracing of the Tribunal workflow. ✅ Transparency Stream panel in sidebar.

### M8: Resilience ✅ IMPLEMENTED (v4.1.0–v4.2.0)

- **"Time-Travel" Rollbacks (FailSafe Revert)**: One-click remediation to revert AI code changes, reset Git head, and purge poisoned context. ✅ `failsafe.revertToCheckpoint` and `failsafe.undoLastAttempt` commands.
- **Break-Glass Protocol**: Emergency governance overrides with time-limited activation and full audit trail. ✅ v4.1.0.
- **Verdict Replay**: Deterministic re-execution of past governance decisions for audit verification. ✅ v4.1.0.
- **Multi-Agent Governance Fabric**: Runtime detection, config injection, and coverage dashboard for Claude, Copilot, Codex, and Agent Teams. ✅ v4.2.0.

### M9: Enterprise Security & CI/CD Shift-Left

- **CI/CD Pipeline Enforcer**: Headless Judge verification validating `failsafe_checkpoints` via cryptography during PRs.
- **Air-Gapped Judge Verification**: Support for routing L3 architectural audits to local LLMs (Ollama, LM Studio, etc.) for zero-leak compliance.

### M10: Organizational Posture

- **Shared "Core Axioms"**: IDE startup synchronization of enterprise-level Policy and Axioms to enforce team-wide Q-DNA compliance.

### M11: Research-Gated Integration Expansion

- **First tranche**: GitHub App checks, Linear read-only issue import, Semgrep/SARIF ingest, Slack notify-only, Continue headless wrapping, Aider diff gating, and MCP Registry read-only scoring.
- **Second tranche**: Jira read path, Microsoft Teams notify-only, Sentry read-only regression correlation, and OpenTelemetry evidence export/import.
- **Research-first**: Open Design path decision, OpenHands start-of-run policy adapter, and Cline/Roo/Kilo config-audit package.
- **Shared gate**: Every integration remains disabled by default, stores secrets only in host secret storage, avoids network calls unless explicitly enabled, and ships parser/webhook fixtures before implementation.
