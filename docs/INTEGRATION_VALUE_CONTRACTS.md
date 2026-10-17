# FailSafe Integration Value Contracts (Design Baseline)

> **Status: proposed architecture, issue #532.** This document is a customer-outcome companion to [the existing integration API documentation registry](integrations/INTEGRATION_DOCS_INDEX.md). It does not replace that registry, grant permissions, or claim that proposed capabilities are shipped. Register it in the canonical [Architecture Index](ARCHITECTURE_INDEX.md) when #530 is accepted. No expansion of the v6.0.8 release scope.

## Decision rule

An integration is worth maintaining when it demonstrably makes a customer action more governable, observable or verifiable than the same operation performed by an unconstrained agent. Authentication success and transport conformance are prerequisites, **not** evidence of customer value.

Each adapter's product contract must state:
- **User job / counterfactual:** what outcome is unavailable, nonrepeatable, or unsafe with an ordinary agent alone?
- **Direction and exact payload:** incoming/outgoing fields, repository data, source code, topology or graph relationships, retained evidence and secrets; explicit consent for all outbound data.
- **Transformation and provenance:** identity, source timestamp/commit, local artifact and freshness; graph edge types only when source and confidence justify them.
- **User experience:** new view, action or decision and its degraded state.
- **Governance seam:** enforceable vs advisory scope and required approvals; handling of stale/unavailable sources.
- **Proof:** test of the real customer journey including negative assertions and observed application state, not only mocked API transport.
- **Decision:** INVEST, COMPLETE, MAINTAIN or RETIRE, with owner and reason.

## Portfolio starting matrix

All rows below are design dispositions pending individual acceptance review, not blanket shipping claims.

| Adapter | Current verified/code-described behavior | Customer outcome to evaluate | Provisional disposition |
| --- | --- | --- | --- |
| Jira | One issue read-only preview; user-approved local intent draft; no sync | Trace an external requirement to accepted architecture, governed changes and verified acceptance | COMPLETE |
| Linear | One issue read-only preview; user-approved local intent draft; no sync | Same intent-to-evidence chain; source revision must remain traceable | COMPLETE |
| GitHub Checks | Neutral advisory publishing; SHIELD PASS publisher not in production call path in v6.0.7 | Publish attestable commit-bound verdict, never an arbitrary PASS | INVEST |
| Bicameral MCP | Read decisions/drift, preflight L3, ratify with governance | Show architectural decision conflicts before approval, with durable source evidence | MAINTAIN |
| Open Design | Provenance and governed MCP surfaces, subject to current authorization limits | Connect accepted design intention to implementation and policy-bound change | COMPLETE |
| Continue / Aider | Disposable-worktree execution; not an OS/process sandbox | Preserve governed review before application, with clear escape limitations | COMPLETE |
| OpenHands | Historical export import as timeline evidence in v6.0.8 candidate; not live control | Agent execution linked to changes, approvals and provenance | COMPLETE |
| Cline / Roo / Kilo | Read-only risky tool permission auditing | Detect unsafe tool grants before operation and map findings to governed risks | MAINTAIN |
| SARIF | Offline scanner import to governed risk records | Link findings to impacted code, remediations and closing evidence | COMPLETE |
| Sentry | Pull production issues into risk register | Connect observed production failures to fixes and measured release outcomes | COMPLETE |
| Teams / Slack | Webhook governance notifications | Alert the accountable reviewer with relevant exception and provenance, no noisy event firehose | MAINTAIN |
| MCP Catalog / AGT | Dedicated integration surfaces; verify individual tools and permission boundaries | Govern discovery and installation rather than offering an unreviewed installer | COMPLETE |
| Voice Pack | Companion capability, optional | Accessibility and multimodal control with privacy and retention disclosures | MAINTAIN |

## Three vertical acceptance journeys

### External issue to trustworthy delivery

Jira/Linear issue identifier → reviewed intent (source version/hash) → existing architecture decision/reference → scoped code impact → governed agent changes → SHIELD evidence tied to commit → customer-visible outcome. **Only the first reviewed-intent step exists in the present tracker contract.** No automatic repository export or writeback.

### Production failure to explained remediation

Sentry observation → risk record with provenance/occurrence → bounded affected components (verified, not guessed) → approved repair → tests and release evidence → resolution displayed in FailSafe. No automatic outbound Sentry mutation until separately authorized.

### Agent run to accountable evidence

OpenHands export or Continue/Aider review → normalized timeline and affected worktree changes → policy decisions/approvals → commit evidence → traceable operator report. Distinguish historical observation from live interception and OS-level enforcement.

## Architecture/knowledge graph boundary

Define typed local edges such as `ISSUE_REQUESTS_INTENT`, `DECISION_GOVERNS_COMPONENT`, `CHANGE_TOUCHES_COMPONENT`, `CHECK_ATTESTS_COMMIT` and `INCIDENT_RELATES_TO_RISK`. Each edge requires source identity, observation time, confidence/evidence class, and revocation/staleness semantics. A label match is only a suggestion, not verified causality. Qor/native architectural authority stays with the canonical decision and its referenced ledger/plan, not with an inferred graph edge.

## Proposed acceptance checkpoints

1. Inventory all first-class and catalog integrations; verify documentation and current release vs RC-only vs proposed distinctions.
2. Publish an individual field-level ingress/egress inventory for each adapter, with tests asserting **no unexpected source-code/graph egress**.
3. Demonstrate one vertical journey in a real VS Code extension-host session, with a visible user outcome and evidence that persists across restart.
4. Reject a duplicate or stale import truthfully, without overclaiming synchronization.
5. Add user-centered value metrics (time to review, traceability completeness, false positive rate, governance decision latency) without inventing baseline numbers.
6. Route all architectural decisions/documents through #530, and product-level index bootstrap/governance through #531.

## Non-goals

Bulk Jira/Linear sync, automatic source-code exports, unreviewed permissions, fabricated graph relationships, blanket autonomous enforcement, and expanding the already merged v6.0.8 candidate.
