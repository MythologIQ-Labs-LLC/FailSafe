# Managed Architecture Index (ADR, #531)

**Status:** accepted for the first vertical slice (plan `plan-531-architecture-governance.md`, audit PASS at iteration 2); amended for the second slice, architecture authority (plan `plan-531b-architecture-authority.md`, audit PASS at iteration 3; LD7-LD10).
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
| `GET /api/v1/architecture/index` | `rejectIfRemote`, rate limit (60 a minute) | the snapshot plus the ledger state and, since slice 2, the authority findings (LD7); read-only |
| `POST /api/actions/architecture-index/bootstrap` `{mode:'create'}` | `rejectIfRemote`, rate limit (5 a minute), modal confirmation | creates the index once, never overwriting |
| `POST /api/actions/architecture-index/propose` `{path, action:'register', domain, status, supersedes?}` or `{path, action:'supersede', supersededBy}` | Console request guard (since slice 2), rate limit (10 a minute); a modal confirmation for every supersession (LD10) | a `PROPOSAL` ledger entry, then one L3 queue item; writes no file; refused as in LD8 and LD9 |
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

### LD7: authority findings (slice 2)

`FailSafe/extension/src/governance/architecture/architectureAuthority.ts` reads the discovery snapshot and reports, in a fixed order, where authority for a domain is contradicted or missing:

| Kind | Meaning |
|---|---|
| `conflicting-canonical` | two or more `canonical` rows share a domain key (`domain` trimmed and lower-cased, as the validator compares it) |
| `canonical-missing` | a `canonical` row's document is not on disk, exists but is not listed by git (ignored), resolves outside the workspace, is over 2 MiB, or has no safe link |
| `dangling-supersession` | `supersedes` names an id that is not registered, a `superseded` row has no successor, or `supersedes` forms a cycle |
| `domain-hidden-characters` | a domain cell holds control, format or separator characters, a run of spaces, or a form that is not NFC |
| `domain-non-ascii` | a domain cell holds characters outside `A-Z a-z 0-9 space . _ / & ( ) -`; it may look like another domain |
| `unregistered-normative` | a document matches a normative glob and has no row (with its glob, its hash and advisory string suggestions) |

Findings are built from the validator's structured problem fields (the core now attaches `ids`, `domain`, `field`, `ref`, `path` and `glob` to its problems, and the 1-based `line` to each row; the CLI's output is unchanged) and from the rows, never from problem text. Every row reference carries its index line, its document state and the SHA-256 of its bytes. The report's provenance names the index path, the SHA-256 of the index file's bytes, HEAD and the time of the check. The same inputs give the same output apart from that time. `GET /api/v1/architecture/index` returns the report as `authority`; the view shows it with the fixed scope line:

> FailSafe compares the registry's declared domains, statuses, links and supersedes lists as written. It does not judge whether two documents, or two domain names, mean the same thing. A canonical document's domain and every new domain must use plain ASCII letters, digits, spaces and . _ / & ( ) -; a non-ASCII domain already in the index can be reused only for proposed, descriptive or historical documents, typed exactly, and is shown with its code points. Edits made outside FailSafe are found when this view refreshes.

The findings are advisory: an index edited by hand into conflict is shown, never repaired.

### LD8: registration intent and competing authority (slice 2)

A registration now states what it claims: `{path, action:'register', domain, status, supersedes?}` with `status` one of `canonical`, `proposed`, `descriptive` or `historical`. **Authority is `canonical` only.** A `proposed` row neither blocks a registration nor is blocked by one; `supersedes` is accepted only on a `canonical` registration.

