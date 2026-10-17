# FailSafe Architecture Index

> **Status:** proposed navigational spine (issue #530). This index does not supersede the Qor-logic governance ledger or `docs/GOVERNANCE_INDEX.md`; existing normative authority remains where already defined until reviewed and explicitly migrated.

This is the developer entry point for **where design authority lives**, how to find related work before creating documents, and how proposed changes become reviewable. The product-facing [README](../README.md) links here.

## Authority map

| Domain | Existing canonical or candidate source | Relationship / migration state |
| --- | --- | --- |
| Governance artifact tiers, lifecycle, freshness and history | [Governance Index](GOVERNANCE_INDEX.md) | Existing authority; complementary to this architectural navigation index |
| Product intent and system behavior | [FailSafe Specification](FAILSAFE_SPECIFICATION.md) | Existing product/system description; verify authoritative sections before changes |
| Runtime composition and module boundaries | [Architecture Baseline](ARCHITECTURE_PLAN.md) | **Review required:** header references older v5.9.0/branch; never infer current code truth from stale metadata |
| Current-versus-historical system facts | [System State](SYSTEM_STATE.md) | **Review required:** long-running historical state file; header contains obsolete release and branch information |
| Integration contracts and boundaries | [Integrations](INTEGRATIONS.md), [integration documentation index](integrations/INTEGRATION_DOCS_INDEX.md), per-adapter README files | Existing references; customer-value contracts tracked by [#532](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/532) |
| Product experience and release behavior | [README](../README.md), [Changelog](../CHANGELOG.md) | Consumer-facing entry, not architecture authority |
| Qor decisions, plans, seals and immutable governance evidence | [Governance Index](GOVERNANCE_INDEX.md) and repository Qor artifacts | Preserve native governance and historic chain; recovery issue [#467](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/467) remains open |
| Repo bootstrap and managed architecture-index feature | [#531](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/531) | Proposed product capability, not currently shipped |

## Architectural documentation decision path

1. **Find** the domain in this index and inspect its current designated source, status, and related documents.
2. **Search** existing design, plans, ADRs, tests, and Qor artifacts for the same responsibility and overlapping behavior.
3. **Choose:** amend the existing authoritative document by default; create a separate document only when scope, lifecycle, audience, or governance level demonstrably requires it.
4. **Register** any new normative design document here with its owner/domain, status (`proposed`, `active`, `superseded`, `historical`), links to related and overlapping documents, and supersession relationship.
5. **Govern** the decision through the existing native Qor-logic process, respecting immutable history and its actual enforcement limits. An index registration does not constitute a passed audit or seal.
6. **Verify** references, ownership and contract/test links. Issue #530 covers automated duplicate/omission checks; do not claim those checks already exist.

## Rules and non-goals

- Exactly one designated normative authority per **specific decision or contract**. Many complementary documents may describe different views of the same subsystem.
- An index entry points to design intent; it is not a shadow architectural database, a second Qor ledger, or an excuse to rewrite past decisions.
- Treat an overlapping document as **review-needed** until a human resolves true semantic duplication. Text similarity alone is not authoritative proof.
- All statuses must distinguish shipped behavior from release-candidate implementation, historical architecture, and proposals.
- No source-code or repository content is sent to third-party services merely to maintain this index.
- Historic plans and governance artifacts remain discoverable even when superseded.

## Next implementation steps

- [#530](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/530): validate this seed against existing tier rules, reconcile stale architecture pages, add structural index validation and required registration metadata.
- [#531](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/531): make index discovery, bootstrap, duplicate review and native Qor integration a customer-facing FailSafe feature.
- [#532](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/532): add outcome-based integration contracts and relationships, not only connection metadata.

**Release boundary:** This is proposed documentation on a separate PR and is not part of the active v6.0.8 integration candidate.
