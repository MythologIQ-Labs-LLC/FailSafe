# Integration scenarios and the local relationship graph

Status: canonical for the integration scenario and relationship-graph specification (registry row `integration-scenarios`, #532 part A). Recorded against main `c36b9ee2`.

This document specifies three vertical product scenarios and the local-first relationship graph they need. **Nothing in it is claimed as built.** Where a step already exists on main it carries a citation in the grammar of `docs/architecture/INTEGRATION_PORTFOLIO.md`; every other step is proposed. Part B of #532 (a separate plan) builds the first scenario as a vertical slice. The per-integration contracts in `docs/architecture/integrations/` are the authority for what each integration does today.

## Scenario 1: issue to architecture to code to policy to receipt (the part B slice)

A developer picks up a tracker issue, does the work under governance and ends with a receipt that ties the shipped commit back to the issue and the design it implements.

| Step | User action | Artifact at this step | On main | Measurable acceptance |
|---|---|---|---|---|
| 1 | Import a Jira or Linear issue, review the preview, approve | One intent draft with provenance (source, key, URL, fetch time, content hash) | Exists: `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:208` (`export async function reviewAndImport(`) | After one approval exactly one intent exists with `externalRef` `<source>:<key>` and a `contentSha256` |
| 2 | Link the intent to the architecture document it implements | An `implements` edge from the intent to a registered architecture document | Proposed. The managed index can propose and register documents `FailSafe/extension/src/roadmap/routes/ArchitectureIndexRoute.ts:162` (`/api/actions/architecture-index/propose`), but nothing links an intent to one (main only, not in v6.0.8) | The edge exists only after the user picks the document; zero edges are created without a user action |
| 3 | Make the change (editor, or an agent run in a disposable worktree) and commit through the governed commit | A commit on a branch, optionally a pull request | Exists in part: the governed commit `FailSafe/extension/src/extension/governedCommit.ts:75` (`export async function commitPushOpenPr(`); the commit is not linked to the intent (proposed) | The commit SHA is recorded on the intent's edge set, with the commit's tree hash as the source hash |
| 4 | Governance evaluates the change | A policy verdict (PASS, WARN, VETO) or an L3 approval | Exists as FailSafe's governance engine; which verdict applies to which commit is not linked (proposed) | Every verdict edge names the commit SHA it evaluated; a verdict for another SHA is never attached |
| 5 | Seal and issue a receipt for the Seal commit | A signed SHIELD receipt for HEAD | The issuer exists `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:157` (`export async function issueShieldReceipt(`); no command or route calls it outside tests (see the shield-receipts contract) | The receipt's commit SHA equals the sealed HEAD, and the graph path issue -> intent -> commit -> verdict -> receipt resolves with no inferred edge |

## Scenario 2: production Sentry error to risk to fix to receipt

A production error becomes a governed risk, the fix is tied to it, and the receipt shows the risk was addressed by a governed change.

| Step | User action | Artifact at this step | On main | Measurable acceptance |
|---|---|---|---|---|
| 1 | Run the Sentry import | Risk records with Sentry provenance (project, environment, short id, first and last seen, optional release) | Exists: `FailSafe/extension/src/integrations/sentry/sentry-to-risk.ts:76-81` (`const provenance: Record<string, unknown> = { tool: 'sentry' };`) | A re-run produces the same risk ids (idempotent), as the conformance suite requires `FailSafe/extension/src/test/integrations/conformance/contracts.ts:71` (`a re-run produced different ids (not idempotent)`) |
| 2 | Choose to fix a risk | An intent whose `addresses` edge points at the risk | Proposed | The edge exists only after the user starts the intent from the risk |
| 3 | Commit the fix through the governed commit | A commit linked to the intent | Exists in part (as scenario 1 step 3); the link is proposed | As scenario 1 step 3 |
| 4 | Seal and issue a receipt | A receipt whose graph path reaches the risk | Proposed (as scenario 1 step 5) | The path risk -> intent -> commit -> receipt resolves; the risk is marked addressed only by that path, never by time proximity |

## Scenario 3: agent run to evidence to governance

An agent's run becomes reviewable evidence, and governance decisions about it are recorded against that evidence.

| Step | User action | Artifact at this step | On main | Measurable acceptance |
|---|---|---|---|---|
| 1 | Run Continue or Aider through FailSafe in a disposable worktree, or import an exported OpenHands run | A quarantined change set, or imported timeline evidence | Exists: applying a quarantined change set `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:74` (`export async function applyQuarantined(`); the timeline service `FailSafe/extension/src/sentinel/AgentTimelineService.ts:162` (`export class AgentTimelineService {`) | Nothing reaches the workspace until the user applies it; an imported run is deduplicated |
| 2 | Review the evidence | A `produced-by` edge from the change set to the run | Proposed | Each change set has exactly one run edge, created when the run is recorded |
| 3 | Approve, reject or escalate | A governance decision (verdict or L3) attached to the change set | Proposed as a graph edge; FailSafe's L3 queue exists but is not linked to agent runs | Every decision edge names the change set hash it decided |

## Local-first relationship graph (specification, not built)

The graph is a local store in the workspace. It is never synchronized to a third party, and building it sends no repository content anywhere.

### Nodes

Each node has a type, a stable local id and the provenance of the record it came from.

| Type | Identity | Provenance kept |
|---|---|---|
| `issue` | `<source>:<key>` (for example `jira:PROJ-123`) | source, URL, fetch time, source updated time, content hash |
| `risk` | the risk id (for example `sentry:<issue id>`) | tool, project, environment, first and last seen, release |
| `intent` | the intent id | creation time, the CREATED history entry |
| `architecture-doc` | the registry id and path | document hash at link time |
| `commit` | the commit SHA | tree hash, branch |
| `verdict` | the verdict or ledger entry id | the evaluated SHA, time |
| `receipt` | the receipt digest | the commit SHA it covers |
| `agent-run` | the run id | agent, version, start and end time, change-set hash |

### Edges

| Edge | From -> to | Created by |
|---|---|---|
| `drafted-from` | intent -> issue | the approved import (step 1 of scenario 1) |
| `implements` | intent -> architecture-doc | a user pick |
| `addresses` | intent -> risk | a user starting the intent from the risk |
| `committed-under` | commit -> intent | the governed commit, when the user commits under the active intent |
| `evaluated` | verdict -> commit | a recorded governance event naming the SHA |
| `covers` | receipt -> commit | receipt issuance |
| `produced-by` | change set -> agent-run | the run recorder |

Every edge stores its provenance: the source that created it, the source hash of both endpoints at creation time, and the creation time.

### Identity resolution

- An external record is identified by `<source>:<native key>`; the same key from the same source is the same node, whatever its title.
- A changed source hash does not create a new node; it marks the node's edges stale until the user reviews them.
- Two sources are never merged by similar text. A link between, say, a Jira issue and a Linear issue exists only when the user makes it.
- A commit is identified by SHA only; branch names and messages are attributes, not identity.

### Expiry

- An edge whose endpoint's source hash changed is `stale`, not deleted; the user confirms or removes it.
- An external node not refreshed within a configurable age (default proposed: 30 days) is shown as stale; nothing is deleted automatically.
- Removing an intent or a risk removes only its own edges; external nodes it pointed at stay until nothing points at them.

### Causality is never inferred

An edge exists only when a user action or a recorded event creates it. Time proximity, matching words, the same author, the same file or an agent's suggestion never create an edge. A proposed edge is shown as a suggestion and becomes an edge only when the user accepts it, and the acceptance is the recorded event.
