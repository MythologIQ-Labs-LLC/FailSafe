# INTEGRATION — Cline / Roo / Kilo Contract Review (Issue #106)

> **Status:** STUB extracted 2026-06-02 for B-INT-8. Authoritative source is the
> embedded section "docs/research/integrations/INTEGRATION_CLINE_ROO_KILO_CONTRACT_REVIEW.md"
> inside `docs/research/FailSafe Integrations Research.md`. Full normalization of
> the packet into this file remains B-INT-8 work; this stub exists to capture the
> #106 disposition + the Agent_Sudo prior-art note (added below) on the record.

## Disposition

**Research-first, config-audit first.** Issue #106 is a **config-audit and
local-risk-detection** integration, NOT a deep runtime-interception project. The
stable, documented common ground across Cline, Roo, and Kilo is MCP configuration,
auto-approval controls, and local permission state.

**v1 (minimum safe slice):** read-only config parser + risk scorer only.
- Parse MCP/permission config (Cline `~/.cline/mcp.json`; Roo global `mcp_settings.json`
  + optional project `.roo/mcp.json` with `env`/`alwaysAllow`/`disabled`; Kilo
  namespaced `{server}_{tool}` allow/ask/deny).
- Redact `env` values / tokens on ingest (treat all config files as secret-bearing).
- Flag remote MCP transports, wildcard/persistent auto-approval, and shell-capable tools.
- Treat **Cline CLI defaults as unsafe** until explicitly set (docs tension: overview
  says "every action requires approval"; CLI reference defaults to act mode + auto-approve).

**Deferred (blocked):** IDE runtime interception / extension patching — no verified
stable interception API across these surfaces.

## Prior Art — Agent_Sudo (`Kisyntra/Agent_Sudo`)

Surfaced via an external comment on #106 (2026-06-01, by `Ram9199`). Read-only
due-diligence performed 2026-06-02; **no clone, no install.**

**What it is.** A local MCP permission gateway (Python, Apache-2.0, PyPI
`agent-sudo-mcp`). Deny-by-default approval proxy: risky tool calls (shell, file
writes, credential reads) are blocked → require human approval or a **scoped
delegation token (TTL / max-uses)** → execute once → re-block. Decisions append to
a **SHA-256 hash-chained JSONL audit log** with a `verify-audit` tamper check.
Explicitly "not a sandbox" — native tools bypass it unless routed through the gateway.

**Design takeaways worth mining for FailSafe (NOT adopting the dependency):**
- Scoped delegation tokens (TTL + max-use) are a concrete vocabulary for the
  "shell-capable tool → scoped delegation" risk class — input for the v2 runtime story.
- Hash-chained tool-call audit is the META_LEDGER pattern applied at tool granularity.
- The policy-vocabulary mapping proposed in the #106 comment is sound and aligns with
  FailSafe's verdict model: remote MCP → require approval/deny-unless-trusted;
  wildcard auto-approval → ask/deny by tool risk; shell tool → scoped delegation
  TTL/max-use; missing config → **fail closed for mutating tools**.

**Trust caveat (Tier-1 supply-chain bar, #90):** the project is very early-stage —
new org/account, minimal adoption, anonymous package authorship, and rapid
auto-released tags — so provenance and maturity are not yet established. Zero
runtime dependencies is a point in its favor. **Treat as prior art to read and
cite — not as a dependency** until an isolated-VM source review and a pinned,
reviewed version clear the supply-chain bar.

**Action:** cite this design in the v2 runtime-policy section when #106 advances past
the read-only audit slice. Do not `pipx install` or vendor it without an isolated-VM
source review and a pinned, reviewed version.

## Implementation checklist (v1)

- [ ] Read-only parsers for Cline, Roo, and Kilo configs.
- [ ] Redact env values and tokens on ingest.
- [ ] Flag remote transports, wildcard allows, and shell-capable tools.
- [ ] Treat Cline CLI defaults as unsafe until explicitly set.
- [ ] Defer runtime interception and extension patching.
- [ ] Tests: missing config, server namespacing, env redaction, Roo project-overrides-global
      precedence, Kilo namespaced MCP permission parsing, Cline remote-transport detection.
