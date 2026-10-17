# FailSafe Architecture Index

**Last Updated:** 2026-10-17 (#531: registered the managed architecture index design, row `managed-architecture-index`; #530: registry, normative scope, legacy prefixes and the `check-architecture-index.cjs` validator)

This is the developer entry point for **where design authority lives**: which document owns which design decision, what is related to it, and what is only history. The product-facing [README](../README.md) links here.

The [Governance Index](GOVERNANCE_INDEX.md) stays the authority for governance artifacts, their tiers and their freshness. This index has no tiers and no freshness tables; it routes design questions to the right document. It does not replace the Qor-logic ledger, and a registry row is not an audit verdict or a seal.

## Architectural documentation decision path

1. **Find** the domain in the [registry](#registry) and read its document, status and related rows.
2. **Search** existing design documents, plans, tests and Qor artifacts for the same responsibility.
3. **Choose:** amend the existing canonical document by default. Create a new document only when its scope, lifecycle, audience or governance level requires it, and say why in the plan.
4. **Register** every new normative document in the registry in the same change that creates it, with its owner, domain, status (`canonical`, `proposed`, `descriptive`, `superseded` or `historical`), related rows, supersession and the event that must update it. A document under `docs/` with status `canonical` or `proposed` is also registered in a [Governance Index](GOVERNANCE_INDEX.md) tier.
5. **Govern** the decision through the normal Qor-logic cycle (`/qor-plan`, `/qor-audit`, `/qor-implement`, `/qor-substantiate`). Registration does not stand in for any of them.
6. **Verify** with the validator (see [Verification](#verification)). It fails on an unregistered normative document, a broken or unsafe link, a duplicate id or path, two canonical documents for one domain, a dangling or circular supersession, and a missing Governance Index registration.

## Rules and non-goals

- Exactly one `canonical` document per domain. Other documents may describe the same subsystem from another view; they are `descriptive` and say which canonical row they relate to.
- Statuses mean:
  - `canonical`: the designated authority for its domain.
  - `proposed`: intended authority that has not been accepted yet.
  - `descriptive`: describes or summarizes; never the authority for a design decision.
  - `superseded`: replaced; the row that replaces it names it in `supersedes`.
  - `historical`: retained evidence, not authority.
- This index points to design intent. It is not a second ledger, a separate truth database or a reason to rewrite past decisions.
- A possible overlap between two documents is a human review item. Similar text is not proof of duplication, and the validator does not judge meaning.
- Historical plans and governance artifacts stay discoverable after they are superseded. Nothing here edits them.
- Maintaining this index sends no repository content to a third-party service.

## Registry

| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |
|---|---|---|---|---|---|---|---|---|---|---|
| architecture-navigation | architecture navigation | [Architecture Index](ARCHITECTURE_INDEX.md) | canonical | `/qor-plan`, `/qor-audit` | - | governance-artifact-registry, product-entry | #769, [#530](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/530) | `FailSafe/extension/scripts/check-architecture-index.cjs` | `FailSafe/extension/src/test/docs/architecture-index.test.cjs` | `/qor-plan` when a normative architecture document is added, moved, superseded or retired |
| managed-architecture-index | managed-architecture-index | [Managed Architecture Index](architecture/MANAGED_ARCHITECTURE_INDEX.md) | canonical | `/qor-plan` | - | architecture-navigation | [#531](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/531) | unknown | unknown | `/qor-plan` when discovery, bootstrap, the proposal routes or the Architecture view change |
| runtime-composition | runtime composition and module boundaries | [Architecture Baseline](ARCHITECTURE_PLAN.md) | canonical | `/qor-plan` updates; `/qor-audit` reviews | - | runtime-composition-overview | - | unknown | unknown | `/qor-plan` when runtime boundaries or module composition change |
| repository-layout | repository file layout | [File Structure Standard](FILE_STRUCTURE_STANDARD.md) | canonical | manual; `/qor-organize` enforces | - | integration-folder-structure | - | unknown | unknown | `/qor-organize` when the standard layout changes |
| integration-folder-structure | integration folder structure | [Integration Folder Structure Standard](integrations/INTEGRATION_STRUCTURE_STANDARD.md) | canonical | `/qor-plan` | - | repository-layout, external-integration-api-sources | - | unknown | unknown | `/qor-plan` when the required layout of an integration folder changes |
| plugin-interface | plugin interface | [Plugin Interface Proposal](PLUGIN_INTERFACE_PROPOSAL.md) | proposed | manual | - | - | - | unknown | unknown | `/qor-plan` when the plugin interface is accepted, changed or dropped |
| development-tracker-ui | development tracker ui | [Development Tracker Design Standard](design/DEVELOPMENT_TRACKER_STANDARD.md) | canonical | `/qor-plan` | - | - | - | unknown | unknown | `/qor-plan` when the tracker engine, its data model or its design source changes |
| shadow-genome-ui | shadow genome ui | [Shadow Genome UI Design](design/SHADOW_GENOME_UI.md) | canonical | `/qor-plan` | - | - | [#196](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/196) | unknown | unknown | `/qor-plan` when the Shadow Genome view's model or interactions change |
| voice-brainstorm | voice brainstorm | [Voice Brainstorm Specification](specs/VOICE_BRAINSTORM_SPEC.md) | canonical | `/qor-plan` | - | - | - | unknown | unknown | `/qor-plan` when the Brainstorm voice pipeline changes |
| runtime-composition-overview | runtime composition overview | [Architecture Overview (wiki)](wiki/Architecture-Overview.md) | descriptive | `/qor-plan` | - | runtime-composition | - | unknown | unknown | `/qor-document` when the wiki is refreshed |
| governance-artifact-registry | governance artifact registry | [Governance Index](GOVERNANCE_INDEX.md) | canonical | every cycle that touches governance | - | architecture-navigation | - | unknown | `FailSafe/extension/src/test/governance/governance-index-publication.test.cjs` | every cycle that writes governance |
| product-intent | product intent | [Concept](CONCEPT.md) | canonical | `/qor-bootstrap` | - | - | - | unknown | unknown | `/qor-ideate` and an audit when the product's intent changes |
| system-state-snapshot | system state | [System State](SYSTEM_STATE.md) | descriptive | `/qor-document` SESSION_DOCS + `/qor-substantiate` | - | - | - | unknown | `FailSafe/extension/src/test/governance/system-state-currency.test.cjs` | `/qor-substantiate` after each seal |
| integration-catalog-overview | integration catalog | [Integrations](INTEGRATIONS.md) | descriptive | `/qor-plan` | - | integration-folder-structure, external-integration-api-sources | - | unknown | unknown | `/qor-document` when an integration is added or changed |
| external-integration-api-sources | external integration api sources | [Integration Documentation Index](integrations/INTEGRATION_DOCS_INDEX.md) | descriptive | `/qor-plan` | - | integration-folder-structure | - | unknown | unknown | every cycle that adds or changes an external API name |
| product-entry | product entry | [README](../README.md) | descriptive | `/qor-document` RELEASE_METADATA + `/qor-repo-release` | - | architecture-navigation | - | unknown | unknown | `/qor-repo-release` at each release |
| release-notes | release notes | [Changelog](../CHANGELOG.md) | descriptive | `/qor-document` RELEASE_METADATA | - | - | - | unknown | unknown | `/qor-implement` writes `[Unreleased]`; the release names the section |

Column rules, as the validator reads them:

- `id` is unique. `domain` is compared after trimming and lower-casing, as a string; two `canonical` rows may not share one.
- `doc` is a markdown link relative to `docs/` and must be a tracked file. Each document has one row.
- `owner` is a maintaining role or skill, not a person. Where the Governance Index registers the document, the owner is copied from it.
- `supersedes` and `related` are comma-separated registry ids, or `-`.
- `governance_ref` is a Qor plan file, a ledger entry number (`#NNN`), an issue link, or `-`. It is never invented.
- `contract` is the code boundary or contract document, and `verification` is a test path. Either may be `unknown`.
- `updated_by` names the event or skill that must update the document. It is required for `canonical` and `proposed` rows.
- A value is path-shaped when it is a markdown link with a relative target, or a backticked token that contains `/` or ends in a file extension. `#NNN`, http(s) and mailto links, `-`, `unknown` and skill names beginning `/qor-` are not. Link targets resolve from `docs/`, backticked paths from the repository root, and a `#fragment` is ignored. Every path-shaped value must be a tracked file, and none may be absolute (a leading `/` or a drive letter), contain a backslash, or leave the repository.
- Cells cannot contain a `|` character.

## Normative scope

A tracked Markdown file that matches one of these globs, and is not under a legacy prefix, is a normative architecture document and must have a registry row.

```architecture-normative
docs/ARCHITECTURE*.md
docs/architecture/**/*.md
docs/design/**/*.md
docs/specs/**/*.md
docs/integrations/*STANDARD*.md
docs/FILE_STRUCTURE_STANDARD.md
docs/PLUGIN_INTERFACE_PROPOSAL.md
docs/wiki/Architecture-*.md
docs/**/*ARCHITECTURE*.md
docs/**/*DESIGN*.md
docs/**/*STANDARD*.md
docs/**/*_SPEC*.md
```

Matching is case-insensitive on `/`-separated paths. `*` never crosses a `/`, and `**/` matches zero or more whole folders, so `docs/**/*_SPEC*.md` also matches `docs/X_SPEC.md`.

The tracked-file list comes from `git ls-files`, which sees tracked and staged files only. `docs/` is ignored by `.gitignore`, so a new document under it is invisible to the validator until it is added with `git add -f`. That is the same act that publishes it.

## Legacy and historical documents

Files under these prefixes are historical or reference evidence. They are never design authority and are not edited to make them current.

```architecture-legacy
docs/Planning/**
docs/archive/**
docs/plan-*.md
docs/research-brief-*.md
docs/research/**
docs/releases/**
docs/release-runbook-*.md
```

- A file under a legacy prefix is never normative, even when its name matches a normative glob. For example, `docs/research/integrations/INTEGRATION_OPEN_DESIGN_CONTRACT_REVIEW.md` matches `docs/**/*DESIGN*.md` and is excluded by this rule.
- No `canonical` or `proposed` row may point under a legacy prefix.
- Every prefix above must match at least one tracked path, so the list cannot rot silently.
- The local `docs/deep-review/` and `docs/v5/` folders are untracked and are treated the same way; they are not listed above because they have no tracked path to check. The retired product page in `docs/wiki/` is a retirement note and matches no normative glob.
- **Incremental adoption.** A legacy document becomes authoritative only by copying or summarizing its content into a registered canonical document through the decision path above. The legacy file itself is never promoted or rewritten. The new or amended canonical row names the legacy source in its `related` prose or in the plan that adopted it.

## Not yet published

These documents exist locally but are not tracked, so they cannot be registered or linked:

- `docs/FAILSAFE_SPECIFICATION.md`: the top-level product specification. The README links to it three times and names it in its tree diagram. Publishing or delisting it is an owner decision, recorded in [BACKLOG](BACKLOG.md).
- `docs/README.md`: the index of the `docs/` tree. The Governance Index registers it in Tier 5 although it is untracked; that is also recorded in [BACKLOG](BACKLOG.md).

## Review notes

- `docs/ARCHITECTURE_PLAN.md` (row `runtime-composition`) still carries a v5.9.0 release header and an old branch name. Do not read current code truth from that header; the reconcile is filed in [BACKLOG](BACKLOG.md).

## Integration contracts as architecture dependencies

The customer-value contracts tracked in [#532](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/532) are distinct from the [Integration Documentation Index](integrations/INTEGRATION_DOCS_INDEX.md), which tracks external API sources. Each value contract should link its API documentation, trust and data boundary, local artifacts, product UI, governance seam and end-to-end tests. A connector description is not evidence of a working customer journey. Turning this index into a product feature (discovery, bootstrap and duplicate review inside FailSafe) is [#531](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/531).

## Verification

From the repository root:

```bash
node FailSafe/extension/scripts/check-architecture-index.cjs --repo-root .
```

It prints one `[architecture-index] <code>: <detail>` line per problem and ends with `PASS` or `FAIL` (exit 0 or 1). A failure of `git ls-files` is a `FAIL`. The codes are `missing-section`, `unregistered-normative`, `missing-path`, `duplicate-id`, `duplicate-path`, `conflicting-canonical`, `bad-status`, `bad-row`, `dangling-ref`, `superseded-without-successor`, `supersede-cycle`, `broken-link`, `unsafe-link`, `not-in-governance-index`, `competing-index`, `missing-off-ramp`, `legacy-prefix-missing`, `authority-in-legacy` and `not-dual-registered`. An `unregistered-normative` message lists up to five existing documents to amend instead (canonical rows in the same folder first, then rows that share words with the new file's path) and always ends with `existing: docs/ARCHITECTURE_INDEX.md#registry`.

`FailSafe/extension/src/test/docs/architecture-index.test.cjs` runs under `npm run test:node` (and so in the PR Full Test Suite and the release workflow). It holds every code to a fixture and runs the check against this repository.

The check compares strings: explicit metadata, links, tracked state, uniqueness and registration. It does not prove that two documents differ in meaning, approve a design, or replace a Qor audit or seal.
