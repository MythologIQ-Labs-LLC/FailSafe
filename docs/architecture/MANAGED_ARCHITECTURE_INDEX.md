# Managed Architecture Index (ADR, #531)

**Status:** accepted for the first vertical slice (plan `plan-531-architecture-governance.md`, audit PASS at iteration 2).
**Registry row:** `managed-architecture-index` in the [Architecture Index](../ARCHITECTURE_INDEX.md).
**Design source for the view:** the Integrations Catalog renderer (`FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js`).

## Context

[#530](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/530) gave this repository one checked navigation spine for design intent: `docs/ARCHITECTURE_INDEX.md`, a registry table, an `architecture-normative` glob block, an `architecture-legacy` prefix block and `check-architecture-index.cjs`. [#531](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/531) asks FailSafe to offer the same spine to the repositories it governs: find an existing index, bootstrap one safely when there is none, show documents that match the architecture globs but have no registry row, and route every decision about a document through a human.

Two constraints shape the slice:

- FailSafe sees the filesystem after the fact. Editors, agents and other tools write documents FailSafe cannot block. Only the writes FailSafe itself makes, and the decisions it records, are enforceable.
- The validator compares strings. It cannot prove that two documents mean the same thing, and nothing here claims it can.

## Decision

### LD1: design first

This document is written before code, registered as a `canonical` row (domain `managed-architecture-index`) in the Architecture Index and in Governance Index Tier 2, and checked by `node FailSafe/extension/scripts/check-architecture-index.cjs --repo-root .`.

### LD2: one validator core, two profiles

The pure functions of `check-architecture-index.cjs` move to `FailSafe/extension/scripts/lib/architecture-index-core.cjs`. Every function takes a **profile**:

| Field | FailSafe-repo profile | User-repo profile |
|---|---|---|
| `indexPath` | `docs/ARCHITECTURE_INDEX.md` | setting `failsafe.architecture.indexPath`, default `docs/ARCHITECTURE_INDEX.md` |
| `linkBase` | `posix.dirname(indexPath)` = `docs` | `posix.dirname(indexPath)` |
| `registryTail` | `existing: <indexPath>#registry` | same rule |
| default normative globs | the repository's own block | `ARCHITECTURE*.md`, `docs/ARCHITECTURE*.md`, `docs/architecture/**/*.md`, `docs/design/**/*.md`, `docs/adr/**/*.md`, `adr/**/*.md`, `docs/**/*ARCHITECTURE*.md`, `docs/**/*DESIGN*.md` |
| default legacy prefixes | the repository's own block | `docs/archive/**` |
| GOVERNANCE_INDEX registration, competing index, README off-ramp, legacy-prefix existence, dual registration | on | off |

The core does not name `docs/` or `docs/ARCHITECTURE_INDEX.md`; the two profiles are built in `FailSafe/extension/scripts/lib/architecture-index-profiles.cjs`. The CLI keeps its behaviour by passing the FailSafe-repo profile and re-exports the old entry points, so existing `require`s keep working. Parity rows in `architecture-index.test.cjs` run the fixtures through the user-repo profile, including one whose index is not under `docs/`.

Extension code reaches the core through `FailSafe/extension/src/governance/architecture/architectureIndexCore.ts`, which `require`s the `.cjs` (esbuild inlines it) and declares local interfaces. The file list comes from the trusted git resolver (`trustedGitPath(root)`, argv, no shell): `git ls-files -z -co --exclude-standard`, with a timeout and a buffer cap, deduped and filtered to files that exist on disk (`-c` also lists tracked files that were deleted). Untracked documents are therefore visible. **Ignored directories stay invisible**: a document under a folder `.gitignore` excludes is never listed, never proposed and never warned about.

### LD3: discovery

`ArchitectureIndexDiscovery.ts` returns a snapshot. A missing workspace or git yields a typed state, never a throw.

| State | Meaning |
|---|---|
| `present` | the index parses and validation reports zero problems |
| `present-with-problems` | it parses and validation reports problems |
| `invalid` | the registry or a fenced block cannot be parsed (`missing-section`, or `bad-row` on the header) |
| `absent` | no file at the index path and no index elsewhere |
| `present-elsewhere` | no file at the index path, but a default-glob match carries a registry header or an `architecture-normative` block |
| `bad-index-path` | the setting is absolute, escapes the workspace, or resolves outside it |
| `no-git` | no trusted git executable |
| `not-a-repo` | git ran and the folder is not a repository |
| `no-workspace` | no workspace folder is open |

The snapshot carries the index path, parsed rows, problems (user-repo profile), unregistered candidate documents each with `suggestFor` suggestions, and `checkedAt`. When the index is absent, candidates are still listed from the default globs, with suggestions computed against the other candidates, so the operator sees overlapping documents before bootstrapping. **Present-elsewhere detection only looks at default-glob matches**; an index stored under a name no default glob matches is reported as `absent`. Migration from another location is not in this slice; the view points the operator at the `failsafe.architecture.indexPath` setting.

### LD4: routes

| Route | Guard | Effect |
|---|---|---|
| `GET /api/v1/architecture/index` | `rejectIfRemote`, rate limit (60 a minute) | the snapshot plus the ledger state; read-only |
| `POST /api/actions/architecture-index/bootstrap` `{mode:'create'}` | `rejectIfRemote`, rate limit (5 a minute), modal confirmation | creates the index once, never overwriting |
| `POST /api/actions/architecture-index/propose` `{path, action, supersededBy?}` | `rejectIfRemote`, rate limit (10 a minute) | a `PROPOSAL` ledger entry, then one L3 queue item; writes no file |
| `POST /api/actions/architecture-index/open` `{path}` | `rejectIfRemote`, rate limit (30 a minute), snapshot and containment check | opens the document in the editor ("Use existing"); writes nothing |

Bootstrap runs only from state `absent`:

- Index-present states (`present`, `present-with-problems`, `invalid`, `present-elsewhere`) answer `409 {reuse: <path>}` and write nothing. This is "existing index reuse".
- `no-git`, `not-a-repo`, `no-workspace` and `bad-index-path` answer `422 {refused: <state>}`.
- Otherwise the skeleton bytes are built first, then the operator confirms a modal dialog that names the path and the proposed rows (capped like the L3 batch dialog). Declined or busy maps through `confirmationFailure` to `{confirmation}`.
- Before writing, the deepest existing ancestor of the target folder is realpathed and must be inside the realpathed workspace root; the folder is created; its realpath is checked again; then the prepared bytes are written with exclusive create (`wx`). A file that appeared in between is never overwritten: `409 {exists:'appeared'}`, nothing written.
- The three 409 bodies are distinct: `{confirmation}`, `{reuse}`, `{exists:'appeared'}`.

The skeleton holds the registry header, a self-row for the index (`canonical`, domain `architecture navigation`, owner and `updated_by` set), one `proposed` row per candidate (non-empty domain, owner and `updated_by`; id slugified from the path with collisions suffixed; link relative to `linkBase`, so a root-level `ARCHITECTURE.md` under a `docs/` index becomes `../ARCHITECTURE.md`), the user-repo default blocks and a scope note. A freshly bootstrapped index validates as `present` with zero problems under the user-repo profile, provided its folder is not ignored.

After a successful create, a `PROPOSAL` ledger entry (agentDid `did:failsafe:agent:architecture-index`, `agentTrust` 0, payload `{kind:'architecture-index-bootstrap', path, sourceSha, docSha256}`) is appended only when the ledger is available. `docSha256` is the hash of the written buffer. `sourceSha` is `git rev-parse --verify --quiet HEAD` through the trusted resolver; on an unborn repository it is `null` with reason `unborn`. When the ledger is unavailable (no manager, disabled, or a stub entry) the file is still written and the result says `ledger:'unavailable'`.

Propose answers `409 {state}` unless the index is `present` or `present-with-problems`. It validates `path` against the server-side snapshot (an unregistered candidate for `register`; a candidate or a registered row for `supersede`) and `supersededBy` as a registered row id. `sourceSha`, `docSha256` and `suggestions` are computed server-side, never taken from the body. When the ledger is unavailable, propose answers `503 {ledger:'unavailable'}` and **queues nothing**: an L3 item without a ledger could never be decided, because `processL3Decision` writes the decision to the ledger. Otherwise it appends the `PROPOSAL` entry and queues an L3 item of kind `architecture-doc-proposal` or `architecture-doc-supersede` with that entry's id as `sourceLedgerEntryId`, so the `L3_QUEUED` and later `L3_APPROVED`/`L3_REJECTED` entries link back by id. A `PROPOSAL`-sourced id is not projected as an audit resolution (`AuditResolutionProjector` projects `AUDIT_FAIL` sources only).

Open accepts a path the snapshot names (a candidate, a registered document or a suggestion) that resolves inside the workspace, and passes the absolute path to the editor-open dependency bootstrapBicameral already wires (`vscode.open`); nothing is written.

**"Unavailable Qor" in #531 is mapped to FailSafe's ledger being unavailable.** Discovery and the view work without it. Showing the Qor-logic package install state in this view is a BACKLOG residual.

### LD5: command

`failsafe.architecture.bootstrapIndex` ("FailSafe: Bootstrap Architecture Index") runs the same bootstrap function through the same confirmer (one busy guard shared with the Console routes) and the same exclusive create, and returns the typed result (`status`, `path`, `docSha256`, ledger entry id or `'unavailable'`).

### LD6: Command Center view

A Workspace sub-view **Architecture** renders from `GET /api/v1/architecture/index`: the state and index path, rows grouped by status, problems with their codes, unregistered candidates with their suggestions and two actions ("Use existing: open <suggestion>" and "Propose registration", with the ledger state shown), "Bootstrap index" only in state `absent`, a refresh button, and a refresh whenever the sub-view is shown. Every string from a document is rendered as text, never as HTML. A fixed scope line reads:

> FailSafe records the writes it makes here after your confirmation and never overwrites a file. Documents written by editors, agents or other tools are found when this view refreshes; FailSafe cannot block them.

## Enforceable and advisory

| Seam | Kind | What holds |
|---|---|---|
| Index creation by the route or the command | enforceable | modal confirmation, containment check, exclusive create; the written bytes are hashed and ledgered when the ledger is available |
| Proposal of a document | enforceable (record only) | a `PROPOSAL` ledger entry and an L3 item; the decision is recorded; no file is written on approval |
| Opening a suggested document | enforceable (read only) | the path must be in the server-side snapshot and inside the workspace |
| Documents written by editors, agents, other extensions or the shell | advisory | found on the next refresh as unregistered candidates; FailSafe cannot block or undo them |
| Documents in ignored folders | not covered | invisible to discovery |
| Overlap between documents | advisory | string comparison and token suggestions only; never a claim of semantic equivalence |
| Edits to the index itself | advisory | re-validated on refresh; FailSafe never rewrites the index |

Nothing in this slice sends repository content off the machine.

## Disclosed side effects

- **Trust update.** Deciding an architecture proposal runs `processL3Decision`, which calls `trustEngine.updateTrust` for `did:failsafe:agent:architecture-index`. The DID is auto-registered on first decision and its score moves on every approval or rejection.
- **L3 SLA expiry.** An undecided proposal expires after the L3 SLA (`failsafe.qorelogic.l3SLA`, default 120 s) and leaves no ledger entry. The document stays listed as unregistered and can be proposed again.
- **`l3Decided` checkpoint.** Every `qorelogic.l3Decided` event writes an `override.approved` checkpoint with `policyVerdict: "PASS"` (`EventSubscriptionManager.ts`), including REJECTED and EXPIRED decisions. A rejected or expired architecture proposal therefore leaves that checkpoint. Filed in BACKLOG.
- **Ignored directories are invisible** (LD2).
- **Overlap is string-only** (LD2, LD3).
- **Orphaned proposal entry.** If queueing the L3 item fails after the `PROPOSAL` entry is appended, the route answers 500 and that entry has no L3 item; the document stays unregistered and can be proposed again. Filed in BACKLOG.

## Scenario map (#531 acceptance)

| Scenario | Where it is shown |
|---|---|
| New repository bootstrap | bootstrap create; route test; extension-host test |
| Existing index reuse | `409 {reuse}`; route test; extension-host second run |
| Duplicate document proposal | candidate with suggestions; propose route test; Playwright |
| Supersession | propose `supersede`; route test |
| Agent-created architecture file | untracked candidate found on refresh; discovery test (advisory) |
| Unavailable Qor | ledger-unavailable bootstrap and propose rows in the route test; discovery runs without the ledger |
| Recovery with no silent rewrites | exclusive-create race row in the route test; extension-host second run byte-identical |
| Tests and installed VS Code UI | extension-host configuration, Playwright, the installed-package check |

Not in this slice (BACKLOG): `update-doc` events, architecture decision links beyond `governance_ref`, a stale-document display, opt-in migration from another index location, and the Qor-logic install state in the view.

## Consequences

- One validator implementation serves the repository gate and the product feature; a change to a check changes both, and the parity rows hold the user-repo profile to it.
- Approval of a proposal records a decision and nothing else. The operator edits the index by hand; FailSafe re-validates it on the next refresh.
- An operator whose index lives elsewhere sets `failsafe.architecture.indexPath`; FailSafe does not move or copy it.