- **Domain intake.** Every requested domain is refused (400) when it holds control, format or separator characters other than U+0020, a run of spaces, a leading or trailing space, or a form that is not NFC. A `canonical` registration and every supersession must use the plain ASCII intake characters above, with no exception, even when the domain is already in the index byte for byte. A `proposed`, `descriptive` or `historical` registration may also reuse a registered domain cell exactly as written; its L3 summary then shows every other code point as `[U+XXXX]`, ahead of the path. The value is recorded exactly as received.
- **Competing canonical.** A `canonical` registration for a domain key that already has canonical rows is refused (`409 {conflict:'canonical-exists'}`, with the existing rows and their lines, the rows it fails to name, and the alternatives "use the existing document", "register as descriptive" and "supersede") unless `supersedes` names every one of those rows.
- **Ambiguous index** (`409 {conflict:'ambiguous-authority'}`): while any `canonical` row in the index has a domain outside the intake characters (`reason:'non-ascii-domain'`) or with hidden characters (`reason:'hidden-character-domain'`, for example a double space), every `canonical` registration and every supersession is refused, and the refusal lists the offending rows with their lines and both exits: rename the domain in the index to plain ASCII, or change the row's status from canonical. A row with a status the validator does not know (`bad-status`, for example `Canonical`) in the domain, or, for a supersession, a duplicated id (`duplicate-id`), is refused the same way. While any registry row cannot be read (`reason:'bad-row'`: the wrong number of cells, or a line of the table that holds a `|` but does not start with one), it could hold a canonical document, so the same refusal applies workspace-wide; it lists the lines and the exit, fix the row. Descriptive, proposed and historical registrations stay allowed while such a row exists. A registry whose delimiter row is missing, malformed or not directly after the header makes the index `invalid`, so nothing can be proposed until it is fixed. Fenced blocks inside the Registry section are examples and are not parsed as rows. These parser rules live in the shared core, so the repository check applies them too; this repository's own index passes unchanged. A canonical row with an empty domain (`''` or `-`) is refused the same way (`reason:'empty-domain'`). A key comparison cannot see look-alikes, so FailSafe refuses rather than guesses.
- **Supersede action.** `{path, action:'supersede', supersededBy}` keeps its meaning and is refused (400) when the superseded or the successor row's domain is outside the intake characters or has hidden characters.
- **Row ids.** A supersession that names a row id with hidden characters (in `supersedes`, as the superseded row or as the successor) is refused (400). Every other row id that reaches a person (the refusal text, the L3 summary, the supersession dialog, the view's finding rows) shows each code point outside the intake characters as `[U+XXXX]`.
- **Large documents.** A proposal whose document, or (for a supersession) any replaced or successor document, is over 2 MiB is refused (400, "document too large to hash for freshness"): FailSafe could not re-check it before recording.

**Internationalisation consequence.** A repository whose canonical domains are written in a non-Latin script cannot register or supersede canonical documents through FailSafe until each such domain is renamed to plain ASCII or its row stops being canonical. Descriptive, proposed and historical documents can still be registered with those domains, discovery and the view keep working, and FailSafe never edits the index. This is the cost of refusing look-alike domains rather than guessing.

### LD9: pending authority (slice 2)

A `canonical` registration, or a supersession, is also refused (`409 {conflict:'pending-authority', pending:[approval ids], approvedNotInIndex:[{entryId, path}]}`) when an earlier architecture proposal holds the same authority:

- it is in the L3 queue in any state other than REJECTED or EXPIRED, and claims `canonical` for the same domain key or supersedes the same row (by id or path); or
- it was approved (an `L3_APPROVED` ledger entry whose `sourceLedgerEntryId` names its `PROPOSAL`) and the index does not reflect it yet. A registration is reflected when the index has a row for its path; a supersession when every row it supersedes is gone or no longer canonical.

The queue is read through the existing read-only getter; the ledger through every `L3_APPROVED` entry (no limit), filtered to the architecture agent. With no queue reader, or a reader or ledger read that throws, the route answers `503 {pending:'unknown'}`: it refuses rather than guesses. The check runs before any dialog and again under a per-workspace lock that also covers the append and the queueing, released in `finally`, so two concurrent proposals cannot both be queued and a throw never wedges later ones.

- An approved registration that is never applied keeps its domain blocked. The 409 says how to resolve it: add a row for its path to the index by hand (any status) to apply it or set it aside. FailSafe never edits the index.
- An approved supersession whose superseded rows are still canonical blocks the same way. The 409 and the view name those ids: change them from canonical in the index by hand (for example to superseded).
- An applied registration whose row is later removed or renamed by hand blocks again, for the same reason.
- Slice 1 proposals and queue items carry no domain, so they can block only by the path they supersede.

### LD10: supersession confirmation and freshness (slice 2)

Every supersession proposal (a `canonical` registration with `supersedes`, or the supersede action) runs the bound confirmation of #538: a fresh operation id, a frozen server-built operation, one modal "Propose this architecture supersession?" and a 2-minute deadline. The dialog shows the operation id, the domain and status as requested, each replaced row with its path, line and hash, the successor, the proposed or superseded document in full (up to 1024 characters, the same limit the route records; longer paths are refused), HEAD and the index hash. Declined, busy, unwired, expired and cancelled confirmations record nothing.

Before recording any proposal, the route re-reads the workspace under the lock and answers `409 {stale}`, recording nothing, when the index can no longer take proposals (`state`), the index bytes changed (`index`), a document in the operation changed (`document`) or HEAD moved (`head`). The `PROPOSAL` entry records the domain, status, `supersedes`, the existing authority rows with their lines and hashes, the index hash, HEAD and, for a confirmed supersession, the operation id and `authentication` (`vscode-modal-confirmation`, with what it proves). The L3 item's summary leads with the authority facts. Approving the L3 item is the second human gate; it records the decision and edits nothing.

## Enforceable and advisory

| Seam | Kind | What holds |
|---|---|---|
| Index creation by the route or the command | enforceable | modal confirmation, containment check, exclusive create; the written bytes are hashed and ledgered when the ledger is available |
| Proposal of a document | enforceable (record only) | a `PROPOSAL` ledger entry and an L3 item; the decision is recorded; no file is written on approval |
| Opening a suggested document | enforceable (read only) | the path must be in the server-side snapshot and inside the workspace |
| Documents written by editors, agents, other extensions or the shell | advisory | found on the next refresh as unregistered candidates; FailSafe cannot block or undo them |
| Competing canonical authority through the propose route (slice 2) | enforceable (record only) | a canonical registration is refused when the index already holds a canonical row for its domain key; when an earlier canonical proposal or supersession for it is in the L3 queue (not rejected or expired); when one was approved and is not yet in the index (every `L3_APPROVED` entry is read); when the requested domain fails intake; while any canonical row has a non-ASCII or hidden-character domain; or while any registry row has the wrong number of cells. With no readable queue it is refused as unknown. Nothing is recorded or queued |
| Supersession through the propose route (slice 2) | enforceable (record only) | a modal confirmation of server-built facts, then a check of state, index, documents and HEAD under the lock; the ledger entry records the operation id, HEAD and the hashes |
| Hand edits that create conflicting, missing, dangling, hidden-character or non-ASCII authority | advisory | shown as authority findings with lines and hashes; FailSafe never rewrites the index |
| Domain naming | advisory | domains are compared as declared strings (trimmed, lower-cased); FailSafe does not decide that two names mean the same thing |
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
- **Reading the L3 queue (slice 2).** Pending authority reads the queue through the existing getter, which first expires items of any kind past their SLA, as every hub read already does: it persists the queue and emits `qorelogic.l3Decided` EXPIRED for each, which writes an `override.approved` PASS checkpoint (B257), refreshes the hub, appends a transparency event, reaches the Bicameral drift and Open Design handlers, and is announced to Slack or Teams when those are configured. That notice is the only off-machine effect this slice can trigger.
- **Approved but not applied (slice 2).** An approved canonical registration that nobody adds to the index keeps its domain blocked until the index is edited by hand, and an applied one whose row is later removed or renamed blocks again (LD9).
- **Non-ASCII canonical domains (slice 2).** While any canonical row has a domain outside the intake characters, canonical registrations and supersessions are refused workspace-wide until the domain is renamed or the row stops being canonical (LD8).
- **The proposal lock has no timeout.** Appends and queueing for one workspace run under one in-process lock. A timeout could let two appends interleave, so there is none: an append or queue write that never settles holds the lock, and later proposals wait, until the extension host reloads.
- **Shared ledger path.** Approvals are read from the FailSafe ledger by domain key. If `failsafe.qorelogic.ledgerPath` is an absolute path shared by several workspaces, another workspace's approved canonical proposal can block a domain of the same name here.
- **Path truncation in the L3 decision dialog.** The L3 decision dialog (unchanged by this slice) shows at most 200 characters of the file path and of the summary; the supersession dialog and the ledger entry carry the full path.

## Scenario map (#531 acceptance)

| Scenario | Where it is shown |
|---|---|
| New repository bootstrap | bootstrap create; route test; extension-host test |
| Existing index reuse | `409 {reuse}`; route test; extension-host second run |
| Duplicate document proposal | candidate with suggestions; propose route test; Playwright |
| Supersession | propose `supersede`, or a canonical registration naming every canonical row; a modal confirmation and a freshness check (slice 2); route, extension-host and Playwright tests |
| Conflicting authority (slice 2) | authority findings with lines and hashes; competing and pending canonical registrations refused; route, extension-host, jsdom and Playwright tests |
| Agent-created architecture file | untracked candidate found on refresh; discovery test (advisory) |
| Unavailable Qor | ledger-unavailable bootstrap and propose rows in the route test; discovery runs without the ledger |
| Recovery with no silent rewrites | exclusive-create race row in the route test; extension-host second run byte-identical |
| Tests and installed VS Code UI | extension-host configuration, Playwright, the installed-package check |

Not in these slices (BACKLOG): `update-doc` events, architecture decision links beyond `governance_ref` (B253, B312), a stale-document display, opt-in migration from another index location, the Qor-logic install state in the view, affected decisions at the L3 and commit seams (B311), and the remaining slice 2 residuals B313-B316.

## Consequences

- One validator implementation serves the repository gate and the product feature; a change to a check changes both, and the parity rows hold the user-repo profile to it.
- Approval of a proposal records a decision and nothing else. The operator edits the index by hand; FailSafe re-validates it on the next refresh.
- An operator whose index lives elsewhere sets `failsafe.architecture.indexPath`; FailSafe does not move or copy it.
