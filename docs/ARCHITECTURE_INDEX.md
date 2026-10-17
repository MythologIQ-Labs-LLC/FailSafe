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



## Architecture ownership record (proposed contract for #530)

Each new **normative** architecture entry will declare the fields below. This is a contract proposal, not an already enforced repository gate.

| Field | Required interpretation |
| --- | --- |
| `domain` and `decision_id` | Stable logical responsibility and a unique scoped decision or contract identity |
| `canonical_path` | One indexed authoritative document for that scoped responsibility |
| `status` | `proposed`, `active`, `superseded`, or `historical` |
| `owner` | Maintainer/reviewing role, not necessarily an individual person's identity |
| `related` and `supersedes` | Resolved links to overlapping, upstream and replaced decisions |
| `implementation` and `verification` | Code boundary and representative executable tests; unknown is explicit |
| `governance_ref` | Existing Qor plan/decision/seal evidence when available; never manufacture one |

**Pre-create collision check:** find existing entries with the same `domain`/`decision_id`, identical paths, explicit `supersedes` links, or overlapping responsibilities. Exact collisions block registration until reconciled; possible semantic overlaps request human review. A missing link or unindexed proposed normative doc must not silently become an active authority.

**Authority transitions:** Register proposed entries before documentation PR review; activate only after the existing Qor governance decision and accepted code/document review. Superseding preserves the old entry and explains the replacement. No destructive deletion or rehashing of Qor evidence.

**Enforcement boundaries:** First-stage repository CI can verify explicit metadata, links, uniqueness and scope. A future FailSafe extension can preflight its governed writes and warn on unobserved files. Neither method proves full semantic uniqueness or blocks arbitrary external writes. See [#531](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/531).

## Integration contracts as architecture dependencies

The customer-value contract tracked in [#532](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/532) is distinct from the existing [Integration Documentation Index](integrations/INTEGRATION_DOCS_INDEX.md), which tracks external API sources. Each value contract should link its API documentation, trust/data boundary, normalized local artifacts, product UI, governance seam, graph relations and end-to-end tests. Existing connector descriptions are not evidence of a working customer journey.

## Structural verification (initial implementation)\n\nRun `node tools/validate-architecture-index.cjs` from repository root to check local index references and mandatory governance pointers; run `node --test tools/validate-architecture-index.test.cjs` for negative fixtures. These checks are structural only and are not proof of semantic deduplication, native Qor approval, or comprehensive documentation coverage. CI wiring and new normative-document registration remain acceptance work in #530.\n\n## Next implementation steps

- [#530](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/530): validate this seed against existing tier rules, reconcile stale architecture pages, add structural index validation and required registration metadata.
- [#531](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/531): make index discovery, bootstrap, duplicate review and native Qor integration a customer-facing FailSafe feature.
- [#532](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/532): add outcome-based integration contracts and relationships, not only connection metadata.

**Release boundary:** This is proposed documentation on a separate PR and is not part of the active v6.0.8 integration candidate.
