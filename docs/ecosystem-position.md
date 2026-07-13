# FailSafe — Ecosystem Position

_Where FailSafe sits in the AI-assisted software development lifecycle. Sources: this repository's public artifacts only (README, CONCEPT, FAILSAFE_SPECIFICATION, INTEGRATIONS docs, captured issue text). Maintained under GOVERNANCE_INDEX Tier 5._

## 1. What FailSafe is — and is not

FailSafe is an **Agent Debugger & Stability Monitor for AI-assisted development**: an open (Apache-2.0) VS Code/Cursor extension providing local-first, editor-level governance for AI coding workflows — trust, traceability, and safety for autonomous agent work. It is obtained from the **VS Code Marketplace and Open VSX**; both channels publish the **same build artifact** (single-VSIX release pipeline).

It is NOT (per `docs/CONCEPT.md`): a permissive system that allows unchecked agent actions; a logging-only solution without enforcement capability; or a replacement for human oversight on critical decisions. Organization-wide / cross-repository governance is explicitly **out of scope** for the extension — its governance domain is the open workspace.

## 2. The governance stack

```
Qor-logic  (upstream)   — owns governance SEMANTICS: SHIELD lifecycle doctrine, gate
   │                      schemas, the Merkle-chained META_LEDGER format, Shadow Genome.
   ▼
FailSafe   (this repo)  — the reference ENFORCEMENT CONSUMER: editor/runtime enforcement,
   │                      developer interaction, and presentation of governance evidence.
   ▼
The operator            — human gates: L3 approvals, branch-protection rulesets,
                          release reviewer gates, and the local review boundary.
```

The seam is defined by the program issue's own boundary statement: **"Qor-logic owns governance semantics. FailSafe owns developer-facing enforcement and presentation. This adapter is the compatibility seam between them."** The mechanical realization is the **versioned Qor-logic consumer adapter** (`src/qorlogic/consumer/`): every file-based governance artifact FailSafe consumes (META_LEDGER, FEATURE_INDEX, tracker manifest, audit gates) flows through one boundary that classifies it as `ok | unavailable | malformed | unsupported | stale` — fail-visible, never guessed into compatibility. (The adapter is the in-repo boundary mechanism; it ships with the next release.)

## 3. Sibling product: FailSafe Pro

FailSafe (this extension) guards the **editor**. **FailSafe Pro** is the desktop-native, higher-tier application for full-stack AI governance: OS-level enforcement, team workflows, and commercial distribution ([about FailSafe Pro](https://mythologiq.studio/products/failsafe-pro) · [download](https://mythologiq.studio/products/failsafe-download)). The two coexist on a workspace through the **shared filesystem** — governance state lives in files (`.failsafe/`, the META_LEDGER), and FailSafe's mutation bus watches those paths, so an external Pro process's writes refresh the extension's views without any cross-process protocol.

## 4. Where it sits in the SDLC loop

| Stage | FailSafe surface |
|---|---|
| **Plan** | SHIELD lifecycle gates (plan → adversarial audit PASS/VETO → implement → substantiate → seal), Merkle-ledger evidence chain |
| **Code** | Editor governance (Sentinel monitoring, enforcement modes), governed agent execution (ACP proxy, CLI wrappers), Mind Map ideation |
| **Review** | GitHub Checks verdict publication, PR↔issue linkage audit, SARIF ingestion |
| **Ship** | Release gates (SemVer gate, preflight, publish-block discipline), dual-marketplace parity |
| **Operate** | Sentry issue ingestion into the risk register, Slack/Teams notifications, transparency event stream |

## 5. Agent-ecosystem seams

| Seam | Authority class | Status |
|---|---|---|
| ACP enforce-proxy (Devin / any ACP agent) | observe / assist / **enforce** (cooperative path; OS-level is Pro's domain) | shipped |
| Continue + Aider governed CLI wrappers | assist/enforce (pre-run gate + post-run diff escalation) | shipped |
| OpenHands run observer | observe | shipped |
| Cline / Roo / Kilo MCP-policy audit | observe | shipped |
| Bicameral MCP + Open Design (MCP/SSE clients) | assist / observe | shipped |
| GitHub / Jira / Linear / Sentry / SARIF / Slack / Teams | external-read / external-action | shipped |
| Microsoft Agent Governance Toolkit installer | assist | shipped |
| VS Code Agents Window | — | parked upstream-preview; see `docs/VS_CODE_AGENTS_WINDOW.md` |
| Agent Host Protocol (AHP) | — | watchlist (BACKLOG B207) |

Every integration is **default-off** and operator-enabled.

## 6. Trust posture

Local-first by construction: integrations are opt-in; credentials are placed in request headers only and never echoed into results, logs, or diagnostics; network egress is bounded to operator-configured endpoints (plus a fixed GitHub-release allowlist for the optional voice pack); governance evidence stays in the workspace. Detail per integration: `docs/integrations/INTEGRATION_DOCS_INDEX.md`.

---

_Drift signals: the Pro positioning or published download link changes (BACKLOG B208 tracks a pending link ruling); the adapter boundary contract changes; a new agent-protocol seam ships._
